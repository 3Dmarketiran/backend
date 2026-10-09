import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";
import {
  upsertFile,
  deleteFile,
  dispatchPublicSiteBuildAndWait,
  verifyPublicDeployment,
} from "./githubService";
import { publishQueue } from "./publishQueue";
import {
  assertSellerCanPublish,
} from "./productService";
import { millimetersToMeters } from "../utils/dimensions";
import { HttpError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { parsePackageStorageKey, packageAssetUrl } from "./productPackageService";
import {
  parseJson,
  serializeJson,
} from "../utils/json";

const PUBLIC_DATA_DIR =
  "public-data";

function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Enqueues a publish job for one product.
 *
 * QUEUED -> PROCESSING -> SUCCESS | FAILED
 */
export async function requestPublish(
  productId: string,
  triggeredByUserId: string
) {
  const product =
    await prisma.product.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        sellerId: true,
        visibility: true,
        widthMm: true,
        heightMm: true,
        depthMm: true,
        models: { select: { kind: true } },
      },
    });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  await assertSellerCanPublish(product.sellerId);

  const activeJob = await prisma.publishJob.findFirst({
    where: { productId: product.id, status: { in: ["QUEUED", "PROCESSING"] } },
    select: { id: true },
  });
  if (activeJob) {
    throw new HttpError(409, "برای این محصول یک عملیات انتشار در حال انجام است.");
  }

  if (product.models.length > 0) {
    const dimensionsAreComplete =
      Number.isFinite(product.widthMm) && product.widthMm! > 0 &&
      Number.isFinite(product.heightMm) && product.heightMm! > 0 &&
      Number.isFinite(product.depthMm) && product.depthMm! > 0;

    if (!dimensionsAreComplete) {
      throw new HttpError(
        400,
        "برای انتشار محصول دارای 3D/AR باید عرض، ارتفاع و عمق واقعی محصول کامل و بزرگ‌تر از صفر ثبت شده باشد."
      );
    }
  }

  // Mark the product as pending publication before queueing. The public API
  // excludes hasUnpublishedChanges=true, so edited/new data cannot become
  // visible before the static snapshot is actually deployed.
  let job: Awaited<ReturnType<typeof prisma.publishJob.create>>;
  try {
    // Cloudflare D1 does not support Prisma interactive transactions.
    // Use Prisma's array/batch transaction API instead.
    const [, createdJob] = await prisma.$transaction([
      prisma.product.update({
        where: { id: product.id },
        data: { visibility: "PUBLISHED", hasUnpublishedChanges: true },
      }),
      prisma.publishJob.create({
        data: {
          sellerId: product.sellerId,
          productId: product.id,
          triggeredById: triggeredByUserId,
          status: "QUEUED",
          operation: "PUBLISH",
        },
      }),
    ]);
    job = createdJob;
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw new HttpError(409, "برای این محصول یک عملیات انتشار در حال انجام است.");
    }
    throw error;
  }

  publishQueue.enqueue(() =>
    processPublishJob(job.id)
  );

  return job;
}

/**
 * Requests that a product be removed from the public catalog.
 *
 * The product remains in the database and becomes HIDDEN.
 * The publish worker then regenerates the public catalog.
 */
