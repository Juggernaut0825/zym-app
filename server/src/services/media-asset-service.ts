import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDB } from '../database/runtime-db.js';
import {
  fileNameFromMediaPath,
  mediaPathFromFileName,
  normalizeMediaStorageValue,
} from '../security/media-url.js';
import { LocalStorageProvider } from '../storage/local-storage-provider.js';
import { S3StorageProvider } from '../storage/s3-storage-provider.js';
import {
  MediaAssetVisibility,
  StorageProvider,
  StorageProviderKind,
  StorageUploadTarget,
} from '../storage/storage-provider.js';

export type MediaAssetKind = 'image' | 'video' | 'file';
export type MediaAssetStatus = 'pending' | 'ready' | 'deleted';
export type MediaAssetLinkType = 'message' | 'post' | 'user_avatar' | 'user_background';

export interface MediaAssetRecord {
  id: string;
  ownerUserId: number;
  storageProvider: StorageProviderKind;
  storageBucket: string | null;
  objectKey: string;
  fileName: string;
  mimeType: string;
  originalFilename: string;
  kind: MediaAssetKind;
  visibility: MediaAssetVisibility;
  sizeBytes: number;
  sha256: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  status: MediaAssetStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface RegisterUploadInput {
  ownerUserId: number;
  absolutePath: string;
  fileName: string;
  mimeType: string;
  originalFilename: string;
  kind?: MediaAssetKind;
  visibility?: MediaAssetVisibility;
  source?: string;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
}

export interface CreateUploadIntentInput {
  ownerUserId: number;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
  kind?: MediaAssetKind;
  visibility?: MediaAssetVisibility;
  source?: string;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
}

export interface RegisterStoredObjectInput {
  ownerUserId: number;
  fileName: string;
  mimeType: string;
  originalFilename: string;
  kind?: MediaAssetKind;
  visibility?: MediaAssetVisibility;
  source?: string;
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
}

export interface MediaUploadIntent {
  asset: MediaAssetRecord;
  upload: StorageUploadTarget;
}

interface MediaAssetLinkRow {
  media_asset_id: string;
  owner_user_id: number;
  entity_type: MediaAssetLinkType;
  entity_id: number | null;
  entity_key: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildAssetId(date: Date): string {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `asset_${stamp.slice(0, 8)}_${stamp.slice(9, 15)}_${crypto.randomBytes(3).toString('hex')}`;
}

function inferKind(mimeType: string): MediaAssetKind {
  if (String(mimeType || '').toLowerCase().startsWith('image/')) return 'image';
  if (String(mimeType || '').toLowerCase().startsWith('video/')) return 'video';
  return 'file';
}

function safeString(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength);
}

function safeSerializeMetadata(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 16_000 ? serialized.slice(0, 16_000) : serialized;
  } catch {
    return null;
  }
}

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeVisibility(value: unknown): MediaAssetVisibility {
  if (value === 'public' || value === 'friends' || value === 'authenticated') {
    return value;
  }
  return 'private';
}

function normalizeStatus(value: unknown): MediaAssetStatus {
  if (value === 'pending' || value === 'deleted') {
    return value;
  }
  return 'ready';
}

function normalizeKind(value: unknown, mimeType: string): MediaAssetKind {
  if (value === 'image' || value === 'video' || value === 'file') {
    return value;
  }
  return inferKind(mimeType);
}

function normalizeProvider(value: unknown): StorageProviderKind {
  return value === 's3' ? 's3' : 'local';
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function inferExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(String(fileName || '').trim()).toLowerCase();
  if (fromName) return fromName;

  const normalized = String(mimeType || '').trim().toLowerCase();
  const byMime: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/webm': '.webm',
  };
  return byMime[normalized] || '.bin';
}

