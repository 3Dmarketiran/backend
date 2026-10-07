# V92 — Cloudflare D1 Publish Transaction Fix

- Replaced both Prisma interactive transactions in `publishService.ts` with Prisma batch/array transactions.
- Cloudflare D1 does not support `prisma.$transaction(async (tx) => ...)`; publish and unpublish now use `prisma.$transaction([ ... ])`.
- No interactive `$transaction(async ...)` remains under `backend/src`.
- Existing batch transactions in asset/package services were left unchanged.
- `requestPublish` and `requestUnpublish` keep the same validation, conflict handling, and queue behavior.
- Backend `package.json` continues to use `npm install --include=dev && npm run build` on Render.
