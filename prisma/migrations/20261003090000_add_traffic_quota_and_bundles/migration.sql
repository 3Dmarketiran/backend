-- Monthly seller traffic quotas and manual traffic-bundle purchases.
ALTER TABLE "SubscriptionPlan" ADD COLUMN "trafficLimitGb" INTEGER;

CREATE TABLE "TrafficBundle" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gigabytes" INTEGER NOT NULL,
  "priceToman" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrafficBundle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrafficBundle_isActive_sortOrder_idx" ON "TrafficBundle"("isActive", "sortOrder");

CREATE TABLE "TrafficUsage" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "servedBytes" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrafficUsage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrafficUsage_sellerId_periodStart_key" ON "TrafficUsage"("sellerId", "periodStart");
CREATE INDEX "TrafficUsage_sellerId_periodEnd_idx" ON "TrafficUsage"("sellerId", "periodEnd");
ALTER TABLE "TrafficUsage" ADD CONSTRAINT "TrafficUsage_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrafficPurchase" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "bundleId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "gigabytes" INTEGER NOT NULL,
  "priceToman" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paymentReference" TEXT,
  "notes" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "rejectedAt" TIMESTAMP(3),
  CONSTRAINT "TrafficPurchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrafficPurchase_sellerId_periodStart_status_idx" ON "TrafficPurchase"("sellerId", "periodStart", "status");
CREATE INDEX "TrafficPurchase_status_requestedAt_idx" ON "TrafficPurchase"("status", "requestedAt");
ALTER TABLE "TrafficPurchase" ADD CONSTRAINT "TrafficPurchase_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrafficPurchase" ADD CONSTRAINT "TrafficPurchase_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "TrafficBundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrafficPurchase" ADD CONSTRAINT "TrafficPurchase_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
