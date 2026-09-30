CREATE TABLE "SubscriptionPlanCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlanCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlanCategory_slug_key" ON "SubscriptionPlanCategory"("slug");
CREATE INDEX "SubscriptionPlanCategory_isActive_sortOrder_idx" ON "SubscriptionPlanCategory"("isActive", "sortOrder");

ALTER TABLE "SubscriptionPlan" ADD COLUMN "categoryId" TEXT;
ALTER TABLE "SubscriptionPlan" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "SubscriptionPlan_categoryId_sortOrder_idx" ON "SubscriptionPlan"("categoryId", "sortOrder");
CREATE INDEX "SubscriptionPlan_isActive_sortOrder_idx" ON "SubscriptionPlan"("isActive", "sortOrder");

INSERT INTO "SubscriptionPlanCategory" ("id", "name", "slug", "description", "sortOrder", "isActive", "updatedAt")
VALUES ('subscription-category-general', 'پلن‌های عمومی', 'general', 'پلن‌های عمومی فروشندگان', 0, true, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "SubscriptionPlan"
SET "categoryId" = 'subscription-category-general'
WHERE "categoryId" IS NULL;

ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SubscriptionPlanCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
