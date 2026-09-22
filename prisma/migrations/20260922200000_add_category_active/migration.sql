-- Add active status to categories.
-- Inactive categories remain in the database and keep their products,
-- but can be hidden from seller/public category selection.

ALTER TABLE "Category"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Index used when filtering active/inactive categories.
CREATE INDEX "Category_isActive_idx"
ON "Category"("isActive");

-- Index used for category tree / parent-child lookups.
CREATE INDEX "Category_parentId_idx"
ON "Category"("parentId");
