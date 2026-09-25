-- Idempotent recovery-safe migration.
-- The column may already exist in production because it was introduced
-- before this migration was recorded in Prisma's migration history.
ALTER TABLE "Seller"
ADD COLUMN IF NOT EXISTS "themeColor" TEXT;
