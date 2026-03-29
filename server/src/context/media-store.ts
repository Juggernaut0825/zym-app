import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import heicConvert from 'heic-convert';
import { MediaIndex, MediaKind, MediaRef } from '../types/index.js';
import { resolveUserDataDir, resolveUserScopedPath } from '../utils/path-resolver.js';
import { resolveAppDataRoot } from '../config/app-paths.js';

export interface IncomingMediaAttachment {
  url: string;
  contentType: string;
  name: string;
  platform: string;
  sourceMessageId?: string;
}

export interface LocalMediaAttachment {
  absolutePath: string;
  contentType: string;
  name: string;
  platform: string;
  sourceMessageId?: string;
}

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

function nowIso(): string {
  return new Date().toISOString();
}

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'upload');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildMediaId(date: Date): string {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `med_${stamp.slice(0, 8)}_${stamp.slice(9, 15)}_${crypto.randomBytes(2).toString('hex')}`;
}

function inferKind(contentType: string): MediaKind {
  return contentType.startsWith('video/') ? 'video' : 'image';
}

function toBuffer(binary: Buffer | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(binary)) {
    return binary;
  }

  return Buffer.from(new Uint8Array(binary));
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function looksLikeUserDataDir(dirPath: string): Promise<boolean> {
  const markers = [
    'profile.json',
    'daily.json',
    path.join('context', 'sessions', 'default.json'),
    path.join('media', 'index.json'),
    'analyses',
  ];

  for (const marker of markers) {
    try {
      await fs.access(path.join(dirPath, marker));
      return true;
    } catch {
      // Keep checking.
    }
  }

  return false;
}

export class MediaStore {
  constructor(private retentionDays = 7) {}

  getUserDataDir(userId: string): string {
    return resolveUserDataDir(userId);
  }

  getMediaIndexFile(userId: string): string {
    return path.join(this.getUserDataDir(userId), 'media', 'index.json');
  }

  async ingestAttachments(userId: string, attachments: IncomingMediaAttachment[]): Promise<MediaRef[]> {
    if (attachments.length === 0) {
      return [];
    }

    const createdAt = nowIso();
    const dateFolder = createdAt.slice(0, 10);
    const userDir = this.getUserDataDir(userId);
    const mediaDir = path.join(userDir, 'media', dateFolder);
    await ensureDir(mediaDir);

    const index = await this.loadIndex(userId);
    const refs: MediaRef[] = [];

    for (const attachment of attachments) {
      const mediaRef = await this.ingestAttachment(userId, attachment, createdAt, mediaDir);
      index.items.push(mediaRef);
      refs.push(mediaRef);
    }

    await this.saveIndex(userId, index);
    return refs;
  }

  async ingestLocalFiles(userId: string, files: LocalMediaAttachment[]): Promise<MediaRef[]> {
    if (files.length === 0) {
      return [];
    }

    const createdAt = nowIso();
    const dateFolder = createdAt.slice(0, 10);
    const userDir = this.getUserDataDir(userId);
    const mediaDir = path.join(userDir, 'media', dateFolder);
    await ensureDir(mediaDir);

    const index = await this.loadIndex(userId);
    const refs: MediaRef[] = [];

    for (const file of files) {
      const mediaRef = await this.ingestLocalFile(userId, file, createdAt, mediaDir);
      index.items.push(mediaRef);
      refs.push(mediaRef);
    }

    await this.saveIndex(userId, index);
    return refs;
  }

