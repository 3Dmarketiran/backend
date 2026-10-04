-- Prevent race conditions from creating multiple active publish jobs for the same product.
CREATE UNIQUE INDEX "PublishJob_one_active_product"
ON "PublishJob" ("productId")
WHERE "productId" IS NOT NULL AND "status" IN ('QUEUED', 'PROCESSING');

-- Seller/platform rebuilds have productId = NULL; serialize each seller's
-- active rebuild so two admin events cannot race over the same GitHub snapshot.
CREATE UNIQUE INDEX "PublishJob_one_active_seller_rebuild"
ON "PublishJob" ("sellerId")
WHERE "productId" IS NULL AND "status" IN ('QUEUED', 'PROCESSING');
