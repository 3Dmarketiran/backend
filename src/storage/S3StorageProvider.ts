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
 * Production storage provider for S3-compatible object storage.
 *
 * Supported examples:
 * - Supabase Storage S3 API
 * - AWS S3
 * - Cloudflare R2
 * - DigitalOcean Spaces
 * - MinIO
 *
 * Required configuration when STORAGE_PROVIDER=s3:
 * - STORAGE_BUCKET
 * - STORAGE_ACCESS_KEY
 * - STORAGE_SECRET_KEY
 *
 * STORAGE_ENDPOINT is required for S3-compatible services such as
 * Supabase, R2, Spaces and MinIO, but is optional for native AWS S3.
 *
 * Public asset URLs are controlled exclusively by PUBLIC_ASSET_BASE_URL.
 * No provider-specific URL or bucket is hard-coded here.
 */
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    if (!env.STORAGE_BUCKET) {
      throw new Error(
        "STORAGE_BUCKET must be set when STORAGE_PROVIDER=s3."
      );
    }

    if (!env.STORAGE_ACCESS_KEY) {
      throw new Error(
        "STORAGE_ACCESS_KEY must be set when STORAGE_PROVIDER=s3."
      );
    }

    if (!env.STORAGE_SECRET_KEY) {
      throw new Error(
        "STORAGE_SECRET_KEY must be set when STORAGE_PROVIDER=s3."
      );
    }

    if (!env.PUBLIC_ASSET_BASE_URL) {
      throw new Error(
        "PUBLIC_ASSET_BASE_URL must be set when STORAGE_PROVIDER=s3."
      );
    }

    this.bucket = env.STORAGE_BUCKET;

    this.client = new S3Client({
      ...(env.STORAGE_ENDPOINT
        ? {
            endpoint: env.STORAGE_ENDPOINT,
            forcePathStyle: true,
          }
        : {
            forcePathStyle: false,
          }),
      region: "auto",
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY,
        secretAccessKey: env.STORAGE_SECRET_KEY,
      },
    });
  }

  async save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
    storageKey?: string;
  }): Promise<StoredFile> {
    if (!params.buffer || params.buffer.length === 0) {
      throw new Error("Cannot store an empty file.");
    }

    const folder = sanitizeFolder(params.folder);

    if (!folder) {
      throw new Error("Storage folder is required.");
    }

    const extension = getSafeExtension(params.filename);
    const key = params.storageKey
      ? sanitizeStorageKey(params.storageKey)
      : `${folder}/${nanoid(16)}${extension}`;

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
    const key = sanitizeStorageKey(storageKey);

    if (!key) {
      throw new Error("Storage key is required.");
    }

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async getUrl(storageKey: string): Promise<string> {
    const key = sanitizeStorageKey(storageKey);

    if (!key) {
      throw new Error("Storage key is required.");
    }

    return this.publicUrl(key);
  }

  async read(storageKey: string): Promise<Buffer> {
    const key = sanitizeStorageKey(storageKey);

    if (!key) {
      throw new Error("Storage key is required.");
    }

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      throw new Error("Storage object has no body.");
    }

    return Buffer.from(await result.Body.transformToByteArray());
  }

  async readStream(storageKey: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength?: number;
  }> {
    const key = sanitizeStorageKey(storageKey);

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    if (!result.Body) {
      throw new Error("Storage object has no body.");
    }

    return {
      stream: result.Body as unknown as NodeJS.ReadableStream,
      contentLength: result.ContentLength,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        })
      );

      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Storage health check failed.",
      };
    }
  }

  private publicUrl(key: string): string {
    if (!env.PUBLIC_ASSET_BASE_URL) {
      throw new Error(
        "PUBLIC_ASSET_BASE_URL must be configured for public storage URLs."
      );
    }

    const baseUrl = env.PUBLIC_ASSET_BASE_URL.replace(/\/+$/, "");

    const encodedKey = key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    return `${baseUrl}/${encodedKey}`;
  }
}

function getSafeExtension(filename: string): string {
  const extension = path.extname(filename).toLowerCase();

  if (!extension) {
    return "";
  }

  const sanitized = extension.replace(/[^a-z0-9.]/g, "");

  if (!sanitized.startsWith(".")) {
    return "";
  }

  return sanitized;
}

function sanitizeFolder(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .filter(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".."
    )
    .map((segment) =>
      segment.replace(/[^a-zA-Z0-9._-]/g, "-")
    )
    .filter(Boolean)
    .join("/");
}

function sanitizeStorageKey(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .filter(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".."
    )
    .join("/");
}
