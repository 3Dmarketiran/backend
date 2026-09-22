import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { StorageProvider, StoredFile } from "./StorageProvider";
import { env } from "../config/env";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

/**
 * Development-friendly local filesystem storage provider.
 *
 * This provider is intended for local development/testing only.
 * Production storage is enforced through storage/index.ts and must use
 * an S3-compatible provider.
 *
 * Files are served by the backend static route:
 *
 *   /files/*
 *
 * Example logical storage key:
 *
 *   products/{productId}/images/{generated-file-id}.webp
 */
export class LocalStorageProvider implements StorageProvider {
  async save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredFile> {
    if (!params.buffer || params.buffer.length === 0) {
      throw new Error("Cannot store an empty file.");
    }

    const relDir = sanitizePath(params.folder);

    if (!relDir) {
      throw new Error("Storage folder is required.");
    }

    const extension = getSafeExtension(params.filename);
    const safeName = `${nanoid(16)}${extension}`;

    const storageKey = path.posix.join(relDir, safeName);
    const absPath = resolveStoragePath(storageKey);

    await fs.mkdir(path.dirname(absPath), {
      recursive: true,
    });

    await fs.writeFile(absPath, params.buffer);

    return {
      storageKey,
      url: buildFileUrl(storageKey),
      sizeBytes: params.buffer.byteLength,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const safeKey = sanitizePath(storageKey);

    if (!safeKey) {
      return;
    }

    const absPath = resolveStoragePath(safeKey);

    await fs.rm(absPath, {
      force: true,
    });
  }

  async getUrl(storageKey: string): Promise<string> {
    const safeKey = sanitizePath(storageKey);

    if (!safeKey) {
      throw new Error("Storage key is required.");
    }

    return buildFileUrl(safeKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const safeKey = sanitizePath(storageKey);

    if (!safeKey) {
      throw new Error("Storage key is required.");
    }

    const absPath = resolveStoragePath(safeKey);

    return fs.readFile(absPath);
  }

  async healthCheck(): Promise<{
    ok: boolean;
    message?: string;
  }> {
    try {
      await fs.mkdir(UPLOAD_ROOT, {
        recursive: true,
      });

      await fs.access(UPLOAD_ROOT);

      return {
        ok: true,
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Local storage health check failed.",
      };
    }
  }
}

/**
 * Resolve a storage key against the upload root and verify that the final
 * path remains inside that root.
 *
 * This is defense-in-depth against path traversal.
 */
function resolveStoragePath(storageKey: string): string {
  const normalizedKey = sanitizePath(storageKey);

  if (!normalizedKey) {
    throw new Error("Invalid storage path.");
  }

  const resolvedRoot = path.resolve(UPLOAD_ROOT);
  const resolvedPath = path.resolve(
    resolvedRoot,
    ...normalizedKey.split("/")
  );

  const rootWithSeparator = `${resolvedRoot}${path.sep}`;

  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(rootWithSeparator)
  ) {
    throw new Error(
      "Invalid storage path (path traversal attempt blocked)."
    );
  }

  return resolvedPath;
}

/**
 * Normalize a logical storage path.
 *
 * Both "/" and "\" are treated as path separators so a Windows-style
 * traversal cannot bypass validation.
 */
function sanitizePath(input: string): string {
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

function buildFileUrl(storageKey: string): string {
  const baseUrl = (
    env.API_URL ??
    `http://localhost:${env.PORT}`
  ).replace(/\/+$/, "");

  const encodedKey = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${baseUrl}/files/${encodedKey}`;
}
