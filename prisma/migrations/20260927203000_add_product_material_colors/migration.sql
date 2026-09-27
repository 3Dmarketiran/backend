-- Add optional product material and multi-color metadata.
ALTER TABLE "Product" ADD COLUMN "material" TEXT;
ALTER TABLE "Product" ADD COLUMN "colors" TEXT;
