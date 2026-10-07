import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { env, isProduction } from "./env";

// D1 is accessed from Render through Prisma's D1 HTTP adapter.
// This keeps the existing Prisma data-access layer while changing the
// database engine from Supabase/PostgreSQL to Cloudflare D1/SQLite.
const adapter = new PrismaD1({
  CLOUDFLARE_D1_TOKEN: env.CLOUDFLARE_D1_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_DATABASE_ID: env.CLOUDFLARE_DATABASE_ID,
});

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });

if (!isProduction) {
  global.__prisma = prisma;
}
