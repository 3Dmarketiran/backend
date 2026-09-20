import type { StorageProvider } from "./StorageProvider";
import { LocalStorageProvider } from "./LocalStorageProvider";
import { S3StorageProvider } from "./S3StorageProvider";
import { env } from "../config/env";

/**
 * Single point of truth for which storage backend the app uses.
 * Every other file imports `storage` from here — never instantiate a
 * provider directly elsewhere. This is what makes storage swappable
 * (spec section 5) without touching route/service code.
 */
export const storage: StorageProvider =
  env.STORAGE_PROVIDER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
