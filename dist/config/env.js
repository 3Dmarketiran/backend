"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
// Centralized, validated environment configuration.
// Fails fast on boot if required secrets are missing — never falls back to
// insecure defaults in a way that could silently run production without them.
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    PORT: zod_1.z.coerce.number().default(4000),
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    SESSION_SECRET: zod_1.z
        .string()
        .min(32, "SESSION_SECRET must be at least 32 characters (use: openssl rand -hex 32)"),
    // GitHub publishing layer — server-side only, never sent to any frontend.
    GITHUB_TOKEN: zod_1.z.string().optional(),
    GITHUB_OWNER: zod_1.z.string().optional(),
    GITHUB_REPOSITORY: zod_1.z.string().optional(),
    GITHUB_BRANCH: zod_1.z.string().default("main"),
    PUBLIC_SITE_URL: zod_1.z.string().url().optional(),
    PUBLIC_ASSET_BASE_URL: zod_1.z.string().url().optional(),
    PUBLISH_ASSETS_TO_GITHUB: zod_1.z.coerce.boolean().default(true),
    API_URL: zod_1.z.string().url().optional(),
    CORS_ORIGIN: zod_1.z.string().default("http://localhost:5173"),
    // Storage abstraction (Phase 2 implements the providers; env selects one)
    STORAGE_PROVIDER: zod_1.z.enum(["local", "s3"]).default("local"),
    STORAGE_BUCKET: zod_1.z.string().optional(),
    STORAGE_ENDPOINT: zod_1.z.string().optional(),
    STORAGE_ACCESS_KEY: zod_1.z.string().optional(),
    STORAGE_SECRET_KEY: zod_1.z.string().optional(),
    RATE_LIMIT_WINDOW_MS: zod_1.z.coerce.number().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: zod_1.z.coerce.number().default(100),
    LOGIN_RATE_LIMIT_MAX: zod_1.z.coerce.number().default(10),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // Never leak this to an HTTP response — this only ever prints to server logs at boot.
    console.error("❌ Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
exports.isProduction = exports.env.NODE_ENV === "production";
//# sourceMappingURL=env.js.map