function buildStoredFileName(assetId: string, originalFileName: string, mimeType: string): string {
  const base = path.basename(String(originalFileName || 'upload').trim()) || 'upload';
  const parsed = path.parse(base);
  const sanitizedBase = safeString(parsed.name.replace(/[^a-zA-Z0-9._-]/g, '_'), 80) || 'upload';
  const extension = inferExtension(base, mimeType);
  return `${assetId}_${sanitizedBase}${extension}`;
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function toRecord(row: any): MediaAssetRecord {
  return {
    id: String(row.id || ''),
    ownerUserId: Number(row.owner_user_id || 0),
    storageProvider: normalizeProvider(row.storage_provider),
    storageBucket: row.storage_bucket ? String(row.storage_bucket) : null,
    objectKey: String(row.object_key || ''),
    fileName: String(row.file_name || ''),
    mimeType: String(row.mime_type || 'application/octet-stream'),
    originalFilename: String(row.original_filename || row.file_name || ''),
    kind: normalizeKind(row.kind, String(row.mime_type || '')),
    visibility: normalizeVisibility(row.visibility),
    sizeBytes: Number(row.size_bytes || 0),
    sha256: row.sha256 ? String(row.sha256) : null,
    source: String(row.source || 'upload'),
    metadata: parseMetadata(row.metadata),
    status: normalizeStatus(row.status),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || row.created_at || ''),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
  };
}

function toLinkRow(row: any): MediaAssetLinkRow {
  return {
    media_asset_id: String(row.media_asset_id || ''),
    owner_user_id: Number(row.owner_user_id || 0),
    entity_type: row.entity_type as MediaAssetLinkType,
    entity_id: row.entity_id === null || row.entity_id === undefined ? null : Number(row.entity_id),
    entity_key: row.entity_key ? String(row.entity_key) : null,
  };
}

function parseCoachTopic(topic: string): { userId: number } | null {
  if (!topic.startsWith('coach_')) return null;
  const userId = Number(topic.replace('coach_', ''));
  if (!Number.isInteger(userId)) return null;
  return { userId };
}

function parseP2PTopic(topic: string): { userA: number; userB: number } | null {
  if (!topic.startsWith('p2p_')) return null;
  const parts = topic.split('_');
  if (parts.length !== 3) return null;
  const userA = Number(parts[1]);
  const userB = Number(parts[2]);
  if (!Number.isInteger(userA) || !Number.isInteger(userB)) return null;
  return { userA, userB };
}

function parseGroupTopic(topic: string): { groupId: number } | null {
  if (!topic.startsWith('grp_')) return null;
  const groupId = Number(topic.replace('grp_', ''));
  if (!Number.isInteger(groupId)) return null;
  return { groupId };
}

export class MediaAssetService {
  private readonly uploadsDir: string | null;
  private readonly providerCache = new Map<string, StorageProvider>();
  private readonly publicStorageProvider: StorageProvider | null;

  constructor(
    private readonly storageProvider: StorageProvider,
    options?: { uploadsDir?: string | null },
  ) {
    this.uploadsDir = options?.uploadsDir ? path.resolve(options.uploadsDir) : null;
    this.providerCache.set(this.providerKey(storageProvider.kind, 'bucket' in storageProvider ? (storageProvider as any).bucket || null : null), storageProvider);
    this.publicStorageProvider = this.buildPublicProviderFromEnvironment();
    if (this.publicStorageProvider) {
      this.providerCache.set(
        this.providerKey(this.publicStorageProvider.kind, 'bucket' in this.publicStorageProvider ? (this.publicStorageProvider as any).bucket || null : null),
        this.publicStorageProvider,
      );
    }
  }

  private static buildProvider(kind: StorageProviderKind, uploadsDir?: string | null): StorageProvider {
    if (kind === 's3') {
      return new S3StorageProvider();
    }
    if (!uploadsDir) {
      throw new Error('uploadsDir is required for local media storage');
    }
    return new LocalStorageProvider(uploadsDir);
  }

  static createFromEnvironment(options: { uploadsDir: string }): MediaAssetService {
    const providerName = safeString(process.env.MEDIA_STORAGE_PROVIDER, 32).toLowerCase() || 'local';
    const provider = MediaAssetService.buildProvider(providerName === 's3' ? 's3' : 'local', options.uploadsDir);
    return new MediaAssetService(provider, options);
  }

  get provider(): StorageProvider {
    return this.storageProvider;
  }

  private providerKey(kind: StorageProviderKind, bucket: string | null): string {
    return `${kind}:${bucket || 'default'}`;
  }

