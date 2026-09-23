ALTER TABLE "Seller" ADD COLUMN "sellerCategoryId" TEXT;

CREATE INDEX "Seller_sellerCategoryId_idx" ON "Seller"("sellerCategoryId");

ALTER TABLE "Seller"
ADD CONSTRAINT "Seller_sellerCategoryId_fkey"
FOREIGN KEY ("sellerCategoryId") REFERENCES "Category"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
