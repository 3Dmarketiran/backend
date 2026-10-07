import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value, ctx) => {
    if (typeof value === "boolean") {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Expected a boolean value.",
    });

    return z.NEVER;
  });

const optionalUrl = z
  .string()
  .trim()
  .url()
  .optional();

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    PORT: z
      .coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(4000),

    // Local Prisma CLI database path. Runtime production access uses the D1 HTTP adapter below.
    DATABASE_URL: z
      .string()
      .trim()
      .min(1)
      .default("file:./prisma/dev.db"),

    CLOUDFLARE_ACCOUNT_ID: z.string().trim().min(1, "CLOUDFLARE_ACCOUNT_ID is required."),
    CLOUDFLARE_DATABASE_ID: z.string().trim().min(1, "CLOUDFLARE_DATABASE_ID is required."),
    CLOUDFLARE_D1_TOKEN: z.string().trim().min(1, "CLOUDFLARE_D1_TOKEN is required."),

    SESSION_SECRET: z
      .string()
      .min(
        32,
        "SESSION_SECRET must contain at least 32 characters.",
      ),

    GITHUB_TOKEN: z
      .string()
      .trim()
      .min(1)
      .optional(),

    GITHUB_OWNER: z
      .string()
      .trim()
      .min(1)
      .optional(),

    GITHUB_REPOSITORY: z
      .string()
      .trim()
      .min(1)
      .optional(),

    GITHUB_BRANCH: z
      .string()
      .trim()
      .min(1)
      .default("main"),

    PUBLIC_SITE_URL: optionalUrl,

    PUBLIC_PUBLISH_TIMEOUT_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),

    PUBLIC_ASSET_BASE_URL: optionalUrl,

    PUBLISH_ASSETS_TO_GITHUB: booleanFromEnv.default(true),

    API_URL: optionalUrl,

    CORS_ORIGIN: z
      .string()
      .trim()
      .min(1)
      .default("http://localhost:5173"),

    STORAGE_PROVIDER: z
      .enum(["local", "s3"])
      .default("local"),

    STORAGE_BUCKET: z
      .string()
      .trim()
      .min(1)
      .optional(),

    STORAGE_ENDPOINT: optionalUrl,

    STORAGE_REGION: z
      .string()
      .trim()
      .min(1)
      .default("auto"),

    STORAGE_ACCESS_KEY: z
      .string()
      .trim()
      .min(1)
      .optional(),

    STORAGE_SECRET_KEY: z
      .string()
      .trim()
      .min(1)
      .optional(),

    RATE_LIMIT_WINDOW_MS: z
      .coerce
      .number()
      .int()
      .positive()
      .default(15 * 60 * 1000),

    RATE_LIMIT_MAX: z
      .coerce
      .number()
      .int()
      .positive()
      .default(100),

    LOGIN_RATE_LIMIT_MAX: z
      .coerce
      .number()
      .int()
      .positive()
      .default(10),

    // Economic guardrails used by traffic quota and pricing validation.
    // These are conservative planning assumptions, not a provider invoice.
    TRAFFIC_COST_PER_GB_TOMAN: z
      .coerce
      .number()
      .int()
      .nonnegative()
      .default(23400),

    TRAFFIC_FIXED_COST_TOMAN: z
      .coerce
      .number()
      .int()
      .nonnegative()
      .default(83200),

    TRAFFIC_MIN_PRICE_MARGIN_PCT: z
      .coerce
      .number()
      .min(0)
      .max(500)
      .default(20),

    TRAFFIC_BUNDLE_MIN_MARGIN_PCT: z
      .coerce
      .number()
      .min(0)
      .max(500)
      .default(25),
  })
  .superRefine((value, ctx) => {
    const isProduction =
      value.NODE_ENV === "production";

    const hasGithubConfig =
      Boolean(
        value.GITHUB_TOKEN &&
          value.GITHUB_OWNER &&
          value.GITHUB_REPOSITORY,
      );

    const hasPartialGithubConfig =
      Boolean(
        value.GITHUB_TOKEN ||
          value.GITHUB_OWNER ||
          value.GITHUB_REPOSITORY,
      );

    if (hasPartialGithubConfig && !hasGithubConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["GITHUB_TOKEN"],
        message:
          "GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPOSITORY must be provided together.",
      });
    }

    if (
      value.PUBLISH_ASSETS_TO_GITHUB &&
      !hasGithubConfig
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PUBLISH_ASSETS_TO_GITHUB"],
        message:
          "PUBLISH_ASSETS_TO_GITHUB=true requires complete GitHub configuration.",
      });
    }

    if (value.STORAGE_PROVIDER === "s3") {
      if (!value.STORAGE_BUCKET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_BUCKET"],
          message:
            "STORAGE_BUCKET is required when STORAGE_PROVIDER=s3.",
        });
      }

      if (!value.STORAGE_ENDPOINT) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_ENDPOINT"],
          message:
            "STORAGE_ENDPOINT is required when STORAGE_PROVIDER=s3.",
        });
      }

      if (!value.STORAGE_ACCESS_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_ACCESS_KEY"],
          message:
            "STORAGE_ACCESS_KEY is required when STORAGE_PROVIDER=s3.",
        });
      }

      if (!value.STORAGE_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_SECRET_KEY"],
          message:
            "STORAGE_SECRET_KEY is required when STORAGE_PROVIDER=s3.",
        });
      }
    }

    if (isProduction) {
      if (value.STORAGE_PROVIDER === "local") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["STORAGE_PROVIDER"],
          message:
            "Local storage is not recommended for production. Configure STORAGE_PROVIDER=s3.",
        });
      }

      if (!value.PUBLIC_SITE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PUBLIC_SITE_URL"],
          message:
            "PUBLIC_SITE_URL is required in production.",
        });
      }

      if (!value.API_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["API_URL"],
          message:
            "API_URL is required in production.",
        });
      }

      if (!value.PUBLIC_ASSET_BASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PUBLIC_ASSET_BASE_URL"],
          message:
            "PUBLIC_ASSET_BASE_URL is required in production and must point to the public Cloudflare R2 delivery/custom domain.",
        });
      }

      if (
        value.CORS_ORIGIN
          .split(",")
          .map((origin) => origin.trim())
          .some((origin) =>
            /^https?:\/\/localhost(?::\d+)?$/i.test(
              origin,
            ),
          )
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message:
            "Production CORS_ORIGIN must not contain localhost.",
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "\n[env] Invalid environment configuration:\n",
  );

  for (const issue of parsed.error.issues) {
    console.error(
      `- ${issue.path.join(".") || "environment"}: ${issue.message}`,
    );
  }

  console.error("");

  throw new Error(
    "Invalid environment configuration. Check the server environment variables.",
  );
}

export const env = parsed.data;

export const isProduction =
  env.NODE_ENV === "production";

export const isDevelopment =
  env.NODE_ENV === "development";

export const isTest =
  env.NODE_ENV === "test";

export const corsOrigins = env.CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const hasGithubPublishing =
  Boolean(
    env.GITHUB_TOKEN &&
      env.GITHUB_OWNER &&
      env.GITHUB_REPOSITORY &&
      env.PUBLISH_ASSETS_TO_GITHUB,
  );

export const hasExternalStorage =
  env.STORAGE_PROVIDER === "s3";
