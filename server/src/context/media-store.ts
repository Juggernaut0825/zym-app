import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import heicConvert from 'heic-convert';
import { MediaIndex, MediaKind, MediaRef } from '../types/index.js';
import { resolveSkillRoot, resolveUserDataDir, sanitizeUserId } from '../utils/path-resolver.js';

export interface IncomingMediaAttachment {
  url: string;
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

export class MediaStore {
  readonly skillRoot: string;

  constructor(
    private retentionDays = 7,
    skillRoot?: string,
  ) {
    this.skillRoot = skillRoot || resolveSkillRoot();
  }

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
      'data',
      sanitizeUserId(userId),
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

  private isExpired(media: MediaRef): boolean {
    return media.status !== 'ready' || new Date(media.expiresAt).getTime() <= Date.now();
  }
}