export async function requestUnpublish(
  productId: string,
  triggeredByUserId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sellerId: true, visibility: true },
  });

  if (!product) {
    throw new HttpError(404, "محصول یافت نشد.");
  }

  const activeJob = await prisma.publishJob.findFirst({
    where: { productId, status: { in: ["QUEUED", "PROCESSING"] } },
    select: { id: true },
  });
  if (activeJob) {
    throw new HttpError(409, "برای این محصول یک عملیات انتشار در حال انجام است.");
  }

  const lastFailed = await prisma.publishJob.findFirst({
    where: { productId, status: "FAILED", operation: "UNPUBLISH" },
    orderBy: { finishedAt: "desc" },
    select: { id: true },
  });

  // A failed unpublish leaves the DB hidden while the old GitHub snapshot may
  // still contain the product. Allow the same endpoint to retry that cleanup.
  if (product.visibility === "HIDDEN" && !lastFailed) {
    throw new HttpError(409, "این محصول در حال حاضر از سایت عمومی مخفی است.");
  }

  let job: Awaited<ReturnType<typeof prisma.publishJob.create>>;
  try {
    // Cloudflare D1 does not support Prisma interactive transactions.
    // Use Prisma's array/batch transaction API instead.
    const [, createdJob] = await prisma.$transaction([
      prisma.product.update({
        where: { id: productId },
        data: { visibility: "HIDDEN", hasUnpublishedChanges: false },
      }),
      prisma.publishJob.create({
        data: {
          sellerId: product.sellerId,
          productId: product.id,
          triggeredById: triggeredByUserId,
          status: "QUEUED",
          operation: "UNPUBLISH",
        },
      }),
    ]);
    job = createdJob;
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      throw new HttpError(409, "برای این محصول یک عملیات انتشار در حال انجام است.");
    }
    throw error;
  }

  publishQueue.enqueue(() => processPublishJob(job.id));
  return job;
}

/**
 * Writes a log entry for a publish job.
 */
async function log(
  jobId: string,
  message: string,
  level:
    | "info"
    | "warn"
    | "error" = "info"
) {
  try {
    await prisma.publishLog.create({
      data: {
        publishJobId:
          jobId,

        message,

        level,
      },
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        jobId,
      },
      "failed to write publish log"
    );
  }
}

/**
 * Processes one publish job.
 *
 * The worker creates a complete public snapshot from the current
 * database state and writes the generated JSON files to GitHub.
 *
 * Binary assets are NOT committed into the Git repository.
 * Asset URLs remain controlled by the configured storage provider.
 */
