import { prisma } from "../config/prisma";

import {
  upsertFile,
  deleteFile,
} from "./githubService";

import { publishQueue } from "./publishQueue";
import { assertSellerCanPublish } from "./productService";
import { millimetersToMeters } from "../utils/dimensions";
import { HttpError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { parseJson, serializeJson } from "../utils/json";

const PUBLIC_DATA_DIR = "public-data";

/**
 * Enqueues a publish job for one product.
 *
 * The actual publishing happens asynchronously through the shared
 * publish queue:
 *
 * QUEUED -> PROCESSING -> SUCCESS | FAILED
 */
export async function requestPublish(
  productId: string,
  triggeredByUserId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new HttpError(404, "محصول یافت نشد.");
  }

  await assertSellerCanPublish(product.sellerId);

  const job = await prisma.publishJob.create({
    data: {
      sellerId: product.sellerId,
      productId: product.id,
      triggeredById: triggeredByUserId,
      status: "QUEUED",
    },
  });

  publishQueue.enqueue(() => processPublishJob(job.id));

  return job;
}

/**
 * Requests that a product be unpublished.
 *
 * The product remains in the database, but becomes HIDDEN.
 * A new publish job regenerates the public catalog.
 */
export async function requestUnpublish(
  productId: string,
  triggeredByUserId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new HttpError(404, "محصول یافت نشد.");
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      visibility: "HIDDEN",
    },
  });

  const job = await prisma.publishJob.create({
    data: {
      sellerId: product.sellerId,
      productId: product.id,
      triggeredById: triggeredByUserId,
      status: "QUEUED",
    },
  });

  publishQueue.enqueue(() => processPublishJob(job.id));

  return job;
}

/**
 * Writes a log entry for a publish job.
 */
async function log(
  jobId: string,
  message: string,
  level: "info" | "warn" | "error" = "info"
) {
  await prisma.publishLog.create({
    data: {
      publishJobId: jobId,
      message,
      level,
    },
  });
}

/**
 * The actual publish worker.
 *
 * The worker:
 *
 * 1. Loads the current public catalog from the database.
 * 2. Uploads 3D assets to GitHub Releases.
 * 3. Generates public-data/*.json.
 * 4. Commits only JSON/static metadata to the repository.
 * 5. Marks the product as PUBLISHED after GitHub succeeds.
 *
 * GLB/USDZ files are NOT committed to the Git repository.
 */
