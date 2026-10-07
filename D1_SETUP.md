# Cloudflare D1 setup

This release uses **Cloudflare D1 as the runtime database**. Supabase is no longer used as the application database.

## 1. Create the D1 database

```bash
npx wrangler d1 create 3dmarketiran
```

Put the returned database ID in `wrangler.toml`.

## 2. Apply the initial schema

```bash
npx wrangler d1 execute 3dmarketiran --remote --file=./d1/migrations/0001_initial.sql
```

This creates an empty D1 schema. It intentionally does **not** import/copy any Supabase data.

## 3. Render environment variables

```text
CLOUDFLARE_ACCOUNT_ID=<Cloudflare account ID>
CLOUDFLARE_DATABASE_ID=<D1 database ID>
CLOUDFLARE_D1_TOKEN=<Cloudflare API token with D1 Edit permission>
```

Keep the token secret. The Render service reaches D1 through Prisma's D1 HTTP adapter.

## 4. Render commands

Build:

```bash
npm install && npm run build
```

Start:

```bash
npm start
```

The Render service does not run `prisma migrate deploy` because D1 schema application is handled by Wrangler. This avoids treating D1's internal tables as a normal Postgres/Prisma migration target.