  private buildPublicProviderFromEnvironment(): StorageProvider | null {
    if (this.storageProvider.kind !== 's3') {
      return null;
    }
    const publicBucket = safeString(process.env.MEDIA_PUBLIC_BUCKET, 255);
    if (!publicBucket) {
      return null;
    }
    const currentBucket = 'bucket' in this.storageProvider ? safeString((this.storageProvider as any).bucket, 255) : '';
    if (currentBucket && currentBucket === publicBucket) {
      return this.storageProvider;
    }
    return new S3StorageProvider({ bucket: publicBucket });
  }

  private selectProviderForVisibility(visibility: MediaAssetVisibility): StorageProvider {
    if (visibility === 'public' && this.publicStorageProvider) {
      return this.publicStorageProvider;
    }
    return this.storageProvider;
  }

  private getProviderForKey(kind: StorageProviderKind, bucket: string | null): StorageProvider {
    const cacheKey = this.providerKey(kind, bucket);
    const cached = this.providerCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const provider = kind === 's3'
      ? new S3StorageProvider({ bucket: safeString(bucket, 255) || undefined })
      : MediaAssetService.buildProvider(kind, this.uploadsDir);
    this.providerCache.set(cacheKey, provider);
    return provider;
  }

  private getProviderForAsset(asset: MediaAssetRecord): StorageProvider {
    return this.getProviderForKey(asset.storageProvider, asset.storageBucket);
  }

  async registerUpload(input: RegisterUploadInput): Promise<MediaAssetRecord> {
    const ownerUserId = Number(input.ownerUserId);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      throw new Error('Invalid media asset owner');
    }

