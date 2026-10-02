import "dotenv/config";
import { prisma } from "../config/prisma";
import { expireOverdueSubscriptions } from "../routes/subscriptions";
import { purgeInactiveSellerStorage } from "../services/storageCleanupService";

async function main() {
  const expired = await expireOverdueSubscriptions();
  const stats = await purgeInactiveSellerStorage();

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
