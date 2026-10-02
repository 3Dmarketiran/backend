import "dotenv/config";
import { prisma } from "../config/prisma";
import { expireOverdueSubscriptions } from "../routes/subscriptions";
import { purgeInactiveSellerStorage } from "../services/storageCleanupService";

async function main() {
  const expired = await expireOverdueSubscriptions();
  const purgeEnabled = process.env.ENABLE_DESTRUCTIVE_ASSET_PURGE === "true";
  const stats = purgeEnabled
    ? await purgeInactiveSellerStorage()
    : {
        sellersScanned: 0,
        sellersPurged: 0,
        productsPurged: 0,
        imagesPurged: 0,
        modelsPurged: 0,
        logoKeysPurged: 0,
        failures: 0,
        skipped: true,
        reason: "Set ENABLE_DESTRUCTIVE_ASSET_PURGE=true to allow permanent asset deletion.",
      };

  console.log(
    JSON.stringify(
      {
        ok: stats.failures === 0,
        expiredSubscriptions: expired,
        storageCleanup: stats,
      },
      null,
      2,
    ),
  );

  if (stats.failures > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("[storage-cleanup] fatal error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
