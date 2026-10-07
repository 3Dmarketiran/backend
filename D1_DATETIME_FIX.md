# D1 DateTime Fix

Prisma 6.x with the D1 adapter expects RFC3339/ISO-8601 DateTime text with an explicit timezone.
Legacy imported rows such as `2026-09-20T22:15:01.669` have no timezone suffix and cause Prisma P2023 on reads.

This release fixes the problem in two ways:

1. `d1/migrations/0002_normalize_datetime.sql` normalizes existing rows by appending `Z` to timezone-less ISO timestamps.
2. `src/config/d1DateTimeRepair.ts` runs before the HTTP server starts and repairs any legacy rows that may still exist in the live D1 database. It is idempotent and does not delete data.

Render startup therefore becomes:

- connect to D1 through Prisma's D1 adapter
- normalize legacy DateTime strings through Cloudflare's D1 API
- start the API server

No database reset is required.
