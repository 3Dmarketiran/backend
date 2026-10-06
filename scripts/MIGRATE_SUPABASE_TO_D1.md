# Supabase -> D1 migration

This migration is deliberately **one-way**:

- Supabase is read with `GET` requests only.
- No Supabase row is deleted, updated, or inserted.
- Rows keep their original primary-key IDs.
- Data is sent to the D1 `/import` Worker in batches of at most 100 rows.
- `_prisma_migrations` is not migrated.
- R2/object storage is not migrated by this script.
- Running the script again is safe at the row level because the D1 import Worker uses an in-place `INSERT ... ON CONFLICT (id) DO UPDATE` UPSERT. It does not use `INSERT OR REPLACE`, which could delete/reinsert parent rows and trigger `ON DELETE CASCADE`.

## 1. Configure environment variables

Set these in the shell where you run the script:

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
D1_IMPORT_URL=https://YOUR-D1-WORKER.example.com/import
D1_IMPORT_TOKEN=YOUR_IMPORT_TOKEN
```

Optional:

```text
MIGRATION_BATCH_SIZE=100
SUPABASE_PAGE_SIZE=1000
MIGRATION_TABLES=User,Seller,Product
```

**Never commit the service-role key or import token to Git.**

## 2. Run

From `backend`:

```bash
npm run migrate:supabase:d1
```

or:

```bash
node scripts/migrate-supabase-to-d1.mjs
```

The script stops immediately if a Supabase request or D1 import fails.

## 3. Dependency order

The default order is:

1. User
2. Category
3. Session
4. LoginAttempt
5. SubscriptionPlanCategory
6. TrafficBundle
7. PlatformSetting
8. Seller
9. Product
10. ProductImage
11. ProductAssetPackage
12. ProductModel
13. SubscriptionPlan
14. Subscription
15. TrafficUsage
16. TrafficPurchase
17. PublishJob
18. PublishLog
19. AnalyticsEvent
20. AuditLog

This keeps parent rows available before dependent rows.

## 4. Important note about Category

`Category` has a self-referencing `parentId`. The migration runner therefore reads the complete Category table first and orders rows **parent-before-child** before sending them to D1. Original IDs are preserved.

If legacy data contains a cycle, the runner still sends every row exactly once; D1 will reject the batch if the resulting foreign-key relationship is invalid.

## 5. Important note about storageKey

Fields such as:

- `logoStorageKey`
- `storageKey`
- model/package storage keys

are copied as ordinary string values. They are **not rewritten**.

Actual files/objects are intentionally left for the later Supabase Storage -> R2 migration.

## 6. Re-running

The migration can be run again after fixing an error.

The D1 Worker accepts a maximum of 100 rows and uses:

```sql
INSERT INTO ... VALUES (...)
ON CONFLICT ("id") DO UPDATE SET ...
```

Rows with the same primary key are updated in place rather than deleted and re-created. This is important because the schema contains `ON DELETE CASCADE` relationships.

This script itself does not attempt to delete or clean anything in either database.

## 7. What is not migrated

The following are intentionally excluded:

- `_prisma_migrations`
- Supabase Storage objects
- R2 objects

Those are separate migration phases.


## 8. D1 Worker included in this release

The repository now contains:

```text
d1-migration-worker/
  src/index.ts
  migrations/0001_initial_schema.sql
  wrangler.toml
  package.json
  README.md
```

The schema is the final current Prisma model represented with SQLite/D1 types:

- `BOOLEAN` -> `INTEGER` (`0/1`)
- `DOUBLE PRECISION` -> `REAL`
- `TIMESTAMP(3)` -> `TEXT` (ISO-8601 timestamps)
- `BIGINT` -> `INTEGER`

The Worker converts boolean JSON values to `0/1` during import.

Cloudflare D1 enforces foreign keys, and D1 batch calls execute as transactional batches. The import endpoint uses D1 batch statements rather than a single giant multi-row statement.
