import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { StorageProvider, StoredFile } from "./StorageProvider";
import { env } from "../config/env";

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

/**
 * Development-friendly storage provider that writes to local disk and
 * serves files back via the backend's own static file route
 * (see index.ts: app.use("/files", ...)).
 *
 * NOT suitable for production behind multiple server instances or for
 * assets that must remain reachable from the public static GitHub Pages
 * site independently of this backend staying online — use S3Storage for
 * that (see storage/S3Storage.ts).
 */
export class LocalStorageProvider implements StorageProvider {
  async save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredFile> {
    const safeExt = path.extname(params.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safeName = `${nanoid(16)}${safeExt}`;
    const relDir = sanitizeFolder(params.folder);
    const absDir = path.join(UPLOAD_ROOT, relDir);

    await fs.mkdir(absDir, { recursive: true });

    const storageKey = path.posix.join(relDir, safeName);
    const absPath = path.join(UPLOAD_ROOT, storageKey);

    // Defense-in-depth: verify the resolved path is still inside UPLOAD_ROOT
    // even though sanitizeFolder() already strips traversal sequences.
    if (!absPath.startsWith(UPLOAD_ROOT)) {
      throw new Error("Invalid storage path (path traversal attempt blocked).");
    }

    await fs.writeFile(absPath, params.buffer);

    return {
      storageKey,
      url: `${env.API_URL ?? "http://localhost:" + env.PORT}/files/${storageKey}`,
      sizeBytes: params.buffer.byteLength,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const absPath = path.join(UPLOAD_ROOT, sanitizeFolder(storageKey));
    if (!absPath.startsWith(UPLOAD_ROOT)) return;
    await fs.rm(absPath, { force: true });
  }

  async getUrl(storageKey: string): Promise<string> {
    return `${env.API_URL ?? "http://localhost:" + env.PORT}/files/${storageKey}`;
  }

  async read(storageKey: string): Promise<Buffer> {
    const absPath = path.join(UPLOAD_ROOT, sanitizeFolder(storageKey));
    if (!absPath.startsWith(UPLOAD_ROOT)) {
      throw new Error("Invalid storage path (path traversal attempt blocked).");
    }
    return fs.readFile(absPath);
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await fs.mkdir(UPLOAD_ROOT, { recursive: true });
      await fs.access(UPLOAD_ROOT);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "unknown error" };
    }
  }
}

/** Strips path traversal sequences and leading slashes from a folder/key. */
function sanitizeFolder(input: string): string {
  return input
    .split("/")
    .filter((seg) => seg !== "" && seg !== "." && seg !== "..")
    .join("/");
}
