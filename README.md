# Platform Backend

## Local setup (Windows)

1. Install Node.js 20+ (Node 24 is supported by this project).
2. Open CMD in this directory.
3. Run `npm install`.
4. Run `copy .env.example .env`.
5. Run `npm run prisma:generate`.
6. Run `npm run migrate` on a fresh checkout.
7. Run `npm run seed`.
8. Run `npm run dev`.

The root `start.bat` performs these first-run steps automatically.

## SQLite/Prisma compatibility

SQLite is the local database and does not require a separate database server. Prisma's SQLite connector does not support native enum or Json columns. This project therefore stores enum-like values as validated strings and JSON objects as serialized text. The application layer provides TypeScript constants/unions and JSON parse/serialize helpers so API consumers still receive structured JSON.

The GitHub token is never stored in the database and is never returned by an API endpoint. It belongs only in the backend environment (`GITHUB_TOKEN`).

## Render migration recovery — existing `Seller.themeColor`

If Render reports Prisma `P3018` / PostgreSQL `42701` because `Seller.themeColor` already exists, do **not** reset or drop the production database. The migration `20260925090000_add_seller_theme_color` is intentionally idempotent. Mark only the failed migration as rolled back, then let Prisma deploy it again:

```bash
npx prisma migrate resolve --rolled-back 20260925090000_add_seller_theme_color || true
npx prisma migrate deploy
```

For the normal Render build command, keep `prisma migrate deploy` before `npm run build`. Never use `prisma migrate reset` against the production database.