async function processPublishJob(
  jobId: string
) {
  const startedAt =
    new Date();
  let publicDeploymentVerified = false;
  let verifiedProductId: string | null = null;
  let verifiedOperation: string | null = null;
  let verifiedExpectedProductPresent: boolean | null = null;
  let verifiedSnapshotCapturedAt: Date | null = null;

  try {
    const claim = await prisma.publishJob.updateMany({
      where: { id: jobId, status: "QUEUED" },
      data: { status: "PROCESSING", startedAt, errorMessage: null },
    });
    if (claim.count !== 1) return;

    await log(
      jobId,
      "شروع پردازش انتشار..."
    );

    const [
      products,
      sellers,
      settings,
      plans,
      planCategories,
    ] = await Promise.all([
      getPublicProducts(jobId),

      getPublicSellers(),

      prisma.platformSetting.findUnique({
        where: {
          id: "singleton",
        },
      }),

      prisma.subscriptionPlan.findMany({
        where: { isActive: true, isPublic: true },
        include: { category: true },
        orderBy: [{ sortOrder: "asc" }, { durationDays: "asc" }],
      }),
      prisma.subscriptionPlanCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const snapshotCapturedAt = new Date();
    let expectedProductPresent: boolean | null = null;

    await log(
      jobId,
      `تولید داده استاتیک: ${products.length} محصول و ${sellers.length} فروشنده.`
    );

    // Never report a successful publish if the requested product was filtered
    // out of the public snapshot. This turns a silent storefront disappearance
    // into an actionable failed job instead of a misleading success state.
    // Use one timestamp for subscription eligibility checks in this publish job.
    const now = new Date();

    const requestedJob = await prisma.publishJob.findUnique({
      where: { id: jobId },
      select: { productId: true, operation: true },
    });
    if (requestedJob?.productId) {
      const requestedProduct = await prisma.product.findUnique({
        where: { id: requestedJob.productId },
        select: {
          id: true,
          slug: true,
          visibility: true,
          hasUnpublishedChanges: true,
          seller: {
            select: {
              isActive: true,
              subscriptions: {
                where: { status: "ACTIVE", startDate: { lte: now }, endDate: { gte: now }, plan: { is: { isActive: true } } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      const isInSnapshot = products.some((item) => item.id === requestedJob.productId);
      expectedProductPresent = requestedProduct ? requestedProduct.visibility !== "HIDDEN" : null;
      if (requestedProduct && requestedProduct.visibility !== "HIDDEN" && !isInSnapshot) {
        const reason = !requestedProduct.seller.isActive
          ? "فروشگاه غیرفعال است"
          : requestedProduct.seller.subscriptions.length === 0
            ? "اشتراک فعال و معتبر برای فروشگاه پیدا نشد"
            : requestedProduct.hasUnpublishedChanges
              ? "محصول تغییرات منتشرنشده دارد و در کاتالوگ عمومی نیست"
              : "محصول با شرایط کاتالوگ عمومی تطبیق ندارد";
        throw new HttpError(409, `انتشار محصول ${requestedProduct.slug} کامل نشد: ${reason}. وضعیت انتشار موفق ثبت نشد.`);
      }
    }

    /*
     * The publish snapshot is intentionally written as separate
     * public JSON files so the frontend can cache/load them
     * independently.
     *
     * Assets themselves are not copied into the repository.
     */
    let lastCommitSha:
      | string
      | null = null;

    lastCommitSha =
      await upsertFile(
        `${PUBLIC_DATA_DIR}/products.json`,
        JSON.stringify(
          products,
          null,
          2
        ),
        `chore(publish): update products.json [job ${jobId}]`
      );

    lastCommitSha =
      await upsertFile(
        `${PUBLIC_DATA_DIR}/sellers.json`,
        JSON.stringify(
          sellers,
          null,
          2
        ),
        `chore(publish): update sellers.json [job ${jobId}]`
      );

    const publicSettings = settings ? toPublicSettings(settings) : {};

    lastCommitSha =
      await upsertFile(
        `${PUBLIC_DATA_DIR}/settings.json`,
        JSON.stringify(
          publicSettings,
          null,
          2
        ),
        `chore(publish): update settings.json [job ${jobId}]`
      );

    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/plans.json`,
      JSON.stringify(plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        durationDays: plan.durationDays,
        price: plan.price,
        discountPct: plan.discountPct,
        productLimit: plan.productLimit,
        storageLimitMb: plan.storageLimitMb,
        trafficLimitGb: plan.trafficLimitGb,
        categoryId: plan.categoryId,
        sortOrder: plan.sortOrder,
        features: parseJson(plan.features, {}),
      })), null, 2),
      `chore(publish): update plans.json [job ${jobId}]`
    );

    // catalog.json is the public storefront's single source of truth.
    // It is intentionally written LAST: until this pointer is updated,
    // visitors continue seeing the previous complete snapshot.
    const generatedAt = new Date().toISOString();
    const catalogPayload = {
      schemaVersion: 2,
      generatedAt,
      version: createCatalogVersion({ products, sellers, settings: publicSettings, plans, planCategories }),
      products,
      sellers,
      settings: publicSettings,
      plans: plans.map((plan) => ({ id: plan.id, name: plan.name, durationDays: plan.durationDays, price: plan.price, discountPct: plan.discountPct, productLimit: plan.productLimit, storageLimitMb: plan.storageLimitMb, trafficLimitGb: plan.trafficLimitGb, categoryId: plan.categoryId, sortOrder: plan.sortOrder, features: parseJson(plan.features, {}) })),
      planCategories: planCategories.map((category) => ({ id: category.id, name: category.name, slug: category.slug, description: category.description, sortOrder: category.sortOrder, isActive: category.isActive })),
    };

    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/catalog.json`,
      JSON.stringify(catalogPayload, null, 2),
      `chore(publish): update atomic public catalog [job ${jobId}]`,
    );

    await log(jobId, `کاتالوگ ثبت شد (${catalogPayload.version})؛ در حال ساخت سایت عمومی...`);
    await dispatchPublicSiteBuildAndWait(lastCommitSha);
    await verifyPublicDeployment(
      catalogPayload.version,
      requestedJob?.productId && expectedProductPresent !== null ? { id: requestedJob.productId, shouldBePresent: expectedProductPresent } : undefined,
    );
    publicDeploymentVerified = true;
    verifiedProductId = requestedJob?.productId ?? null;
    verifiedOperation = requestedJob?.operation ?? null;
    verifiedExpectedProductPresent = expectedProductPresent;
    verifiedSnapshotCapturedAt = snapshotCapturedAt;

    await log(jobId, `کاتالوگ روی دامنه عمومی با موفقیت تأیید شد. commit: ${lastCommitSha}`);

    const completedJob =
      await prisma.publishJob.findUnique({
        where: {
          id: jobId,
        },

        select: {
          id: true,
          productId: true,
          sellerId: true,
          triggeredById: true,
          operation: true,
        },
      });

    /*
     * Finalize only when the product still represents the same publish intent
     * captured in this snapshot. An edit or a new opposite operation during
     * deployment must not be overwritten by an old job.
     */
    if (completedJob?.productId && expectedProductPresent !== null) {
      const product = await prisma.product.findUnique({
        where: { id: completedJob.productId },
        select: { id: true, visibility: true, hasUnpublishedChanges: true, updatedAt: true },
      });

      if (product && product.updatedAt <= snapshotCapturedAt) {
        if (completedJob.operation === "PUBLISH" && expectedProductPresent && product.visibility === "PUBLISHED" && product.hasUnpublishedChanges) {
          await prisma.product.update({
            where: { id: product.id },
            data: { visibility: "PUBLISHED", hasUnpublishedChanges: false, publishedAt: new Date() },
          });
        } else if (completedJob.operation === "UNPUBLISH" && !expectedProductPresent && product.visibility === "HIDDEN") {
          await prisma.product.update({
            where: { id: product.id },
            data: { hasUnpublishedChanges: false },
          });
        }
      }
    }

    await prisma.publishJob.update({
      where: {
        id: jobId,
      },

      data: {
        status:
          "SUCCESS",

        commitSha:
          lastCommitSha,

        finishedAt:
          new Date(),

        errorMessage:
          null,
      },
    });

    if (completedJob) {
      try {
        await prisma.auditLog.create({
          data: {
            actorId:
              completedJob.triggeredById,

            sellerId:
              completedJob.sellerId,

            productId:
              completedJob.productId,

            action:
              completedJob.operation === "UNPUBLISH"
                ? "PRODUCT_UNPUBLISHED"
                : completedJob.operation === "REBUILD"
                  ? "PUBLIC_CATALOG_REBUILT"
                  : "PRODUCT_PUBLISHED",

            entity:
              "PublishJob",

            entityId:
              completedJob.id,

            metadata:
              serializeJson({
                commitSha:
                  lastCommitSha,

                publishedAt:
                  new Date().toISOString(),
                operation:
                  completedJob.operation,
              }),
          },
        });
      } catch (auditError) {
        logger.error(
          {
            err:
              auditError,

            jobId,
          },
          "publish succeeded but audit log failed"
        );
      }
    }
  } catch (error) {
    let message =
      error instanceof Error
        ? error.message
        : "خطای نامشخص در انتشار.";

    logger.error(
      {
        err: error,
        jobId,
      },
      "publish job failed"
    );

    await log(
      jobId,
      message,
      "error"
    );

    try {
      // Once the exact public deployment has been verified, do not leave the
      // database in a false FAILED state just because the local finalization
      // step hit a transient DB error. Retry the idempotent product/job
      // finalization a few times. The public deployment remains the source of
      // truth for what visitors can see, while DB state is reconciled back to it.
      if (publicDeploymentVerified) {
        let reconciled = false;
        for (let attempt = 0; attempt < 3 && !reconciled; attempt += 1) {
          try {
            if (verifiedProductId && verifiedExpectedProductPresent !== null && verifiedSnapshotCapturedAt) {
              const product = await prisma.product.findUnique({
                where: { id: verifiedProductId },
                select: { id: true, visibility: true, hasUnpublishedChanges: true, updatedAt: true },
              });
              if (product && product.updatedAt <= verifiedSnapshotCapturedAt) {
                if (verifiedOperation === "PUBLISH" && verifiedExpectedProductPresent && product.visibility === "PUBLISHED" && product.hasUnpublishedChanges) {
                  await prisma.product.update({ where: { id: product.id }, data: { visibility: "PUBLISHED", hasUnpublishedChanges: false, publishedAt: new Date() } });
                } else if (verifiedOperation === "UNPUBLISH" && !verifiedExpectedProductPresent && product.visibility === "HIDDEN") {
                  await prisma.product.update({ where: { id: product.id }, data: { hasUnpublishedChanges: false } });
                }
              }
            }
            await prisma.publishJob.update({
              where: { id: jobId },
              data: { status: "SUCCESS", commitSha: await getExistingCommitSha(jobId), finishedAt: new Date(), errorMessage: null },
            });
            reconciled = true;
          } catch (reconcileError) {
            logger.warn({ err: reconcileError, jobId, attempt: attempt + 1 }, "post-deploy database reconciliation retry failed");
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
          }
        }
        if (reconciled) return;
        message = `سایت عمومی با موفقیت منتشر شد، اما همگام‌سازی نهایی پایگاه‌داده در این لحظه انجام نشد: ${message}`;
      }

      await prisma.publishJob.update({
        where: { id: jobId },
        data: { status: "FAILED", errorMessage: message, finishedAt: new Date() },
      });
    } catch (updateError) {
      logger.error({ err: updateError, jobId }, "failed to mark publish job as FAILED");
    }
  }
}

function toPublicSettings(settings: {
  platformName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  colorBackground: string;
  colorText: string;
  fontFamily: string;
  socialLinks: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  return {
    platformName: settings.platformName,
    logoUrl: settings.logoUrl,
    faviconUrl: settings.faviconUrl,
    colorPrimary: settings.colorPrimary,
    colorSecondary: settings.colorSecondary,
    colorAccent: settings.colorAccent,
    colorBackground: settings.colorBackground,
    colorText: settings.colorText,
    fontFamily: settings.fontFamily,
    socialLinks: parseJson(settings.socialLinks, {}),
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
  };
}

async function getExistingCommitSha(jobId: string): Promise<string | null> {
  const job = await prisma.publishJob.findUnique({ where: { id: jobId }, select: { commitSha: true } });
  return job?.commitSha ?? null;
}

function createCatalogVersion(payload: unknown): string {
  // Stable enough to invalidate the frontend build/cache when catalog data changes.
  const json = JSON.stringify(payload);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/* -------------------------------------------------------------------------- */
/* Public catalog generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generates the complete public product catalog.
 *
 * A product is publicly exposed only when:
 *
 * - it is already PUBLISHED and has no unpublished changes;
 * - OR it is the current publish trigger and is not HIDDEN;
 * - its seller is active;
 * - its seller has a currently active subscription;
 * - the subscription plan is active.
 *
 * This prevents an edited published product from accidentally leaking
 * into the public snapshot when another product is published.
 *
 * Products can remain published while their category becomes inactive.
 * In that case their public category becomes null.
 */
async function getPublicProducts(
  jobId: string
) {
  const job =
    await prisma.publishJob.findUnique({
      where: {
        id: jobId,
      },

      select: {
        productId: true,
      },
    });

  const triggeringProduct =
    job?.productId
      ? await prisma.product.findUnique({
          where: {
            id:
              job.productId,
          },

          select: {
            visibility:
              true,
          },
        })
      : null;

  const includeTriggeringProduct =
    Boolean(
      job?.productId &&
        triggeringProduct?.visibility !==
          "HIDDEN"
    );

  const now =
    new Date();

  const products =
    await prisma.product.findMany({
      where: {
        AND: [
          {
            seller: {
              isActive:
                true,

              subscriptions: {
                some: {
                  status:
                    "ACTIVE",

                  startDate: {
                    lte: now,
                  },

                  endDate: {
                    gte: now,
                  },

                  plan: {
                    is: {
                      isActive:
                        true,
                    },
                  },
                },
              },
            },
          },

          {
            OR: [
              {
                AND: [
                  {
                    visibility:
                      "PUBLISHED",
                  },

                  {
                    hasUnpublishedChanges:
                      false,
                  },
                ],
              },

              ...(includeTriggeringProduct
                ? [
                    {
                      id:
                        job!.productId!,
                    },
                  ]
                : []),
            ],
          },
        ],
      },

      include: {
        images: {
          orderBy: {
            sortOrder:
              "asc",
          },
        },

        models: true,

        seller: {
          select: {
            id: true,
            slug: true,
            storeName: true,
          },
        },
      },

      orderBy: [
        {
          publishedAt:
            "desc",
        },

        {
          createdAt:
            "desc",
        },
      ],
    });

  const productIds = products.map((product) => product.id);
  const viewRows = productIds.length
    ? await prisma.analyticsEvent.groupBy({
        by: ["productId"],
        where: {
          productId: { in: productIds },
          type: { in: ["PRODUCT_VIEW", "PRODUCT_DETAIL_VIEW"] },
        },
        _count: { _all: true },
      })
    : [];

  const viewCounts = new Map(
    viewRows.map((row) => [row.productId, row._count._all]),
  );

  return products.map(
    (product) => {
      const images =
        product.images.map(
          (image) => ({
            url: image.storageKey ? publicAssetUrl(image.storageKey) : image.url,

            isPrimary:
              image.isPrimary,
          })
        );

      const models =
        product.models.map(
          (model) => ({
            kind:
              model.kind,

            url: model.storageKey ? publicAssetUrl(model.storageKey) : model.url,
          })
        );

      return {
        id:
          product.id,

        slug:
          product.slug,

        name:
          product.name,

        shortDescription:
          product.shortDescription,

        fullDescription:
          product.fullDescription,

        price:
          product.price,

        isPinned:
          product.isPinned,

        pinOrder:
          product.pinOrder,

        viewCount:
          viewCounts.get(product.id) ?? 0,

        tags:
          product.tags
            ?.split(",")
            .map(
              (tag) =>
                tag.trim()
            )
            .filter(Boolean) ??
          [],

        material: product.material ?? null,
        colors: parseJson(product.colors, []),

        seller: {
          id: product.seller.id,
          slug:
            product.seller
              .slug,

          storeName:
            product.seller
              .storeName,
        },

        images,

        models,

        dimensions:
          product.widthMm ||
          product.heightMm ||
          product.depthMm
            ? {
                widthM:
                  product.widthMm
                    ? millimetersToMeters(
                        product.widthMm
                      )
                    : null,

                heightM:
                  product.heightMm
                    ? millimetersToMeters(
                        product.heightMm
                      )
                    : null,

                depthM:
                  product.depthMm
                    ? millimetersToMeters(
                        product.depthMm
                      )
                    : null,

                realWorldScale:
                  true,
              }
            : null,

        publishedAt:
          product.publishedAt,
      };
    }
  );
}

/**
 * Generates the public seller/store catalog.
 *
 * Only active sellers with a currently active subscription are exposed.
 */
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function getPublicSellers() {
  const now =
    new Date();

  const sellers =
    await prisma.seller.findMany({
      where: {
        isActive:
          true,

        subscriptions: {
          some: {
            status:
              "ACTIVE",

            startDate: {
              lte: now,
            },

            endDate: {
              gte: now,
            },

            plan: {
              is: {
                isActive:
                  true,
              },
            },
          },
        },
      },

    });

  return shuffle(sellers).map(
    (seller) => ({
      id: seller.id,
      slug:
        seller.slug,

      storeName:
        seller.storeName,

      description:
        seller.description,

      logoUrl:
        seller.logoStorageKey
          ? publicAssetUrl(seller.logoStorageKey)
          : seller.logoUrl,

      themeColor:
        seller.themeColor,

      contactEmail:
        seller.contactEmail,

      contactPhone:
        seller.contactPhone,

      address:
        seller.address,

      socialLinks:
        parseJson(
          seller.socialLinks,
          {}
        ),
    })
  );
}


function publicAssetUrl(storageKey: string): string {
  const apiBase = (env.API_URL || "http://localhost:4000").replace(/\/+$/, "");
  const packageRef = parsePackageStorageKey(storageKey);
  if (packageRef) {
    return `${apiBase}${packageAssetUrl(packageRef.productId, packageRef.kind, packageRef.name)}`;
  }
  const encoded = storageKey
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${apiBase}/api/public/assets/${encoded}`;
}

/* -------------------------------------------------------------------------- */
/* Seller subscription re-publish                                             */
/* -------------------------------------------------------------------------- */

/**
 * Forces a full public snapshot regeneration for a seller.
 *
 * The seller's database records are retained.
 * Eligibility for the public catalog is determined during snapshot
 * generation.
 *
 * This operation intentionally does NOT require an active subscription,
 * because it may be needed to remove a seller's expired products from
 * the public snapshot.
 */
export async function republishForSeller(
  sellerId: string,
  triggeredByUserId: string
) {
  const seller =
    await prisma.seller.findUnique({
      where: {
        id: sellerId,
      },

      select: {
        id: true,
      },
    });

  if (!seller) {
    throw new HttpError(
      404,
      "فروشنده یافت نشد."
    );
  }

  const existing = await prisma.publishJob.findFirst({
    where: { sellerId: seller.id, productId: null, status: { in: ["QUEUED", "PROCESSING"] } },
    orderBy: { requestedAt: "desc" },
  });
  if (existing) return existing;

  const job = await prisma.publishJob.create({
    data: { sellerId: seller.id, triggeredById: triggeredByUserId, status: "QUEUED", operation: "REBUILD" },
  });

  publishQueue.enqueue(() =>
    processPublishJob(job.id)
  );

  return job;
}



/**
 * Regenerates the public snapshot for every seller.
 * Used for platform-wide metadata changes.
 */
export async function republishForAllSellers(
  triggeredByUserId: string
) {
  const sellers = await prisma.seller.findMany({
    select: {
      id: true,
    },
  });

  return Promise.all(
    sellers.map((seller) =>
      republishForSeller(seller.id, triggeredByUserId)
    )
  );
}

/**
 * Recover jobs left behind by a backend restart/deploy. Only one worker can
 * claim a QUEUED job, so re-enqueueing is safe even if multiple instances
 * perform recovery at the same time.
 */
export async function recoverPendingPublishJobs() {
  // Only recover jobs that are old enough to plausibly belong to a dead
  // worker. Never reset a freshly-running job from another backend instance.
  const staleAfterMs = Math.max(env.PUBLIC_PUBLISH_TIMEOUT_MS + 120_000, 15 * 60 * 1000);
  const staleBefore = new Date(Date.now() - staleAfterMs);

  await prisma.publishJob.updateMany({
    where: {
      status: "PROCESSING",
      OR: [
        { startedAt: null },
        { startedAt: { lt: staleBefore } },
      ],
    },
    data: { status: "QUEUED", startedAt: null },
  });

  const jobs = await prisma.publishJob.findMany({
    where: { status: "QUEUED" },
    orderBy: { requestedAt: "asc" },
    select: { id: true },
  });

  for (const job of jobs) {
    publishQueue.enqueue(() => processPublishJob(job.id));
  }

  return jobs.length;
}

/** Fire-and-forget wrapper for non-request lifecycle events. */
export function queueRepublishForSeller(sellerId: string, triggeredByUserId: string) {
  void republishForSeller(sellerId, triggeredByUserId).catch((error) => {
    logger.error({ err: error, sellerId }, "failed to queue seller public republish");
  });
}

/** Fire-and-forget wrapper for platform-wide lifecycle events. */
export function queueRepublishForAllSellers(triggeredByUserId: string) {
  void republishForAllSellers(triggeredByUserId).catch((error) => {
    logger.error({ err: error }, "failed to queue platform public republish");
  });
}

/**
 * Kept for compatibility with existing unpublish integrations.
 */
export {
  deleteFile as _deleteFileForUnpublish,
};