    const absolutePath = path.resolve(String(input.absolutePath || '').trim());
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error('Uploaded media file not found');
    }

    const createdAt = nowIso();
    const id = buildAssetId(new Date(createdAt));
    const mimeType = safeString(input.mimeType, 120) || 'application/octet-stream';
    const originalFilename = safeString(path.basename(input.originalFilename || path.basename(absolutePath)), 255);
    const fileName = buildStoredFileName(id, input.fileName || originalFilename, mimeType);

    const buffer = await fs.promises.readFile(absolutePath);
    const metadata = safeSerializeMetadata(input.metadata);
    const kind = input.kind || inferKind(mimeType);
    const visibility = normalizeVisibility(input.visibility);
    const source = safeString(input.source, 40) || 'upload';
    const expiresAt = input.expiresAt ? safeString(input.expiresAt, 64) : null;
    const provider = this.selectProviderForVisibility(visibility);

    const stored = await provider.storeLocalFile({
      absolutePath,
      fileName,
      mimeType,
    });

    getDB().prepare(`
      INSERT INTO media_assets (
        id,
        owner_user_id,
        storage_provider,
        storage_bucket,
        object_key,
        file_name,
        mime_type,
        original_filename,
        kind,
        visibility,
        size_bytes,
        sha256,
        source,
        metadata,
        status,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
    `).run(
      id,
      ownerUserId,
      stored.provider,
      stored.bucket,
      stored.objectKey,
      stored.fileName,
      mimeType,
      originalFilename || stored.fileName,
      kind,
      visibility,
      stat.size,
      hashBuffer(buffer),
      source,
      metadata,
      createdAt,
      createdAt,
      expiresAt,
    );

    return this.getById(id) as MediaAssetRecord;
  }

  async registerStoredObject(input: RegisterStoredObjectInput): Promise<MediaAssetRecord> {
    const ownerUserId = Number(input.ownerUserId);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      throw new Error('Invalid media asset owner');
    }

    const fileName = safeString(path.basename(input.fileName || ''), 255);
    if (!fileName) {
      throw new Error('fileName is required');
    }

    const existing = this.getByFileName(fileName);
    if (existing) {
      return existing;
    }

    const mimeType = safeString(input.mimeType, 120) || 'application/octet-stream';
    const originalFilename = safeString(path.basename(input.originalFilename || fileName), 255) || fileName;
    const visibility = normalizeVisibility(input.visibility);
    const provider = this.selectProviderForVisibility(visibility);
    const exists = await provider.objectExists(fileName);
    if (!exists) {
      throw new Error('Stored media object not found');
    }

    const body = await provider.readObject(fileName);
    const createdAt = nowIso();
    const id = buildAssetId(new Date(createdAt));
    const metadata = safeSerializeMetadata(input.metadata);
    const kind = input.kind || inferKind(mimeType);
    const source = safeString(input.source, 40) || 'upload';
    const expiresAt = input.expiresAt ? safeString(input.expiresAt, 64) : null;

    getDB().prepare(`
      INSERT INTO media_assets (
        id,
        owner_user_id,
        storage_provider,
        storage_bucket,
        object_key,
        file_name,
        mime_type,
        original_filename,
        kind,
        visibility,
        size_bytes,
        sha256,
        source,
        metadata,
        status,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
    `).run(
      id,
      ownerUserId,
      provider.kind,
      provider.kind === 's3' && 'bucket' in provider ? (provider as any).bucket || null : null,
      fileName,
      fileName,
      mimeType,
      originalFilename,
      kind,
      visibility,
      body.length,
      hashBuffer(body),
      source,
      metadata,
      createdAt,
      createdAt,
      expiresAt,
    );

    return this.getById(id) as MediaAssetRecord;
  }

  createPendingUpload(input: CreateUploadIntentInput): MediaAssetRecord {
    const ownerUserId = Number(input.ownerUserId);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      throw new Error('Invalid media asset owner');
    }

    const createdAt = nowIso();
    const id = buildAssetId(new Date(createdAt));
    const mimeType = safeString(input.mimeType, 120) || 'application/octet-stream';
    const originalFilename = safeString(path.basename(input.fileName || 'upload'), 255) || 'upload';
    const fileName = buildStoredFileName(id, originalFilename, mimeType);
    const metadata = safeSerializeMetadata(input.metadata);
    const kind = input.kind || inferKind(mimeType);
    const visibility = normalizeVisibility(input.visibility);
    const source = safeString(input.source, 40) || 'upload';
    const expiresAt = input.expiresAt ? safeString(input.expiresAt, 64) : null;
    const provider = this.selectProviderForVisibility(visibility);

    getDB().prepare(`
      INSERT INTO media_assets (
        id,
        owner_user_id,
        storage_provider,
        storage_bucket,
        object_key,
        file_name,
        mime_type,
        original_filename,
        kind,
        visibility,
        size_bytes,
        sha256,
        source,
        metadata,
        status,
        created_at,
        updated_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      ownerUserId,
      provider.kind,
      provider.kind === 's3' && 'bucket' in provider
        ? (provider as any).bucket || null
        : null,
      fileName,
      fileName,
      mimeType,
      originalFilename,
      kind,
      visibility,
      source,
      metadata,
      createdAt,
      createdAt,
      expiresAt,
    );

    return this.getById(id) as MediaAssetRecord;
  }

  async createUploadIntent(
    input: CreateUploadIntentInput,
    buildLocalUploadTarget: (asset: MediaAssetRecord) => StorageUploadTarget,
  ): Promise<MediaUploadIntent> {
    const asset = this.createPendingUpload(input);
    const provider = this.getProviderForAsset(asset);
    if (provider.createUploadTarget) {
      const upload = await provider.createUploadTarget({
        objectKey: asset.objectKey,
        contentType: asset.mimeType,
        fileName: asset.fileName,
        sizeBytes: input.sizeBytes,
      });
      return { asset, upload };
    }
    return { asset, upload: buildLocalUploadTarget(asset) };
  }

  async finalizeUpload(assetId: string): Promise<MediaAssetRecord> {
    const asset = this.getById(assetId);
    if (!asset) {
      throw new Error('Media asset not found');
    }
    if (asset.status === 'deleted') {
      throw new Error('Media asset deleted');
    }

    const provider = this.getProviderForAsset(asset);
    const exists = await provider.objectExists(asset.objectKey);
    if (!exists) {
      throw new Error('Uploaded media object not found');
    }

    const body = await provider.readObject(asset.objectKey);
    const sizeBytes = body.length;
    const sha256 = hashBuffer(body);
    const now = nowIso();

    getDB().prepare(`
      UPDATE media_assets
      SET status = 'ready',
          size_bytes = ?,
          sha256 = ?,
          updated_at = ?
      WHERE id = ?
    `).run(sizeBytes, sha256, now, asset.id);

    return this.getById(asset.id) as MediaAssetRecord;
  }

  getById(id: string): MediaAssetRecord | null {
    const row = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE id = ?
        LIMIT 1
      `)
      .get(String(id || '').trim()) as any;
    return row ? toRecord(row) : null;
  }

  getByFileName(fileName: string): MediaAssetRecord | null {
    const safeFileName = safeString(path.basename(fileName || ''), 255);
    if (!safeFileName) return null;
    const row = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE file_name = ?
        LIMIT 1
      `)
      .get(safeFileName) as any;
    return row ? toRecord(row) : null;
  }

  getByObjectKey(objectKey: string): MediaAssetRecord | null {
    const safeKey = String(objectKey || '').trim().slice(0, 512);
    if (!safeKey) return null;
    const row = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE object_key = ?
        LIMIT 1
      `)
      .get(safeKey) as any;
    return row ? toRecord(row) : null;
  }

  getByStorageValue(value: string): MediaAssetRecord | null {
    const normalized = normalizeMediaStorageValue(value);
    if (!normalized) return null;
    if (!normalized.startsWith('/media/file/')) {
      try {
        const parsed = new URL(normalized);
        const objectKey = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        const byObjectKey = objectKey ? this.getByObjectKey(objectKey) : null;
        if (byObjectKey) {
          return byObjectKey;
        }
      } catch {
        // Ignore URL parsing fallback below.
      }
    }
    const fileName = normalized.startsWith('/media/file/') ? fileNameFromMediaPath(normalized) : path.basename(normalized);
    if (!fileName) return null;
    return this.getByFileName(fileName);
  }

  async getObjectBody(asset: MediaAssetRecord): Promise<Buffer> {
    return this.getProviderForAsset(asset).readObject(asset.objectKey);
  }

  async writeObjectForAsset(assetOrId: MediaAssetRecord | string, body: Buffer, contentType?: string): Promise<void> {
    const asset = typeof assetOrId === 'string' ? this.getById(assetOrId) : assetOrId;
    if (!asset) {
      throw new Error('Media asset not found');
    }
    await this.getProviderForAsset(asset).writeObject(asset.objectKey, body, contentType || asset.mimeType);
  }

  async resolveDelivery(asset: MediaAssetRecord): Promise<{ absolutePath?: string; redirectUrl?: string } | null> {
    const provider = this.getProviderForAsset(asset);
    const local = await provider.resolveLocalRead(asset.objectKey);
    if (local) {
      return { absolutePath: local.absolutePath };
    }

    if (provider.createSignedReadUrl) {
      const redirectUrl = await provider.createSignedReadUrl(asset.objectKey, asset.fileName);
      if (redirectUrl) {
        return { redirectUrl };
      }
    }
    return null;
  }

  private areUsersFriends(userA: number, userB: number): boolean {
    if (!Number.isInteger(userA) || !Number.isInteger(userB) || userA <= 0 || userB <= 0) {
      return false;
    }
    if (userA === userB) return true;
    const relation = getDB()
      .prepare(`
        SELECT 1
        FROM friendships
        WHERE status = 'accepted'
          AND (
            (user_id = ? AND friend_id = ?)
            OR (user_id = ? AND friend_id = ?)
          )
        LIMIT 1
      `)
      .get(userA, userB, userB, userA);
    return Boolean(relation);
  }

  setAssetVisibility(assetId: string, visibility: MediaAssetVisibility): void {
    const asset = this.getById(assetId);
    if (!asset) return;
    const normalizedVisibility = normalizeVisibility(visibility);
    getDB()
      .prepare('UPDATE media_assets SET visibility = ?, updated_at = ? WHERE id = ?')
      .run(normalizedVisibility, nowIso(), asset.id);
  }

  async attachAssetsToMessage(assetIds: string[], ownerUserId: number, messageId: number, topic: string): Promise<void> {
    const deduped = Array.from(new Set(assetIds.map((item) => safeString(item, 80)).filter(Boolean)));
    if (deduped.length === 0) return;
    const insert = getDB().prepare(`
      INSERT OR IGNORE INTO media_asset_attachments (media_asset_id, owner_user_id, entity_type, entity_id, entity_key)
      VALUES (?, ?, 'message', ?, ?)
    `);
    for (const assetId of deduped) {
      const asset = this.getById(assetId);
      if (!asset || asset.ownerUserId !== ownerUserId) continue;
      if (asset.visibility !== 'private') {
        this.setAssetVisibility(asset.id, 'private');
      }
      insert.run(asset.id, ownerUserId, messageId, safeString(topic, 100));
    }
  }

  async attachAssetsToPost(
    assetIds: string[],
    ownerUserId: number,
    postId: number,
    visibility: MediaAssetVisibility = 'friends',
  ): Promise<void> {
    const deduped = Array.from(new Set(assetIds.map((item) => safeString(item, 80)).filter(Boolean)));
    if (deduped.length === 0) return;
    const insert = getDB().prepare(`
      INSERT OR IGNORE INTO media_asset_attachments (media_asset_id, owner_user_id, entity_type, entity_id, entity_key)
      VALUES (?, ?, 'post', ?, NULL)
    `);
    for (const assetId of deduped) {
      const asset = this.getById(assetId);
      if (!asset || asset.ownerUserId !== ownerUserId) continue;
      if (asset.visibility !== visibility) {
        this.setAssetVisibility(asset.id, visibility);
      }
      insert.run(asset.id, ownerUserId, postId);
    }
  }

  async attachUserAsset(
    assetId: string | null,
    ownerUserId: number,
    type: 'user_avatar' | 'user_background',
    visibility: MediaAssetVisibility = type === 'user_avatar' ? 'public' : 'friends',
  ): Promise<void> {
    getDB()
      .prepare('DELETE FROM media_asset_attachments WHERE owner_user_id = ? AND entity_type = ? AND entity_id = ?')
      .run(ownerUserId, type, ownerUserId);

    if (!assetId) return;

    const asset = this.getById(assetId);
    if (!asset || asset.ownerUserId !== ownerUserId) return;
    if (asset.visibility !== visibility) {
      this.setAssetVisibility(asset.id, visibility);
    }

    getDB().prepare(`
      INSERT OR IGNORE INTO media_asset_attachments (media_asset_id, owner_user_id, entity_type, entity_id, entity_key)
      VALUES (?, ?, ?, ?, NULL)
    `).run(asset.id, ownerUserId, type, ownerUserId);
  }

  getOwnedReadyAssets(userId: number, assetIds: string[]): MediaAssetRecord[] {
    const deduped = Array.from(new Set(assetIds.map((item) => safeString(item, 80)).filter(Boolean)));
    return deduped
      .map((assetId) => this.getById(assetId))
      .filter((asset): asset is MediaAssetRecord => Boolean(asset && asset.ownerUserId === userId && asset.status === 'ready'));
  }

  async canAccessAsset(asset: MediaAssetRecord, actorUserId: number | null, hasValidSignature: boolean): Promise<boolean> {
    if (asset.status !== 'ready') {
      return false;
    }
    if (hasValidSignature) {
      return true;
    }
    if (asset.visibility === 'public') {
      return true;
    }
    if (actorUserId && actorUserId > 0 && actorUserId === asset.ownerUserId) {
      return true;
    }

    const links = getDB()
      .prepare(`
        SELECT media_asset_id, owner_user_id, entity_type, entity_id, entity_key
        FROM media_asset_attachments
        WHERE media_asset_id = ?
      `)
      .all(asset.id)
      .map(toLinkRow);

    for (const link of links) {
      if (link.entity_type === 'message' && link.entity_key) {
        if (!actorUserId || actorUserId <= 0) continue;
        const coach = parseCoachTopic(link.entity_key);
        if (coach && coach.userId === actorUserId) return true;

        const p2p = parseP2PTopic(link.entity_key);
        if (p2p && (p2p.userA === actorUserId || p2p.userB === actorUserId)) {
          return true;
        }

        const group = parseGroupTopic(link.entity_key);
        if (group) {
          const member = getDB()
            .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
            .get(group.groupId, actorUserId);
          if (member) return true;
        }
      }

      if (link.entity_type === 'post' && link.entity_id) {
        const postOwner = getDB()
          .prepare('SELECT user_id, visibility FROM posts WHERE id = ?')
          .get(link.entity_id) as { user_id?: number; visibility?: string } | undefined;
        if (!postOwner?.user_id) continue;
        const postVisibility = normalizeVisibility(postOwner.visibility);
        if (postVisibility === 'public') return true;
        if (!actorUserId || actorUserId <= 0) continue;
        if (Number(postOwner.user_id) === actorUserId) return true;
        if ((postVisibility === 'friends' || postVisibility === 'authenticated') && this.areUsersFriends(actorUserId, Number(postOwner.user_id))) {
          return true;
        }
      }

      if (link.entity_type === 'user_avatar' && link.entity_id) {
        if (!actorUserId || actorUserId <= 0) continue;
        if (actorUserId === link.entity_id) return true;
        if ((asset.visibility === 'friends' || asset.visibility === 'authenticated') && this.areUsersFriends(actorUserId, link.entity_id)) {
          return true;
        }
      }

      if (link.entity_type === 'user_background' && link.entity_id) {
        if (!actorUserId || actorUserId <= 0) continue;
        if (actorUserId === link.entity_id) return true;
        if ((asset.visibility === 'friends' || asset.visibility === 'authenticated') && this.areUsersFriends(actorUserId, link.entity_id)) {
          return true;
        }
      }
    }

    if (!actorUserId || actorUserId <= 0) {
      return false;
    }

    if (asset.visibility === 'authenticated') {
      return true;
    }

    if (asset.visibility === 'friends') {
      return this.areUsersFriends(actorUserId, asset.ownerUserId);
    }

    return false;
  }

  async markDeleted(id: string): Promise<void> {
    const safeId = safeString(id, 80);
    if (!safeId) return;
    const deletedAt = nowIso();
    getDB()
      .prepare(`
        UPDATE media_assets
        SET status = 'deleted', updated_at = ?, expires_at = COALESCE(expires_at, ?)
        WHERE id = ?
      `)
      .run(deletedAt, deletedAt, safeId);
  }

  listRecentForUser(userId: number, limit = 20): MediaAssetRecord[] {
    const safeUserId = Number(userId);
    const safeLimit = Math.min(200, Math.max(1, Math.floor(Number(limit) || 20)));
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) return [];

    const rows = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE owner_user_id = ?
          AND status = 'ready'
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      `)
      .all(safeUserId, safeLimit) as any[];

    return rows.map(toRecord);
  }

  async deleteAllForUser(userId: number): Promise<number> {
    const safeUserId = Number(userId);
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) return 0;

    const rows = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE owner_user_id = ?
      `)
      .all(safeUserId) as any[];

    let removedCount = 0;
    for (const row of rows) {
      await this.purgeAsset(toRecord(row));
      removedCount += 1;
    }

    return removedCount;
  }

  private shouldPurgeAsset(asset: MediaAssetRecord, nowMs: number, pendingMaxAgeMs: number): boolean {
    if (asset.status === 'deleted') {
      return true;
    }

    const expiresAtMs = toMs(asset.expiresAt);
    if (asset.status === 'pending') {
      const createdAtMs = toMs(asset.createdAt);
      return createdAtMs !== null ? createdAtMs <= (nowMs - pendingMaxAgeMs) : true;
    }

    return expiresAtMs !== null && expiresAtMs <= nowMs;
  }

  private async purgeAsset(asset: MediaAssetRecord): Promise<void> {
    const provider = this.getProviderForAsset(asset);
    await provider.deleteObject(asset.objectKey);
    const db = getDB();
    db.prepare('DELETE FROM media_asset_attachments WHERE media_asset_id = ?').run(asset.id);
    db.prepare('DELETE FROM media_assets WHERE id = ?').run(asset.id);
  }

  private isLegacyMediaReferenced(fileName: string): boolean {
    const mediaPath = mediaPathFromFileName(fileName);
    const uploadPath = `/uploads/${fileName}`;
    const queries = [
      getDB().prepare('SELECT 1 FROM users WHERE avatar_url = ? OR avatar_url = ? OR background_url = ? OR background_url = ? LIMIT 1'),
      getDB().prepare('SELECT 1 FROM messages WHERE media_urls LIKE ? OR media_urls LIKE ? LIMIT 1'),
      getDB().prepare('SELECT 1 FROM posts WHERE media_urls LIKE ? OR media_urls LIKE ? LIMIT 1'),
    ];

    const userMatch = queries[0].get(mediaPath, uploadPath, mediaPath, uploadPath);
    if (userMatch) return true;
    const messageMatch = queries[1].get(`%${fileName}%`, `%${uploadPath}%`);
    if (messageMatch) return true;
    const postMatch = queries[2].get(`%${fileName}%`, `%${uploadPath}%`);
    return Boolean(postMatch);
  }

  private async cleanupOrphanedLocalFiles(orphanGraceMs: number, nowMs: number): Promise<{ scannedCount: number; removedCount: number }> {
    if (!this.uploadsDir) {
      return { scannedCount: 0, removedCount: 0 };
    }

    let fileNames: string[] = [];
    try {
      fileNames = await fs.promises.readdir(this.uploadsDir);
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { scannedCount: 0, removedCount: 0 };
      }
      throw error;
    }

    let scannedCount = 0;
    let removedCount = 0;
    const hasAsset = getDB().prepare('SELECT 1 FROM media_assets WHERE file_name = ? LIMIT 1');

    for (const entry of fileNames) {
      const fileName = path.basename(String(entry || '').trim());
      if (!fileName) continue;
      const absolutePath = path.join(this.uploadsDir, fileName);
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(absolutePath);
      } catch (error: any) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      if (!stat.isFile()) continue;

      scannedCount += 1;
      if (hasAsset.get(fileName)) continue;
      if (stat.mtimeMs > (nowMs - orphanGraceMs)) continue;
      if (this.isLegacyMediaReferenced(fileName)) continue;

      try {
        await fs.promises.unlink(absolutePath);
        removedCount += 1;
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return { scannedCount, removedCount };
  }

  async cleanupExpiredAssets(): Promise<{
    removedCount: number;
    purgedPendingCount: number;
    purgedDeletedCount: number;
    purgedExpiredCount: number;
    orphanedUploadCount: number;
    scannedUploadCount: number;
  }> {
    const nowMs = Date.now();
    const pendingTtlMinutes = Math.max(15, Number(process.env.MEDIA_PENDING_UPLOAD_TTL_MINUTES || 180));
    const orphanTtlHours = Math.max(6, Number(process.env.MEDIA_ORPHAN_FILE_TTL_HOURS || 168));
    const pendingMaxAgeMs = pendingTtlMinutes * 60_000;
    const orphanGraceMs = orphanTtlHours * 60 * 60_000;

    const rows = getDB()
      .prepare(`
        SELECT id, owner_user_id, storage_provider, storage_bucket, object_key, file_name, mime_type,
               original_filename, kind, visibility, size_bytes, sha256, source, metadata, status,
               created_at, updated_at, expires_at
        FROM media_assets
        WHERE status IN ('pending', 'deleted')
           OR expires_at IS NOT NULL
      `)
      .all() as any[];

    let removedCount = 0;
    let purgedPendingCount = 0;
    let purgedDeletedCount = 0;
    let purgedExpiredCount = 0;

    for (const row of rows) {
      const asset = toRecord(row);
      if (!this.shouldPurgeAsset(asset, nowMs, pendingMaxAgeMs)) {
        continue;
      }
      await this.purgeAsset(asset);
      removedCount += 1;
      if (asset.status === 'pending') {
        purgedPendingCount += 1;
      } else if (asset.status === 'deleted') {
        purgedDeletedCount += 1;
      } else {
        purgedExpiredCount += 1;
      }
    }

    const orphaned = await this.cleanupOrphanedLocalFiles(orphanGraceMs, nowMs);
    return {
      removedCount,
      purgedPendingCount,
      purgedDeletedCount,
      purgedExpiredCount,
      orphanedUploadCount: orphaned.removedCount,
      scannedUploadCount: orphaned.scannedCount,
    };
  }
}
