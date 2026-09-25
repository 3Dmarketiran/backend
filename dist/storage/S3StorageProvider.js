"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3StorageProvider = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const nanoid_1 = require("nanoid");
const node_path_1 = __importDefault(require("node:path"));
const env_1 = require("../config/env");
/**
 * Production storage provider for any S3-compatible service (AWS S3,
 * Cloudflare R2, DigitalOcean Spaces, MinIO, ...). Configure via
 * STORAGE_BUCKET / STORAGE_ENDPOINT / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY.
 *
 * Objects are written with public-read semantics appropriate for assets
 * referenced from the public static website (product images/3D models).
 * Never route private/admin-only files through this bucket's public URL
 * pattern — those should use a signed URL instead (see getUrl()).
 */
class S3StorageProvider {
    client;
    bucket;
    constructor() {
        if (!env_1.env.STORAGE_BUCKET) {
            throw new Error("STORAGE_BUCKET must be set when STORAGE_PROVIDER=s3");
        }
        this.bucket = env_1.env.STORAGE_BUCKET;
        this.client = new client_s3_1.S3Client({
            endpoint: env_1.env.STORAGE_ENDPOINT, // omit for AWS S3 itself; set for R2/Spaces/MinIO
            region: "auto",
            credentials: env_1.env.STORAGE_ACCESS_KEY && env_1.env.STORAGE_SECRET_KEY
                ? { accessKeyId: env_1.env.STORAGE_ACCESS_KEY, secretAccessKey: env_1.env.STORAGE_SECRET_KEY }
                : undefined,
            forcePathStyle: true,
        });
    }
    async save(params) {
        const safeExt = node_path_1.default.extname(params.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
        const key = `${sanitizeFolder(params.folder)}/${(0, nanoid_1.nanoid)(16)}${safeExt}`;
        await this.client.send(new client_s3_1.PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: params.buffer,
            ContentType: params.contentType,
            CacheControl: "public, max-age=31536000, immutable",
        }));
        return {
            storageKey: key,
            url: this.publicUrl(key),
            sizeBytes: params.buffer.byteLength,
        };
    }
    async delete(storageKey) {
        await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    }
    async getUrl(storageKey) {
        return this.publicUrl(storageKey);
    }
    async read(storageKey) {
        const result = await this.client.send(new client_s3_1.GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
        if (!result.Body)
            throw new Error("Storage object has no body.");
        return Buffer.from(await result.Body.transformToByteArray());
    }
    async healthCheck() {
        try {
            await this.client.send(new client_s3_1.HeadBucketCommand({ Bucket: this.bucket }));
            return { ok: true };
        }
        catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
        }
    }
    publicUrl(key) {
        const baseUrl = env_1.env.PUBLIC_ASSET_BASE_URL ??
            "https://sbmdpgkrjzbegcafdgbd.supabase.co/storage/v1/object/public/3Dmarketiran";
        return `${baseUrl.replace(/\/$/, "")}/${key}`;
    }
}
exports.S3StorageProvider = S3StorageProvider;
function sanitizeFolder(input) {
    return input
        .split("/")
        .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
        .join("/");
}
//# sourceMappingURL=S3StorageProvider.js.map