  async loadIndex(userId: string): Promise<MediaIndex> {
    const filePath = this.getMediaIndexFile(userId);
    await ensureDir(path.dirname(filePath));

    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as MediaIndex;
      return {
        schemaVersion: 1,
        items: Array.isArray(parsed.items) ? parsed.items : [],
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return { schemaVersion: 1, items: [] };
      }
      throw error;
    }
  }

  async saveIndex(userId: string, index: MediaIndex): Promise<void> {
    const filePath = this.getMediaIndexFile(userId);
    await ensureDir(path.dirname(filePath));
    await writeJsonAtomic(filePath, index);
  }

  async getMediaById(userId: string, mediaId: string): Promise<MediaRef | undefined> {
    const index = await this.loadIndex(userId);
    return index.items.find(item => item.id === mediaId && !this.isExpired(item));
  }

  async getMediaByIds(userId: string, mediaIds: string[]): Promise<MediaRef[]> {
    const index = await this.loadIndex(userId);
    const wanted = new Set(mediaIds);
    return index.items.filter(item => wanted.has(item.id) && !this.isExpired(item));
  }

  async listRecentMedia(userId: string, limit = 5): Promise<MediaRef[]> {
    const index = await this.loadIndex(userId);
    return index.items
      .filter(item => !this.isExpired(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async pruneExpiredMediaIds(userId: string, mediaIds: string[]): Promise<string[]> {
    const active = await this.getMediaByIds(userId, mediaIds);
    return active.map(item => item.id);
  }

  async cleanupExpiredForUser(userId: string): Promise<{ userId: string; removedCount: number }> {
    const index = await this.loadIndex(userId);
    if (index.items.length === 0) {
      return { userId, removedCount: 0 };
    }

    const nowMs = Date.now();
    const kept: MediaRef[] = [];
    const expired: MediaRef[] = [];

    for (const item of index.items) {
      const expiresMs = new Date(item.expiresAt).getTime();
      const isExpired = item.status !== 'ready' || !Number.isFinite(expiresMs) || expiresMs <= nowMs;
      if (isExpired) {
        expired.push(item);
      } else {
        kept.push(item);
      }
    }

    if (expired.length === 0) {
      return { userId, removedCount: 0 };
    }

    await Promise.all(expired.map(async (item) => {
      await this.removeStoredMediaFile(item);
      await this.removeAnalysisArtifacts(userId, item.id);
    }));

    await this.saveIndex(userId, {
      schemaVersion: 1,
      items: kept,
    });

    return { userId, removedCount: expired.length };
  }

  async cleanupExpiredForAllUsers(): Promise<{ userCount: number; removedCount: number }> {
    const rootDataDir = resolveAppDataRoot();
    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fs.readdir(rootDataDir, { withFileTypes: true });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return { userCount: 0, removedCount: 0 };
      }
      throw error;
    }

    let userCount = 0;
    let removedCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const userDir = path.join(rootDataDir, entry.name);
      if (!await looksLikeUserDataDir(userDir)) {
        continue;
      }

      const userId = entry.name;
      userCount += 1;
      const result = await this.cleanupExpiredForUser(userId);
      removedCount += result.removedCount;
    }

    return { userCount, removedCount };
  }

  private async ingestAttachment(
    userId: string,
    attachment: IncomingMediaAttachment,
    createdAt: string,
    mediaDir: string,
  ): Promise<MediaRef> {
    const response = await axios.get<ArrayBuffer>(attachment.url, { responseType: 'arraybuffer' });
    let buffer = toBuffer(response.data as ArrayBuffer);
    let mimeType = attachment.contentType;
    let storedName = sanitizeFilename(attachment.name);

    if (HEIC_TYPES.has(mimeType)) {
      const jpegBuffer = await heicConvert({
        buffer,
        format: 'JPEG',
        quality: 0.9,
      });
      buffer = toBuffer(jpegBuffer);
      mimeType = 'image/jpeg';
      const parsed = path.parse(storedName);
      storedName = `${parsed.name || 'upload'}.jpg`;
    }

    const date = new Date(createdAt);
    const mediaId = buildMediaId(date);
    const finalName = `${mediaId}_${storedName}`;
    const absolutePath = path.join(mediaDir, finalName);
    await fs.writeFile(absolutePath, buffer);

    const relativePath = path.join(
      'media',
      createdAt.slice(0, 10),
      finalName,
    );

    return {
      id: mediaId,
      userId,
      platform: attachment.platform,
      discordMessageId: attachment.sourceMessageId,
      kind: inferKind(mimeType),
      mimeType,
      originalFilename: attachment.name,
      storedPath: relativePath,
      createdAt,
      expiresAt: addDays(createdAt, this.retentionDays),
      sizeBytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      status: 'ready',
      analysisIds: [],
    };
  }

  private async ingestLocalFile(
    userId: string,
    file: LocalMediaAttachment,
    createdAt: string,
    mediaDir: string,
  ): Promise<MediaRef> {
    const absolutePath = path.resolve(String(file.absolutePath || ''));
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      throw new Error(`Invalid media file path: ${absolutePath}`);
    }

    let buffer: Buffer<ArrayBufferLike> = Buffer.from(await fs.readFile(absolutePath));
    let mimeType = String(file.contentType || '').trim().toLowerCase();
    let storedName = sanitizeFilename(file.name);

    if (HEIC_TYPES.has(mimeType) || /\.(heic|heif)$/i.test(storedName)) {
      const nonSharedBuffer = Buffer.from(buffer);
      const jpegBuffer = await heicConvert({
        buffer: nonSharedBuffer,
        format: 'JPEG',
        quality: 0.9,
      });
      buffer = toBuffer(jpegBuffer);
      mimeType = 'image/jpeg';
      const parsed = path.parse(storedName);
      storedName = `${parsed.name || 'upload'}.jpg`;
    }

    const date = new Date(createdAt);
    const mediaId = buildMediaId(date);
    const finalName = `${mediaId}_${storedName}`;
    const finalAbsolutePath = path.join(mediaDir, finalName);
    await fs.writeFile(finalAbsolutePath, buffer);

    const relativePath = path.join(
      'media',
      createdAt.slice(0, 10),
      finalName,
    );

    return {
      id: mediaId,
      userId,
      platform: file.platform,
      discordMessageId: file.sourceMessageId,
      kind: inferKind(mimeType || 'application/octet-stream'),
      mimeType: mimeType || 'application/octet-stream',
      originalFilename: file.name,
      storedPath: relativePath,
      createdAt,
      expiresAt: addDays(createdAt, this.retentionDays),
      sizeBytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      status: 'ready',
      analysisIds: [],
    };
  }

  private isExpired(media: MediaRef): boolean {
    return media.status !== 'ready' || new Date(media.expiresAt).getTime() <= Date.now();
  }

  private async removeStoredMediaFile(media: MediaRef): Promise<void> {
    let absolutePath: string;
    try {
      absolutePath = resolveUserScopedPath(media.userId, media.storedPath);
    } catch {
      return;
    }

    try {
      await fs.unlink(absolutePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[media-cleanup] failed to remove file ${absolutePath}:`, error?.message || error);
      }
    }
  }

  private async removeAnalysisArtifacts(userId: string, mediaId: string): Promise<void> {
    const userDir = this.getUserDataDir(userId);
    const analysesDir = path.join(userDir, 'analyses', mediaId);
    try {
      await fs.rm(analysesDir, { recursive: true, force: true });
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        console.warn(`[media-cleanup] failed to remove analyses for ${mediaId}:`, error?.message || error);
      }
    }
  }
}
