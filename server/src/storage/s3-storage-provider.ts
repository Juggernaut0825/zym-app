import fs from 'fs';
import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, StoreLocalFileInput, StoredMediaObject, StorageUploadTarget } from './storage-provider.js';

interface S3StorageProviderOptions {
  bucket?: string;
  region?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
  uploadExpiresSeconds?: number;
  readExpiresSeconds?: number;
}

function parseBoolean(value: unknown, fallback = false): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

async function streamToBuffer(stream: Readable | ReadableStream | Blob | undefined): Promise<Buffer> {
  if (!stream) return Buffer.alloc(0);
  if (stream instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof (stream as any).arrayBuffer === 'function') {
    const buffer = await (stream as any).arrayBuffer();
    return Buffer.from(buffer);
  }
  return Buffer.alloc(0);
}

export class S3StorageProvider implements StorageProvider {
  readonly kind = 's3' as const;
  readonly bucket: string;
  private readonly client: S3Client;
  private readonly uploadExpiresSeconds: number;
  private readonly readExpiresSeconds: number;

  constructor(options: S3StorageProviderOptions = {}) {
    const region = String(options.region || process.env.MEDIA_STORAGE_REGION || process.env.AWS_REGION || 'auto').trim();
    const bucket = String(options.bucket || process.env.MEDIA_STORAGE_BUCKET || '').trim();
    if (!bucket) {
      throw new Error('MEDIA_STORAGE_BUCKET is required for s3 media storage');
    }

    this.bucket = bucket;
    this.uploadExpiresSeconds = Math.max(
      60,
      Math.min(3600, Number(options.uploadExpiresSeconds ?? process.env.MEDIA_UPLOAD_URL_TTL_SECONDS ?? 900)),
    );
    this.readExpiresSeconds = Math.max(
      60,
      Math.min(3600, Number(options.readExpiresSeconds ?? process.env.MEDIA_READ_URL_TTL_SECONDS ?? 900)),
    );

    const accessKeyId = String(options.accessKeyId || process.env.MEDIA_STORAGE_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(options.secretAccessKey || process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY || '').trim();

    this.client = new S3Client({
      region,
      endpoint: String(options.endpoint || process.env.MEDIA_STORAGE_ENDPOINT || '').trim() || undefined,
      forcePathStyle: options.forcePathStyle ?? parseBoolean(process.env.MEDIA_STORAGE_FORCE_PATH_STYLE, false),
      credentials: accessKeyId
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
    });
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
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
    return streamToBuffer(response.Body as any);
  }

  async writeObject(objectKey: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }));
  }

  async objectExists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }));
      return true;
    } catch {
      return false;
    }
  }

  async createSignedReadUrl(objectKey: string): Promise<string | null> {
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }), { expiresIn: this.readExpiresSeconds });
  }

  async createUploadTarget(input: {
    objectKey: string;
    contentType: string;
    fileName: string;
    sizeBytes?: number | null;
  }): Promise<StorageUploadTarget> {
    const url = await getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    }), { expiresIn: this.uploadExpiresSeconds });

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
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      }));
    } catch {
      // best-effort cleanup for now
    }
  }
}
