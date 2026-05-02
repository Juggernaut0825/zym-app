export type StorageProviderKind = 'local' | 's3' | 'gcs';

export type MediaAssetVisibility = 'private' | 'friends' | 'public' | 'authenticated';

export interface StoredMediaObject {
  provider: StorageProviderKind;
  bucket: string | null;
  objectKey: string;
  fileName: string;
}

export interface StoreLocalFileInput {
  absolutePath: string;
  fileName: string;
  mimeType: string;
}

export interface LocalReadHandle {
  absolutePath: string;
}

export interface StorageUploadTarget {
  method: 'PUT';
  url: string;
  headers?: Record<string, string>;
  expiresAt?: string | null;
}

export interface StorageProvider {
  readonly kind: StorageProviderKind;

  storeLocalFile(input: StoreLocalFileInput): Promise<StoredMediaObject>;
  resolveLocalRead(objectKey: string): Promise<LocalReadHandle | null>;
  readObject(objectKey: string): Promise<Buffer>;
  writeObject(objectKey: string, body: Buffer, contentType: string): Promise<void>;
  objectExists(objectKey: string): Promise<boolean>;
  createSignedReadUrl?(objectKey: string, fileName: string, ttlSeconds?: number): Promise<string | null>;
  createUploadTarget?(input: {
    objectKey: string;
    contentType: string;
    fileName: string;
    sizeBytes?: number | null;
  }): Promise<StorageUploadTarget>;
  deleteObject(objectKey: string): Promise<void>;
}
