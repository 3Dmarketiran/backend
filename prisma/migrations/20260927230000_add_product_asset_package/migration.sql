CREATE TABLE "ProductAssetPackage" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAssetPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAssetPackage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductAssetPackage_productId_key" ON "ProductAssetPackage"("productId");
