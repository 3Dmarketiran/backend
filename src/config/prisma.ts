import { PrismaClient } from "@prisma/client";
import { isProduction } from "./env";

// Single shared Prisma instance (recommended pattern to avoid exhausting
// database connections in dev with hot-reload).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: isProduction ? ["error", "warn"] : ["error", "warn"],
  });

if (!isProduction) {
  global.__prisma = prisma;
}
