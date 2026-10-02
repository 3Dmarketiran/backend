-- 3DMarketIran seller plans: 3 tiers × 3 durations.
-- Limits are seller-wide totals, not per-product quotas.

INSERT INTO "SubscriptionPlanCategory" ("id", "name", "slug", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('plan-cat-starter', 'Starter', 'starter', 'پلن پایه فروشندگان', 0, true, NOW(), NOW()),
  ('plan-cat-semi', 'نیمه‌حرفه‌ای', 'semi-professional', 'پلن نیمه‌حرفه‌ای فروشندگان', 1, true, NOW(), NOW()),
  ('plan-cat-professional', 'حرفه‌ای', 'professional', 'پلن حرفه‌ای فروشندگان', 2, true, NOW(), NOW())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = NOW();

DO $$
DECLARE
  starter_id TEXT;
  semi_id TEXT;
  professional_id TEXT;
BEGIN
  SELECT "id" INTO starter_id FROM "SubscriptionPlanCategory" WHERE "slug" = 'starter';
  SELECT "id" INTO semi_id FROM "SubscriptionPlanCategory" WHERE "slug" = 'semi-professional';
  SELECT "id" INTO professional_id FROM "SubscriptionPlanCategory" WHERE "slug" = 'professional';

  -- Starter: 10 products / 500 MB total
  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-starter-90', 'Starter', 90, 1100000, 0, NULL, 10, 500, starter_id, 0, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = starter_id AND "durationDays" = 90);
  UPDATE "SubscriptionPlan" SET "name"='Starter', "price"=1100000, "discountPct"=0, "productLimit"=10, "storageLimitMb"=500, "sortOrder"=0, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=starter_id AND "durationDays"=90;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-starter-180', 'Starter', 180, 2200000, 0, NULL, 10, 500, starter_id, 1, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = starter_id AND "durationDays" = 180);
  UPDATE "SubscriptionPlan" SET "name"='Starter', "price"=2200000, "discountPct"=0, "productLimit"=10, "storageLimitMb"=500, "sortOrder"=1, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=starter_id AND "durationDays"=180;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-starter-365', 'Starter', 365, 4400000, 0, NULL, 10, 500, starter_id, 2, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = starter_id AND "durationDays" = 365);
  UPDATE "SubscriptionPlan" SET "name"='Starter', "price"=4400000, "discountPct"=0, "productLimit"=10, "storageLimitMb"=500, "sortOrder"=2, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=starter_id AND "durationDays"=365;

  -- Semi-Professional: 30 products / 1.5 GB total
  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-semi-90', 'نیمه‌حرفه‌ای', 90, 2000000, 0, NULL, 30, 1536, semi_id, 0, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = semi_id AND "durationDays" = 90);
  UPDATE "SubscriptionPlan" SET "name"='نیمه‌حرفه‌ای', "price"=2000000, "discountPct"=0, "productLimit"=30, "storageLimitMb"=1536, "sortOrder"=0, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=semi_id AND "durationDays"=90;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-semi-180', 'نیمه‌حرفه‌ای', 180, 4000000, 0, NULL, 30, 1536, semi_id, 1, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = semi_id AND "durationDays" = 180);
  UPDATE "SubscriptionPlan" SET "name"='نیمه‌حرفه‌ای', "price"=4000000, "discountPct"=0, "productLimit"=30, "storageLimitMb"=1536, "sortOrder"=1, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=semi_id AND "durationDays"=180;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-semi-365', 'نیمه‌حرفه‌ای', 365, 8000000, 0, NULL, 30, 1536, semi_id, 2, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = semi_id AND "durationDays" = 365);
  UPDATE "SubscriptionPlan" SET "name"='نیمه‌حرفه‌ای', "price"=8000000, "discountPct"=0, "productLimit"=30, "storageLimitMb"=1536, "sortOrder"=2, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=semi_id AND "durationDays"=365;

  -- Professional: 100 products / 5 GB total
  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-pro-90', 'حرفه‌ای', 90, 4200000, 0, NULL, 100, 5120, professional_id, 0, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = professional_id AND "durationDays" = 90);
  UPDATE "SubscriptionPlan" SET "name"='حرفه‌ای', "price"=4200000, "discountPct"=0, "productLimit"=100, "storageLimitMb"=5120, "sortOrder"=0, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=professional_id AND "durationDays"=90;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-pro-180', 'حرفه‌ای', 180, 8400000, 0, NULL, 100, 5120, professional_id, 1, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = professional_id AND "durationDays" = 180);
  UPDATE "SubscriptionPlan" SET "name"='حرفه‌ای', "price"=8400000, "discountPct"=0, "productLimit"=100, "storageLimitMb"=5120, "sortOrder"=1, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=professional_id AND "durationDays"=180;

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-pro-365', 'حرفه‌ای', 365, 16800000, 0, NULL, 100, 5120, professional_id, 2, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "categoryId" = professional_id AND "durationDays" = 365);
  UPDATE "SubscriptionPlan" SET "name"='حرفه‌ای', "price"=16800000, "discountPct"=0, "productLimit"=100, "storageLimitMb"=5120, "sortOrder"=2, "isActive"=true, "updatedAt"=NOW() WHERE "categoryId"=professional_id AND "durationDays"=365;

  -- Internal campaign trial: 30 days, Starter limits, hidden from public plan listings.
  INSERT INTO "SubscriptionPlanCategory" ("id", "name", "slug", "description", "sortOrder", "isActive", "createdAt", "updatedAt")
  VALUES ('plan-cat-campaign', 'کمپین داخلی', 'campaign-internal', 'پلن داخلی آزمایشی — برای کمپین یک‌ماهه رایگان', 99, false, NOW(), NOW())
  ON CONFLICT ("slug") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "sortOrder" = EXCLUDED."sortOrder",
    "isActive" = false,
    "updatedAt" = NOW();

  INSERT INTO "SubscriptionPlan" ("id", "name", "durationDays", "price", "discountPct", "features", "productLimit", "storageLimitMb", "categoryId", "sortOrder", "isActive", "createdAt", "updatedAt")
  SELECT 'plan-campaign-trial-30', 'کمپین رایگان', 30, 0, 100, NULL, 10, 500,
         (SELECT "id" FROM "SubscriptionPlanCategory" WHERE "slug" = 'campaign-internal'), 0, true, NOW(), NOW()
  WHERE NOT EXISTS (SELECT 1 FROM "SubscriptionPlan" WHERE "id" = 'plan-campaign-trial-30');
  UPDATE "SubscriptionPlan" SET
    "name" = 'کمپین رایگان', "durationDays" = 30, "price" = 0, "discountPct" = 100,
    "productLimit" = 10, "storageLimitMb" = 500,
    "categoryId" = (SELECT "id" FROM "SubscriptionPlanCategory" WHERE "slug" = 'campaign-internal'),
    "sortOrder" = 0, "isActive" = true, "updatedAt" = NOW()
  WHERE "id" = 'plan-campaign-trial-30';

  -- Hide the old generic catalog from new purchases, while preserving any
  -- currently-active legacy subscriptions until their paid period ends.
  UPDATE "SubscriptionPlan" p
  SET "isActive" = false, "updatedAt" = NOW()
  WHERE p."name" IN ('یک ماهه', 'سه ماهه', 'شش ماهه', 'یک ساله')
    AND p."categoryId" = (SELECT "id" FROM "SubscriptionPlanCategory" WHERE "slug" = 'general')
    AND NOT EXISTS (
      SELECT 1
      FROM "Subscription" s
      WHERE s."planId" = p."id"
        AND s."status" = 'ACTIVE'
        AND (s."startDate" IS NULL OR s."startDate" <= NOW())
        AND (s."endDate" IS NULL OR s."endDate" >= NOW())
    );

  -- Keep the legacy category hidden from public/new-plan selection even if a
  -- legacy subscription must remain active for an existing seller.
  UPDATE "SubscriptionPlanCategory"
  SET "isActive" = false, "updatedAt" = NOW()
  WHERE "slug" = 'general';
END $$;
