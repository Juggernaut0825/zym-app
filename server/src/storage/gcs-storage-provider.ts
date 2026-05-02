import fs from 'fs';
import { Storage, type StorageOptions } from '@google-cloud/storage';
import { StorageProvider, StoreLocalFileInput, StoredMediaObject, StorageUploadTarget } from './storage-provider.js';

interface GCSStorageProviderOptions {
  bucket?: string;
  projectId?: string;
  keyFilename?: string;
  credentialsJson?: string;
  uploadExpiresSeconds?: number;
  readExpiresSeconds?: number;
}

function safeJsonCredentials(raw: string): StorageOptions['credentials'] | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    return parsed as StorageOptions['credentials'];
  } catch {
    return undefined;
  }
}

function buildStorageOptions(options: GCSStorageProviderOptions): StorageOptions {
  const projectId = String(options.projectId || process.env.MEDIA_STORAGE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '').trim();
  const keyFilename = String(options.keyFilename || process.env.MEDIA_STORAGE_KEY_FILE || '').trim();
  const credentialsJson = String(options.credentialsJson || process.env.MEDIA_STORAGE_CREDENTIALS_JSON || '').trim();
  const clientEmail = String(process.env.MEDIA_STORAGE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.MEDIA_STORAGE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const credentials = safeJsonCredentials(credentialsJson)
    || (clientEmail && privateKey ? { client_email: clientEmail, private_key: privateKey } : undefined);

  return {
    projectId: projectId || undefined,
    keyFilename: keyFilename || undefined,
    credentials,
  };
}

export class GCSStorageProvider implements StorageProvider {
  readonly kind = 'gcs' as const;
  readonly bucket: string;
  private readonly storage: Storage;
  private readonly uploadExpiresSeconds: number;
  private readonly readExpiresSeconds: number;

  constructor(options: GCSStorageProviderOptions = {}) {
    const bucket = String(options.bucket || process.env.MEDIA_STORAGE_BUCKET || '').trim();
    if (!bucket) {
      throw new Error('MEDIA_STORAGE_BUCKET is required for gcs media storage');
    }

    this.bucket = bucket;
    this.storage = new Storage(buildStorageOptions(options));
    this.uploadExpiresSeconds = Math.max(
      60,
      Math.min(3600, Number(options.uploadExpiresSeconds ?? process.env.MEDIA_UPLOAD_URL_TTL_SECONDS ?? 900)),
    );
    this.readExpiresSeconds = Math.max(
      60,
      Math.min(3600, Number(options.readExpiresSeconds ?? process.env.MEDIA_READ_URL_TTL_SECONDS ?? 900)),
    );
  }

  async storeLocalFile(input: StoreLocalFileInput): Promise<StoredMediaObject> {
    const body = await fs.promises.readFile(input.absolutePath);
    await this.writeObject(input.fileName, body, input.mimeType);
    return {
      provider: this.kind,
      bucket: this.bucket,
      objectKey: input.fileName,
      fileName: input.fileName,
    };
  }

  async resolveLocalRead(): Promise<null> {
    return null;
  }

  async readObject(objectKey: string): Promise<Buffer> {
    const [body] = await this.storage.bucket(this.bucket).file(objectKey).download();
    return body;
  }

  async writeObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.storage.bucket(this.bucket).file(objectKey).save(body, {
      metadata: {
        contentType,
      },
      resumable: false,
    });
  }

  async objectExists(objectKey: string): Promise<boolean> {
    const [exists] = await this.storage.bucket(this.bucket).file(objectKey).exists();
    return exists;
  }

  async createSignedReadUrl(objectKey: string, fileName: string): Promise<string | null> {
    const [url] = await this.storage.bucket(this.bucket).file(objectKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + this.readExpiresSeconds * 1000,
      responseDisposition: fileName ? `inline; filename="${fileName.replace(/"/g, '')}"` : undefined,
    });
    return url;
  }

  async createUploadTarget(input: {
    objectKey: string;
    contentType: string;
    fileName: string;
    sizeBytes?: number | null;
  }): Promise<StorageUploadTarget> {
    const [url] = await this.storage.bucket(this.bucket).file(input.objectKey).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + this.uploadExpiresSeconds * 1000,
      contentType: input.contentType,
    });

    return {
      method: 'PUT',
      url,
      headers: {
        'Content-Type': input.contentType,
      },
      expiresAt: new Date(Date.now() + this.uploadExpiresSeconds * 1000).toISOString(),
    };
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.storage.bucket(this.bucket).file(objectKey).delete({ ignoreNotFound: true });
    } catch {
      // best-effort cleanup for now
    }
  }
}
