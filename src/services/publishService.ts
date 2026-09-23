import { prisma } from "../config/prisma";
import {
  upsertFile,
  deleteFile,
} from "./githubService";
import { publishQueue } from "./publishQueue";
import {
  assertSellerCanPublish,
} from "./productService";
import { millimetersToMeters } from "../utils/dimensions";
import { HttpError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import {
  parseJson,
  serializeJson,
} from "../utils/json";

const PUBLIC_DATA_DIR =
  "public-data";

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
      },
    });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  await assertSellerCanPublish(
    product.sellerId
  );

  const job =
    await prisma.publishJob.create({
      data: {
        sellerId:
          product.sellerId,

        productId:
          product.id,

        triggeredById:
          triggeredByUserId,

        status:
          "QUEUED",
      },
    });

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
  const product =
    await prisma.product.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        sellerId: true,
        visibility: true,
      },
    });

  if (!product) {
    throw new HttpError(
      404,
      "محصول یافت نشد."
    );
  }

  if (
    product.visibility ===
    "HIDDEN"
  ) {
    throw new HttpError(
      409,
      "این محصول در حال حاضر از سایت عمومی مخفی است."
    );
  }

  await prisma.product.update({
    where: {
      id: productId,
    },

    data: {
      visibility:
        "HIDDEN",

      hasUnpublishedChanges:
        false,
    },
  });

  const job =
    await prisma.publishJob.create({
      data: {
        sellerId:
          product.sellerId,

        productId:
          product.id,

        triggeredById:
          triggeredByUserId,

        status:
          "QUEUED",
      },
    });

  publishQueue.enqueue(() =>
    processPublishJob(job.id)
  );

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

  try {
    await prisma.publishJob.update({
      where: {
        id: jobId,
      },

      data: {
        status:
          "PROCESSING",

        startedAt,

        errorMessage:
          null,
      },
    });

    await log(
      jobId,
      "شروع پردازش انتشار..."
    );

    const [
      products,
      sellers,
      categories,
      settings,
    ] = await Promise.all([
      getPublicProducts(jobId),

      getPublicSellers(),

      getPublicCategories(),

      prisma.platformSetting.findUnique({
        where: {
          id: "singleton",
        },
      }),
    ]);

    await log(
      jobId,
      `تولید داده استاتیک: ${products.length} محصول، ${sellers.length} فروشنده، ${categories.length} دسته‌بندی فعال.`
    );

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

    lastCommitSha =
      await upsertFile(
        `${PUBLIC_DATA_DIR}/categories.json`,
        JSON.stringify(
          categories,
          null,
          2
        ),
        `chore(publish): update categories.json [job ${jobId}]`
      );

    lastCommitSha =
      await upsertFile(
        `${PUBLIC_DATA_DIR}/settings.json`,
        JSON.stringify(
          settings ?? {},
          null,
          2
        ),
        `chore(publish): update settings.json [job ${jobId}]`
      );

    await log(
      jobId,
      `انتشار در GitHub موفق بود. آخرین commit: ${lastCommitSha}`
    );

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
        },
      });

    /*
     * Only mark the triggering product as PUBLISHED after the
     * complete public snapshot has been successfully generated.
     *
     * A product explicitly hidden by the user must never be
     * silently changed back to PUBLISHED.
     */
    if (
      completedJob?.productId
    ) {
      const product =
        await prisma.product.findUnique({
          where: {
            id:
              completedJob.productId,
          },

          select: {
            id: true,
            visibility: true,
          },
        });

      if (
        product &&
        product.visibility !==
          "HIDDEN"
      ) {
        await prisma.product.update({
          where: {
            id: product.id,
          },

          data: {
            visibility:
              "PUBLISHED",

            hasUnpublishedChanges:
              false,

            publishedAt:
              new Date(),
          },
        });
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
              "PRODUCT_PUBLISHED",

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
    const message =
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
      await prisma.publishJob.update({
        where: {
          id: jobId,
        },

        data: {
          status:
            "FAILED",

          errorMessage:
            message,

          finishedAt:
            new Date(),
        },
      });
    } catch (updateError) {
      logger.error(
        {
          err:
            updateError,

          jobId,
        },
        "failed to mark publish job as FAILED"
      );
    }
  }
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
            slug: true,
            storeName: true,
            sellerCategory: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        },

        category: {
          select: {
            slug: true,
            name: true,
            isActive: true,
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

  return products.map(
    (product) => {
      const images =
        product.images.map(
          (image) => ({
            url:
              image.url,

            isPrimary:
              image.isPrimary,
          })
        );

      const models =
        product.models.map(
          (model) => ({
            kind:
              model.kind,

            url:
              model.url,
          })
        );

      const category =
        product.category?.isActive
          ? {
              slug:
                product.category
                  .slug,

              name:
                product.category
                  .name,
            }
          : null;

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

        tags:
          product.tags
            ?.split(",")
            .map(
              (tag) =>
                tag.trim()
            )
            .filter(Boolean) ??
          [],

        category,

        seller: {
          slug:
            product.seller
              .slug,

          storeName:
            product.seller
              .storeName,

          category:
            product.seller.sellerCategory
              ? {
                  slug:
                    product.seller.sellerCategory.slug,
                  name:
                    product.seller.sellerCategory.name,
                }
              : null,
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

      orderBy: {
        storeName:
          "asc",
      },

      include: {
        sellerCategory: {
          select: {
            slug: true,
            name: true,
          },
        },
      },
    });

  return sellers.map(
    (seller) => ({
      slug:
        seller.slug,

      storeName:
        seller.storeName,

      description:
        seller.description,

      logoUrl:
        seller.logoUrl
          ? env.API_URL
            ? `${env.API_URL.replace(/\/+$/, "")}/api/sellers/by-slug/${encodeURIComponent(seller.slug)}/logo`
            : seller.logoUrl
          : null,

      contactEmail:
        seller.contactEmail,

      contactPhone:
        seller.contactPhone,

      address:
        seller.address,

      category:
        seller.sellerCategory
          ? {
              slug: seller.sellerCategory.slug,
              name: seller.sellerCategory.name,
            }
          : null,

      socialLinks:
        parseJson(
          seller.socialLinks,
          {}
        ),
    })
  );
}

/**
 * Generates the public category catalog.
 *
 * Only active categories are published.
 */
async function getPublicCategories() {
  return prisma.category.findMany({
    where: {
      isActive:
        true,
    },

    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      parentId: true,
    },

    orderBy: [
      {
        name:
          "asc",
      },
    ],
  });
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

  const job =
    await prisma.publishJob.create({
      data: {
        sellerId:
          seller.id,

        triggeredById:
          triggeredByUserId,

        status:
          "QUEUED",
      },
    });

  publishQueue.enqueue(() =>
    processPublishJob(job.id)
  );

  return job;
}



/**
 * Regenerates the public snapshot for every seller.
 * Used for platform-wide metadata changes such as seller categories.
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
 * Kept for compatibility with existing unpublish integrations.
 */
export {
  deleteFile as _deleteFileForUnpublish,
};
