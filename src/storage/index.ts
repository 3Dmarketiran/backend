import type { StorageProvider } from "./StorageProvider";
import { LocalStorageProvider } from "./LocalStorageProvider";
import { S3StorageProvider } from "./S3StorageProvider";
import {
  env,
  isProduction,
} from "../config/env";

/**
 * Creates the application's storage provider.
 *
 * Storage is selected exclusively from environment configuration.
 * Route and service code must never instantiate a provider directly.
 *
 * Development:
 *   STORAGE_PROVIDER=local
 *
 * Production:
 *   STORAGE_PROVIDER=s3
 */
function createStorageProvider(): StorageProvider {
  if (env.STORAGE_PROVIDER === "s3") {
    return new S3StorageProvider();
  }

  /*
   * env.ts already prevents local storage in production.
   * This additional guard protects against accidental changes
   * to the configuration layer in the future.
   */
  if (isProduction) {
    throw new Error(
      "Local storage cannot be used in production. Configure STORAGE_PROVIDER=s3.",
    );
  }

  return new LocalStorageProvider();
}

/**
 * Single source of truth for application storage.
 *
 * Every upload/download/delete operation must use this instance.
 * This keeps storage swappable without changing route/service code.
 */
export const storage: StorageProvider =
  createStorageProvider();
