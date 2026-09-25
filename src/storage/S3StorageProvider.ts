import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import path from "node:path";
import type { StorageProvider, StoredFile } from "./StorageProvider";
import { env } from "../config/env";

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
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!env.STORAGE_BUCKET) {
      throw new Error("STORAGE_BUCKET must be set when STORAGE_PROVIDER=s3");
    }
    this.bucket = env.STORAGE_BUCKET;
    this.client = new S3Client({
      endpoint: env.STORAGE_ENDPOINT, // omit for AWS S3 itself; set for R2/Spaces/MinIO
      region: "auto",
      credentials:
        env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY
          ? { accessKeyId: env.STORAGE_ACCESS_KEY, secretAccessKey: env.STORAGE_SECRET_KEY }
          : undefined,
      forcePathStyle: true,
    });
  }

  async save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredFile> {
    const safeExt = path.extname(params.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const key = `${sanitizeFolder(params.folder)}/${nanoid(16)}${safeExt}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: params.buffer,
        ContentType: params.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    return {
      storageKey: key,
      url: this.publicUrl(key),
      sizeBytes: params.buffer.byteLength,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }

  async getUrl(storageKey: string): Promise<string> {
    return this.publicUrl(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey })
    );
    if (!result.Body) throw new Error("Storage object has no body.");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
    }
  }

  private publicUrl(key: string): string {
  const baseUrl =
    env.PUBLIC_ASSET_BASE_URL ??
    "https://sbmdpgkrjzbegcafdgbd.supabase.co/storage/v1/object/public/3Dmarketiran";

  return `${baseUrl.replace(/\/$/, "")}/${key}`;
}
}

function sanitizeFolder(input: string): string {
  return input
    .split("/")
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
    .join("/");
}
