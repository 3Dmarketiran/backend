-- Persist the exact intent of every publish job.
-- Existing rows default to PUBLISH for backward compatibility.
ALTER TABLE "PublishJob" ADD COLUMN "operation" TEXT NOT NULL DEFAULT 'PUBLISH';
