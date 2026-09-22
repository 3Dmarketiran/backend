export interface StoredFile {
  storageKey: string;
  url: string;
  sizeBytes: number;
}

export interface StorageProvider {
  save(params: {
    folder: string;
    filename: string;
    buffer: Buffer;
    contentType: string;

    /**
     * Optional deterministic storage key.
     *
     * Used when multiple files must preserve relative paths,
     * for example a GLTF file with .bin / texture dependencies.
     *
     * The storage provider is responsible for validating and
     * normalizing this key before writing it.
     */
    storageKey?: string;
  }): Promise<StoredFile>;

  delete(storageKey: string): Promise<void>;

  getUrl(storageKey: string): Promise<string>;

  read(storageKey: string): Promise<Buffer>;

  healthCheck(): Promise<{
    ok: boolean;
    message?: string;
  }>;
}
