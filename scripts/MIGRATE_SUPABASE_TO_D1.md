# Supabase -> D1 migration

This migration is deliberately **one-way**:

- Supabase is read with `GET` requests only.
- No Supabase row is deleted, updated, or inserted.
- Rows keep their original primary-key IDs.
- Data is sent to the D1 `/import` Worker in batches of at most 100 rows.
- `_prisma_migrations` is not migrated.
- R2/object storage is not migrated by this script.
- Running the script again is safe at the row level because the D1 import Worker uses `INSERT OR REPLACE`.

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

`Category` has a self-referencing `parentId`. The script imports the entire Category table as rows, so parent/child category relationships keep their original IDs. D1 foreign-key enforcement must be compatible with the existing schema/import setup.

## 5. Important note about storageKey

Fields such as:

- `logoStorageKey`
- `storageKey`
- model/package storage keys

are copied as ordinary string values. They are **not rewritten**.

Actual files/objects are intentionally left for the later Supabase Storage -> R2 migration.

## 6. Re-running

The migration can be run again after fixing an error.

The D1 Worker currently accepts a maximum of 100 rows and uses:

```sql
INSERT OR REPLACE
```

so rows with the same primary key are replaced rather than duplicated.

This script itself does not attempt to delete or clean anything in either database.

## 7. What is not migrated

The following are intentionally excluded:

- `_prisma_migrations`
- Supabase Storage objects
- R2 objects

Those are separate migration phases.
