/**
 * StorageProvider abstraction (spec section 5).
 *
 * The rest of the application NEVER touches the filesystem or an S3 SDK
 * directly — it only calls these methods. This means switching from local
 * disk (dev) to S3-compatible object storage (production) is a one-line
 * change in config/storage.ts, not a rewrite.
 */
export interface StoredFile {
  /** Internal key/path used to address the file within the provider. */
  storageKey: string;
  /** Publicly reachable URL (or one the backend can serve) for this file. */
  url: string;
  sizeBytes: number;
}

export interface StorageProvider {
  /**
   * Persists a file buffer under a logical folder (e.g. "products/{id}/images")
   * and returns its storage key + a URL that can be embedded in API responses
   * and, when published, in the public static site's product JSON.
   */
  save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredFile>;

  /** Permanently deletes a previously stored file. Safe to call on a missing key. */
  delete(storageKey: string): Promise<void>;

  /** Resolves a storage key to a URL usable right now (may be signed/temporary for private providers). */
  getUrl(storageKey: string): Promise<string>;

  /** Reads an existing asset so the publish pipeline can mirror it to public static hosting. */
  read(storageKey: string): Promise<Buffer>;

  /** Lightweight connectivity check used by GET /api/health. */
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
