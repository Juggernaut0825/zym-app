import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { initDB, getDB } from '../src/database/sqlite-db.js';
import { MediaStore } from '../src/context/media-store.js';
import { MediaAssetRecord, MediaAssetService } from '../src/services/media-asset-service.js';
import { fileNameFromMediaPath, normalizeMediaStorageValue } from '../src/security/media-url.js';

dotenv.config();

const dryRun = !process.argv.includes('--write');
const uploadsDir = path.join(process.cwd(), 'data', 'uploads');

function inferMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const byExt: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return byExt[ext] || 'application/octet-stream';
}

function parseJsonArray(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function fileNameFromValue(raw: unknown): string | null {
  const normalized = normalizeMediaStorageValue(String(raw || '').trim());
  if (!normalized) return null;
  if (normalized.startsWith('/media/file/')) {
    return fileNameFromMediaPath(normalized);
  }
  if (normalized.startsWith('/uploads/')) {
    return path.basename(normalized);
  }
  return null;
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function main() {
  initDB();

  const db = getDB();
  const mediaStore = new MediaStore();
  const mediaAssetService = MediaAssetService.createFromEnvironment({ uploadsDir });

  const summary = {
    dryRun,
    legacyIndexCandidates: 0,
    createdAssets: 0,
    existingAssets: 0,
    missingUploadFiles: 0,
    attachedMessages: 0,
    attachedPosts: 0,
    attachedProfiles: 0,
  };

  async function ensureProviderObject(fileName: string, absolutePath: string, mimeType: string): Promise<void> {
    if (mediaAssetService.provider.kind === 'local') {
      return;
    }

    const exists = await mediaAssetService.provider.objectExists(fileName);
    if (exists) return;
    const body = await fs.readFile(absolutePath);
    await mediaAssetService.provider.writeObject(fileName, body, mimeType);
  }

  async function ensureAssetForFile(args: {
    ownerUserId: number;
    fileName: string;
    mimeType?: string;
    source: string;
    metadata?: Record<string, unknown>;
    expiresAt?: string | null;
  }): Promise<MediaAssetRecord | null> {
    const fileName = path.basename(String(args.fileName || '').trim());
    if (!fileName) return null;

    const existing = mediaAssetService.getByFileName(fileName);
    if (existing) {
      summary.existingAssets += 1;
      return existing;
    }

    const absolutePath = path.join(uploadsDir, fileName);
    if (!(await fileExists(absolutePath))) {
      summary.missingUploadFiles += 1;
      return null;
    }

    summary.legacyIndexCandidates += 1;
    if (dryRun) {
      return null;
    }

    const mimeType = args.mimeType || inferMimeType(fileName);
    await ensureProviderObject(fileName, absolutePath, mimeType);
    const asset = await mediaAssetService.registerStoredObject({
      ownerUserId: args.ownerUserId,
      fileName,
      mimeType,
      originalFilename: fileName,
      source: args.source,
      metadata: args.metadata,
      expiresAt: args.expiresAt || null,
    });
    summary.createdAssets += 1;
    return asset;
  }

  async function ensureAssetForValue(ownerUserId: number, value: string, source: string): Promise<MediaAssetRecord | null> {
    const existing = mediaAssetService.getByStorageValue(value);
    if (existing) {
      return existing;
    }
    const fileName = fileNameFromValue(value);
    if (!fileName) return null;
    return ensureAssetForFile({
      ownerUserId,
      fileName,
      mimeType: inferMimeType(fileName),
      source,
      metadata: {
        backfilledFrom: value,
      },
    });
  }

  const users = db.prepare('SELECT id, avatar_url, background_url FROM users ORDER BY id ASC').all() as Array<{
    id: number;
    avatar_url?: string | null;
    background_url?: string | null;
  }>;

  for (const user of users) {
    const legacyIndex = await mediaStore.loadIndex(String(user.id));
    for (const item of legacyIndex.items) {
      const fileName = path.basename(String(item.originalFilename || '').trim());
      if (!fileName) continue;
      await ensureAssetForFile({
        ownerUserId: user.id,
        fileName,
        mimeType: item.mimeType,
        source: 'legacy_backfill',
        metadata: {
          legacyMediaId: item.id,
          legacyStoredPath: item.storedPath,
          legacyPlatform: item.platform,
        },
        expiresAt: item.expiresAt,
      });
    }
  }

  const messages = db.prepare(`
    SELECT id, from_user_id, topic, media_urls
    FROM messages
    WHERE media_urls IS NOT NULL AND media_urls <> ''
  `).all() as Array<{ id: number; from_user_id: number; topic: string; media_urls: string }>;

  for (const message of messages) {
    const assetIds = new Set<string>();
    for (const value of parseJsonArray(message.media_urls)) {
      const asset = await ensureAssetForValue(message.from_user_id, value, 'message_backfill');
      if (asset?.ownerUserId === message.from_user_id) {
        assetIds.add(asset.id);
      }
    }
    if (!dryRun && assetIds.size > 0) {
      await mediaAssetService.attachAssetsToMessage(Array.from(assetIds), message.from_user_id, message.id, message.topic);
      summary.attachedMessages += assetIds.size;
    }
  }

  const posts = db.prepare(`
    SELECT id, user_id, media_urls
    FROM posts
    WHERE media_urls IS NOT NULL AND media_urls <> ''
  `).all() as Array<{ id: number; user_id: number; media_urls: string }>;

  for (const post of posts) {
    const assetIds = new Set<string>();
    for (const value of parseJsonArray(post.media_urls)) {
      const asset = await ensureAssetForValue(post.user_id, value, 'post_backfill');
      if (asset?.ownerUserId === post.user_id) {
        assetIds.add(asset.id);
      }
    }
    if (!dryRun && assetIds.size > 0) {
      await mediaAssetService.attachAssetsToPost(Array.from(assetIds), post.user_id, post.id);
      summary.attachedPosts += assetIds.size;
    }
  }

  for (const user of users) {
    const avatar = user.avatar_url ? await ensureAssetForValue(user.id, user.avatar_url, 'profile_backfill_avatar') : null;
    if (!dryRun && avatar?.ownerUserId === user.id) {
      await mediaAssetService.attachUserAsset(avatar.id, user.id, 'user_avatar');
      summary.attachedProfiles += 1;
    }

    const background = user.background_url ? await ensureAssetForValue(user.id, user.background_url, 'profile_backfill_background') : null;
    if (!dryRun && background?.ownerUserId === user.id) {
      await mediaAssetService.attachUserAsset(background.id, user.id, 'user_background');
      summary.attachedProfiles += 1;
    }
  }

  console.log(`[media-backfill] mode=${dryRun ? 'dry-run' : 'write'} summary=${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error('[media-backfill] failed:', error?.message || error);
  process.exitCode = 1;
});
