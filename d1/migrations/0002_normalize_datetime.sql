-- Normalize legacy SQLite DateTime text values for Prisma 6.x.
-- Values such as 2026-09-20T22:15:01.669 are valid-looking ISO text but
-- lack an explicit timezone. Prisma's D1 adapter expects RFC3339 values.
-- This migration is idempotent and does not delete or alter the timestamp
-- instant; it only appends UTC (`Z`) to timezone-less values.

UPDATE "User"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "User"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Session"
SET "expiresAt" = "expiresAt" || 'Z'
WHERE "expiresAt" IS NOT NULL
  AND typeof("expiresAt") = 'text'
  AND length("expiresAt") >= 19
  AND substr("expiresAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Session"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "LoginAttempt"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Seller"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Seller"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Category"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Category"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Product"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Product"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Product"
SET "publishedAt" = "publishedAt" || 'Z'
WHERE "publishedAt" IS NOT NULL
  AND typeof("publishedAt") = 'text'
  AND length("publishedAt") >= 19
  AND substr("publishedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "ProductImage"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "ProductAssetPackage"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "ProductAssetPackage"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "ProductModel"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "SubscriptionPlanCategory"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "SubscriptionPlanCategory"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "SubscriptionPlan"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "SubscriptionPlan"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Subscription"
SET "startDate" = "startDate" || 'Z'
WHERE "startDate" IS NOT NULL
  AND typeof("startDate") = 'text'
  AND length("startDate") >= 19
  AND substr("startDate", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Subscription"
SET "endDate" = "endDate" || 'Z'
WHERE "endDate" IS NOT NULL
  AND typeof("endDate") = 'text'
  AND length("endDate") >= 19
  AND substr("endDate", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Subscription"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "Subscription"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficBundle"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficBundle"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficUsage"
SET "periodStart" = "periodStart" || 'Z'
WHERE "periodStart" IS NOT NULL
  AND typeof("periodStart") = 'text'
  AND length("periodStart") >= 19
  AND substr("periodStart", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficUsage"
SET "periodEnd" = "periodEnd" || 'Z'
WHERE "periodEnd" IS NOT NULL
  AND typeof("periodEnd") = 'text'
  AND length("periodEnd") >= 19
  AND substr("periodEnd", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficUsage"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficUsage"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficPurchase"
SET "periodStart" = "periodStart" || 'Z'
WHERE "periodStart" IS NOT NULL
  AND typeof("periodStart") = 'text'
  AND length("periodStart") >= 19
  AND substr("periodStart", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficPurchase"
SET "periodEnd" = "periodEnd" || 'Z'
WHERE "periodEnd" IS NOT NULL
  AND typeof("periodEnd") = 'text'
  AND length("periodEnd") >= 19
  AND substr("periodEnd", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficPurchase"
SET "requestedAt" = "requestedAt" || 'Z'
WHERE "requestedAt" IS NOT NULL
  AND typeof("requestedAt") = 'text'
  AND length("requestedAt") >= 19
  AND substr("requestedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficPurchase"
SET "approvedAt" = "approvedAt" || 'Z'
WHERE "approvedAt" IS NOT NULL
  AND typeof("approvedAt") = 'text'
  AND length("approvedAt") >= 19
  AND substr("approvedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "TrafficPurchase"
SET "rejectedAt" = "rejectedAt" || 'Z'
WHERE "rejectedAt" IS NOT NULL
  AND typeof("rejectedAt") = 'text'
  AND length("rejectedAt") >= 19
  AND substr("rejectedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "PublishJob"
SET "requestedAt" = "requestedAt" || 'Z'
WHERE "requestedAt" IS NOT NULL
  AND typeof("requestedAt") = 'text'
  AND length("requestedAt") >= 19
  AND substr("requestedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "PublishJob"
SET "startedAt" = "startedAt" || 'Z'
WHERE "startedAt" IS NOT NULL
  AND typeof("startedAt") = 'text'
  AND length("startedAt") >= 19
  AND substr("startedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "PublishJob"
SET "finishedAt" = "finishedAt" || 'Z'
WHERE "finishedAt" IS NOT NULL
  AND typeof("finishedAt") = 'text'
  AND length("finishedAt") >= 19
  AND substr("finishedAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "PublishLog"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "AnalyticsEvent"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "AuditLog"
SET "createdAt" = "createdAt" || 'Z'
WHERE "createdAt" IS NOT NULL
  AND typeof("createdAt") = 'text'
  AND length("createdAt") >= 19
  AND substr("createdAt", 20, 1) NOT IN ('Z', '+', '-');

UPDATE "PlatformSetting"
SET "updatedAt" = "updatedAt" || 'Z'
WHERE "updatedAt" IS NOT NULL
  AND typeof("updatedAt") = 'text'
  AND length("updatedAt") >= 19
  AND substr("updatedAt", 20, 1) NOT IN ('Z', '+', '-');

