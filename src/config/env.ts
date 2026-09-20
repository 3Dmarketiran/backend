import "dotenv/config";
import { z } from "zod";

// Centralized, validated environment configuration.
// Fails fast on boot if required secrets are missing — never falls back to
// insecure defaults in a way that could silently run production without them.

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters (use: openssl rand -hex 32)"),

  // GitHub publishing layer — server-side only, never sent to any frontend.
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPOSITORY: z.string().optional(),
  GITHUB_BRANCH: z.string().default("main"),

  PUBLIC_SITE_URL: z.string().url().optional(),
  PUBLIC_ASSET_BASE_URL: z.string().url().optional(),
  PUBLISH_ASSETS_TO_GITHUB: z.coerce.boolean().default(true),
  API_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),

  // Storage abstraction (Phase 2 implements the providers; env selects one)
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Never leak this to an HTTP response — this only ever prints to server logs at boot.
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === "production";
