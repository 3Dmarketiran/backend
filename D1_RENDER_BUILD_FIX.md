# Render build fix — D1 + R2

The previous Render build failed for two independent reasons:

1. Render was installing only production dependencies, so TypeScript could not see `@types/node`, `@types/express`, etc.
2. The project used Prisma 5.22's `PrismaD1` binding adapter while passing Cloudflare D1 HTTP credentials. That adapter shape is for a D1 binding, not the remote HTTP adapter. The project now uses Prisma 6.19, where the D1 HTTP adapter is exposed as `PrismaD1`.

Render now builds with:

```bash
npm install --include=dev && npm run build
```

and pins Node to the 22.x line.

Runtime remains:

- Database: Cloudflare D1
- Storage: Cloudflare R2
- Database access from Render: Prisma D1 HTTP adapter
- No Supabase database connection
- No Supabase Storage -> R2 migration


## DateTime compatibility fix

A legacy D1 import can contain timezone-less ISO timestamps such as `2026-09-20T22:15:01.669`. Prisma 6.19's D1 adapter rejects these when materializing `DateTime` fields. The project now:

- includes `d1/migrations/0002_normalize_datetime.sql` for normal D1 migration workflows;
- runs the same idempotent normalization through the Cloudflare D1 HTTP API before the Render server starts, using the existing `CLOUDFLARE_D1_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_DATABASE_ID` variables;
- preserves the timestamp instant by only adding the UTC `Z` suffix to timezone-less values;
- does not delete users, sessions, products, or any other records.

Cloudflare documents the D1 query endpoint as `POST /accounts/{account_id}/d1/database/{database_id}/query` and supports D1 Write API tokens for these SQL updates. 
