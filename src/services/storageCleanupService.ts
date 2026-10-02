import { prisma } from "../config/prisma";
import { storage } from "../storage";
import { serializeJson } from "../utils/json";

/**
 * Storage lifecycle policy:
 * - subscription expiration is immediate for public visibility/access control;
 * - binary assets are retained for a 30-day recovery/renewal window;
 * - after 30 days without a newer subscription, product binaries and the
 *   seller logo are permanently removed from object storage;
 * - product metadata is kept, but asset rows are cleared so stale URLs cannot
 *   survive the purge.
 */
export const ASSET_RETENTION_AFTER_EXPIRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StoragePurgeStats = {
  sellersScanned: number;
  sellersPurged: number;
  productsPurged: number;
  imagesPurged: number;
  modelsPurged: number;
  logoKeysPurged: number;
  failures: number;
};

function cutoffDate(now: Date): Date {
  return new Date(now.getTime() - ASSET_RETENTION_AFTER_EXPIRY_DAYS * DAY_MS);
}

/**
 * Purges seller asset storage after 30 days with no valid renewal.
 *
 * Idempotent by design: once asset DB rows are removed, the next run simply
 * skips the already-purged product. Storage prefix deletion is itself safe to
 * repeat because providers are expected to treat missing objects as deleted.
 */
export async function purgeInactiveSellerStorage(now = new Date()): Promise<StoragePurgeStats> {
  const cutoff = cutoffDate(now);

  const sellers = await prisma.seller.findMany({
    where: {
      subscriptions: {
        none: {
          status: "ACTIVE",
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
    },
    select: {
      id: true,
      logoStorageKey: true,
      subscriptions: {
        where: { endDate: { not: null } },
        orderBy: { endDate: "desc" },
        take: 1,
        select: { endDate: true, status: true },
      },
      products: {
        select: {
          id: true,
          images: { select: { id: true } },
          models: { select: { id: true, storageKey: true } },
          assetPackage: { select: { storageKey: true } },
        },
      },
    },
  });

  const stats: StoragePurgeStats = {
    sellersScanned: sellers.length,
    sellersPurged: 0,
    productsPurged: 0,
    imagesPurged: 0,
    modelsPurged: 0,
    logoKeysPurged: 0,
    failures: 0,
  };

  for (const seller of sellers) {
    const latestExpired = seller.subscriptions[0]?.endDate;

    // A seller with no historical subscription is not part of the retention
    // purge. New/unactivated seller storage is not managed by this job.
    if (!latestExpired || latestExpired.getTime() > cutoff.getTime()) {
      continue;
    }

    let sellerHadSuccessfulPurge = true;

    for (const product of seller.products) {
      try {
        // Product-scoped prefixes cover the current direct-object architecture,
        // including GLTF dependencies and package manifests that do not have a
        // dedicated DB row.
        await storage.deletePrefix(`products/${product.id}/`);

        // Legacy ZIP packages may have a provider object that is not inside
        // the current product prefix. Remove that standalone object too.
        const legacyPackageKey = product.assetPackage?.storageKey;
        if (legacyPackageKey && !legacyPackageKey.startsWith(`products/${product.id}/`)) {
          await storage.delete(legacyPackageKey).catch(() => undefined);
        }

        await prisma.$transaction([
          prisma.productImage.deleteMany({ where: { productId: product.id } }),
          prisma.productModel.deleteMany({ where: { productId: product.id } }),
          prisma.productAssetPackage.deleteMany({ where: { productId: product.id } }),
          prisma.product.update({
            where: { id: product.id },
            data: {
              visibility: "DRAFT",
              hasUnpublishedChanges: true,
            },
          }),
        ]);

        stats.productsPurged += 1;
        stats.imagesPurged += product.images.length;
        stats.modelsPurged += product.models.length;
      } catch (error) {
        sellerHadSuccessfulPurge = false;
        stats.failures += 1;
        console.error(
          `[storage-cleanup] failed for seller=${seller.id} product=${product.id}`,
          error,
        );
      }
    }

    if (!sellerHadSuccessfulPurge) {
      // Do not remove the logo or mark the seller as fully purged when one of
      // its product prefixes failed. A later run can retry safely.
      continue;
    }

    if (seller.logoStorageKey) {
      try {
        await storage.delete(seller.logoStorageKey);
        stats.logoKeysPurged += 1;
      } catch (error) {
        stats.failures += 1;
        console.error(
          `[storage-cleanup] failed to remove seller logo seller=${seller.id}`,
          error,
        );
        sellerHadSuccessfulPurge = false;
      }
    }

    if (!sellerHadSuccessfulPurge) continue;

    try {
      await prisma.seller.update({
        where: { id: seller.id },
        data: {
          logoUrl: null,
          logoStorageKey: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          sellerId: seller.id,
          action: "SELLER_ASSETS_PURGED_AFTER_INACTIVITY",
          entity: "SellerStorage",
          entityId: seller.id,
          metadata: serializeJson({
            cutoffDate: cutoff,
            retentionDays: ASSET_RETENTION_AFTER_EXPIRY_DAYS,
            productsPurged: seller.products.length,
          }),
        },
      });

      stats.sellersPurged += 1;
    } catch (error) {
      stats.failures += 1;
      console.error(
        `[storage-cleanup] failed to finalize seller=${seller.id}`,
        error,
      );
    }
  }

  return stats;
}