async function processPublishJob(jobId: string) {
  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  await log(jobId, "شروع پردازش انتشار...");

  try {
    const [
      products,
      sellers,
      categories,
      settings,
    ] = await Promise.all([
      getPublicProducts(jobId),
      getPublicSellers(),
      prisma.category.findMany(),
      prisma.platformSetting.findUnique({
        where: { id: "singleton" },
      }),
    ]);

    await log(
      jobId,
      `تولید داده استاتیک: ${products.length} محصول، ${sellers.length} فروشنده.`
    );

    let lastCommitSha: string | null = null;

    /*
     * Products
     */
    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/products.json`,
      JSON.stringify(products, null, 2),
      `chore(publish): update products.json [job ${jobId}]`
    );

    /*
     * Sellers
     */
    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/sellers.json`,
      JSON.stringify(sellers, null, 2),
      `chore(publish): update sellers.json [job ${jobId}]`
    );

    /*
     * Categories
     */
    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/categories.json`,
      JSON.stringify(categories, null, 2),
      `chore(publish): update categories.json [job ${jobId}]`
    );

    /*
     * Platform settings
     */
    lastCommitSha = await upsertFile(
      `${PUBLIC_DATA_DIR}/settings.json`,
      JSON.stringify(settings, null, 2),
      `chore(publish): update settings.json [job ${jobId}]`
    );

    await log(
      jobId,
      `انتشار در GitHub موفق بود. آخرین commit: ${lastCommitSha}`
    );

    const job = await prisma.publishJob.findUnique({
      where: { id: jobId },
    });

    /*
     * Mark the triggering product as published only after
     * the public catalog has successfully been committed.
     */
    if (job?.productId) {
      const product = await prisma.product.findUnique({
        where: { id: job.productId },
      });

      if (product?.visibility !== "HIDDEN") {
        await prisma.product.update({
          where: { id: job.productId },
          data: {
            visibility: "PUBLISHED",
            hasUnpublishedChanges: false,
            publishedAt: new Date(),
          },
        });
      }
    }

    await prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCESS",
        commitSha: lastCommitSha,
        finishedAt: new Date(),
      },
    });

    /*
     * Audit log
     */
    if (job) {
      await prisma.auditLog.create({
        data: {
          sellerId: job.sellerId,
          productId: job.productId,
          action: "PRODUCT_PUBLISHED",
          entity: "PublishJob",
          entityId: job.id,
          metadata: serializeJson({
            commitSha: lastCommitSha,
          }),
        },
      });
    }
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "خطای نامشخص در انتشار.";

    logger.error(
      {
        err,
        jobId,
      },
      "publish job failed"
    );

    await log(jobId, message, "error");

    await prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: "FAILED",
        errorMessage: message,
        finishedAt: new Date(),
      },
    });
  }
}


/* -------------------------------------------------------------------------- */
/* Public catalog generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generates the complete public product catalog.
 *
 * Only products belonging to active sellers with active subscriptions
 * are exposed.
 */
async function getPublicProducts(jobId: string) {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    select: {
      productId: true,
    },
  });

  const triggeringProduct = job?.productId
    ? await prisma.product.findUnique({
        where: { id: job.productId },
        select: {
          visibility: true,
        },
      })
    : null;

  /*
   * When publishing a product, allow the triggering product to enter
   * the public snapshot before its database visibility is flipped to
   * PUBLISHED.
   */
  const includeTriggeringProduct = Boolean(
    job?.productId &&
      triggeringProduct?.visibility !== "HIDDEN"
  );

  const products = await prisma.product.findMany({
    where: {
      OR: [
        {
          visibility: "PUBLISHED",
        },
        ...(includeTriggeringProduct
          ? [
              {
                id: job!.productId!,
              },
            ]
          : []),
      ],

      seller: {
        isActive: true,

        subscriptions: {
          some: {
            status: "ACTIVE",
            endDate: {
              gte: new Date(),
            },
          },
        },
      },
    },

    include: {
      images: {
        orderBy: {
          sortOrder: "asc",
        },
      },

      models: true,

      seller: {
        select: {
          slug: true,
          storeName: true,
        },
      },

      category: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });

  const result = [];

  for (const product of products) {
    /*
     * Images
     *
     * Images keep their existing URL/storage mechanism for now.
     * Only 3D model binaries are moved to GitHub Releases.
     */
    const images = [];

    for (const image of product.images) {
      images.push({
        url: image.url,
        isPrimary: image.isPrimary,
      });
    }

    /*
     * 3D models
     */
    const models = [];

    for (const model of product.models) {

      const url = model.url;
      
      models.push({
        kind: model.kind,
        url,
      });
    }

    result.push({
      id: product.id,
      slug: product.slug,
      name: product.name,

      shortDescription: product.shortDescription,
      fullDescription: product.fullDescription,

      tags:
        product.tags
          ?.split(",")
          .map((tag) => tag.trim())
          .filter(Boolean) ?? [],

      category: product.category
        ? {
            slug: product.category.slug,
            name: product.category.name,
          }
        : null,

      seller: {
        slug: product.seller.slug,
        storeName: product.seller.storeName,
      },

      images,
      models,

      dimensions:
        product.widthMm ||
        product.heightMm ||
        product.depthMm
          ? {
              widthM: product.widthMm
                ? millimetersToMeters(product.widthMm)
                : null,

              heightM: product.heightMm
                ? millimetersToMeters(product.heightMm)
                : null,

              depthM: product.depthMm
                ? millimetersToMeters(product.depthMm)
                : null,

              realWorldScale: true,
            }
          : null,

      publishedAt: product.publishedAt,
    });
  }

  return result;
}

/**
 * Generates the public seller catalog.
 */
async function getPublicSellers() {
  const sellers = await prisma.seller.findMany({
    where: {
      isActive: true,

      subscriptions: {
        some: {
          status: "ACTIVE",
          endDate: {
            gte: new Date(),
          },
        },
      },
    },
  });

  return sellers.map((seller) => ({
    slug: seller.slug,
    storeName: seller.storeName,
    description: seller.description,
    logoUrl: seller.logoUrl,
    contactEmail: seller.contactEmail,
    contactPhone: seller.contactPhone,
    socialLinks: parseJson(
      seller.socialLinks,
      {}
    ),
  }));
}

/* -------------------------------------------------------------------------- */
/* Seller subscription re-publish                                             */
/* -------------------------------------------------------------------------- */

/**
 * Forces a full re-publish for a seller.
 *
 * This is useful when a subscription expires or changes state.
 * Data remains in the database; the public snapshot simply excludes
 * sellers/products that are no longer eligible for publication.
 */
export async function republishForSeller(
  sellerId: string,
  triggeredByUserId: string
) {
  const job = await prisma.publishJob.create({
    data: {
      sellerId,
      triggeredById: triggeredByUserId,
      status: "QUEUED",
    },
  });

  publishQueue.enqueue(() => processPublishJob(job.id));

  return job;
}

/**
 * Kept for compatibility with existing unpublish code.
 */
export {
  deleteFile as _deleteFileForUnpublish,
};