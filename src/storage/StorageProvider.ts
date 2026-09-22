/**
 * StorageProvider abstraction.
 *
 * The rest of the application never touches the filesystem or an S3 SDK
 * directly. It only communicates through this interface.
 *
 * Development can use local disk storage while production can use an
 * S3-compatible object storage provider without changing application
 * services.
 */

export interface StoredFile {
  /**
   * Internal key/path used to address the file within the provider.
   */
  storageKey: string;

  /**
   * URL that can be returned by the API and used by the public website.
   *
   * Depending on the provider this may be a permanent public URL or a
   * temporary/signed URL.
   */
  url: string;

  /**
   * Stored file size in bytes.
   */
  sizeBytes: number;
}

export interface StorageProvider {
  /**
   * Persist a file buffer under a logical folder.
   *
   * Example:
   * products/{productId}/images
   *
   * The provider is responsible for generating the final storage key.
   */
  save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;
  }): Promise<StoredFile>;

  /**
   * Permanently delete a previously stored file.
   *
   * Implementations should treat deletion of an already-missing object
   * as a safe/idempotent operation whenever the underlying provider
   * supports it.
   */
  delete(storageKey: string): Promise<void>;

  /**
   * Resolve a storage key into a URL that can currently be used to access
   * the asset.
   *
   * Public providers may return a permanent URL.
   * Private providers may return a temporary/signed URL.
   */
  getUrl(storageKey: string): Promise<string>;

  /**
   * Read an existing asset from storage.
   *
   * This is used by publishing workflows that need to mirror an asset
   * to another public/static hosting layer.
   */
  read(storageKey: string): Promise<Buffer>;

  /**
   * Perform a lightweight connectivity/configuration check.
   *
   * This is used by the backend health endpoint and should not perform
   * expensive operations.
   */
  healthCheck(): Promise<{
    ok: boolean;
    message?: string;
  }>;
}
