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
