import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import type { StorageProvider, StoredFile } from "./StorageProvider";
import { env } from "../config/env";

const DEFAULT_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function sanitizeFilename(filename: string): string {
  const normalized = normalizeSlashes(filename).split("/").pop() || "";

  const ext = path.extname(normalized).toLowerCase();
  const base = path.basename(normalized, path.extname(normalized));

  const safeBase = base
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "_")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 120);

  const finalBase = safeBase || "file";

  return `${finalBase}${ext}`;
}

function sanitizeStorageKey(value: string): string {
  const normalized = normalizeSlashes(value).replace(/^\/+|\/+$/g, "");

  if (!normalized) {
    throw new Error("Storage key cannot be empty.");
  }

  const parts = normalized.split("/");

  for (const part of parts) {
    if (!part || part === "." || part === "..") {
      throw new Error("Invalid storage key.");
    }

    if (!SAFE_SEGMENT.test(part)) {
      throw new Error("Storage key contains an invalid path segment.");
    }
  }

  return parts.join("/");
}

function safeResolve(root: string, storageKey: string): string {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, storageKey);

  if (
    absolutePath !== absoluteRoot &&
    !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    throw new Error("Invalid storage path.");
  }

  return absolutePath;
}

function extensionOf(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function createRandomFilename(originalFilename: string): string {
  const ext = extensionOf(originalFilename);
  const randomPart = `${Date.now().toString(36)}-${randomBytes(10).toString("hex")}-${nanoid(8)}`;

  return `${randomPart}${ext}`;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor() {
    this.root = DEFAULT_UPLOAD_ROOT;
  }

  private async ensureRoot(): Promise<void> {
    await fs.mkdir(this.root, {
      recursive: true,
    });
  }

  private buildStorageKey(
    folder: string,
    filename: string,
    explicitStorageKey?: string
  ): string {
    if (explicitStorageKey) {
      return sanitizeStorageKey(explicitStorageKey);
    }

    const safeFolder = sanitizeStorageKey(folder);
    const safeFilename = sanitizeFilename(filename);

    return `${safeFolder}/${createRandomFilename(safeFilename)}`;
  }

  private publicUrl(storageKey: string): string {
    const encodedPath = storageKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    const baseUrl = (
      env.PUBLIC_ASSET_BASE_URL ??
      `http://localhost:${env.PORT}/files`
    ).replace(/\/+$/, "");

    return `${baseUrl}/${encodedPath}`;
  }

  async save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
    storageKey?: string;
  }): Promise<StoredFile> {
    await this.ensureRoot();

    if (!Buffer.isBuffer(params.buffer)) {
      throw new Error("Storage save requires a Buffer.");
    }

    if (params.buffer.length === 0) {
      throw new Error("Cannot store an empty file.");
    }

    const storageKey = this.buildStorageKey(
      params.folder,
      params.filename,
      params.storageKey
    );

    const destination = safeResolve(this.root, storageKey);

    await fs.mkdir(path.dirname(destination), {
      recursive: true,
    });

    try {
      await fs.writeFile(destination, params.buffer, {
        flag: "wx",
      });
    } catch (error: any) {
      if (error?.code === "EEXIST") {
        throw new Error("Storage key already exists.");
      }

      throw error;
    }

    return {
      storageKey,
      url: this.publicUrl(storageKey),
      sizeBytes: params.buffer.length,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const safeKey = sanitizeStorageKey(storageKey);
    const target = safeResolve(this.root, safeKey);

    try {
      await fs.unlink(target);
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        return;
      }

      throw error;
    }

    await this.removeEmptyParentDirectories(path.dirname(target));
  }

  private async removeEmptyParentDirectories(startDirectory: string): Promise<void> {
    const root = path.resolve(this.root);
    let current = path.resolve(startDirectory);

    while (
      current !== root &&
      current.startsWith(`${root}${path.sep}`)
    ) {
      try {
        const entries = await fs.readdir(current);

        if (entries.length > 0) {
          break;
        }

        await fs.rmdir(current);
        current = path.dirname(current);
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          break;
        }

        if (error?.code === "ENOTEMPTY") {
          break;
        }

        throw error;
      }
    }
  }

  async getUrl(storageKey: string): Promise<string> {
    const safeKey = sanitizeStorageKey(storageKey);

    const target = safeResolve(this.root, safeKey);

    try {
      await fs.access(target);
    } catch {
      throw new Error("Stored file not found.");
    }

    return this.publicUrl(safeKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const safeKey = sanitizeStorageKey(storageKey);
    const target = safeResolve(this.root, safeKey);

    return fs.readFile(target);
  }

  async readStream(storageKey: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength?: number;
  }> {
    const safeKey = sanitizeStorageKey(storageKey);
    const target = safeResolve(this.root, safeKey);
    const stat = await fs.stat(target);

    const fsModule = await import("node:fs");
    return {
      stream: fsModule.createReadStream(target),
      contentLength: stat.size,
    };
  }

  async healthCheck(): Promise<{
    ok: boolean;
    message?: string;
  }> {
    try {
      await this.ensureRoot();

      await fs.access(this.root);

      const testDirectory = path.join(
        this.root,
        ".healthcheck"
      );

      await fs.mkdir(testDirectory, {
        recursive: true,
      });

      const testFile = path.join(
        testDirectory,
        `${Date.now()}-${nanoid(6)}.tmp`
      );

      await fs.writeFile(testFile, "ok", {
        encoding: "utf8",
        flag: "wx",
      });

      await fs.unlink(testFile);

      try {
        await fs.rmdir(testDirectory);
      } catch {
        // Another process may have recreated/populated the directory.
      }

      return {
        ok: true,
        message: "Local storage is healthy.",
      };
    } catch (error: any) {
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

export default LocalStorageProvider;
