import crypto from 'crypto';
import path from 'path';

const DEFAULT_MEDIA_URL_TTL_SECONDS = 12 * 60 * 60;
const MAX_MEDIA_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function clampTTL(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MEDIA_URL_TTL_SECONDS;
  const rounded = Math.floor(parsed);
  return Math.min(MAX_MEDIA_URL_TTL_SECONDS, Math.max(60, rounded));
}

function readSigningSecret(): string {
  const configured = String(process.env.MEDIA_URL_SIGNING_SECRET || process.env.JWT_SECRET || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MEDIA_URL_SIGNING_SECRET or JWT_SECRET must be set in production.');
  }
  return 'dev-media-signing-secret';
}

const MEDIA_SIGNING_SECRET = readSigningSecret();
const MEDIA_URL_TTL_SECONDS = clampTTL(process.env.MEDIA_URL_TTL_SECONDS);

function safeBaseName(fileName: string): string | null {
  const decoded = decodeURIComponent(String(fileName || '').trim());
  const base = path.basename(decoded);
  if (!base || base === '.' || base === '..') return null;
  if (!/^[a-zA-Z0-9._-]{1,220}$/.test(base)) return null;
  return base;
}

export function mediaPathFromFileName(fileName: string): string | null {
  const safe = safeBaseName(fileName);
  if (!safe) return null;
  return `/media/file/${encodeURIComponent(safe)}`;
}

export function fileNameFromMediaPath(mediaPath: string): string | null {
  const canonical = canonicalMediaPath(mediaPath);
  if (!canonical) return null;
  const token = canonical.replace('/media/file/', '');
  const safe = safeBaseName(token);
  return safe;
}

export function canonicalMediaPath(mediaPath: string): string | null {
  const raw = String(mediaPath || '').trim();
  if (!raw.startsWith('/media/file/')) return null;
  const token = raw.replace('/media/file/', '').split('?')[0];
  return mediaPathFromFileName(token);
}

export function normalizeMediaStorageValue(raw: string): string | null {
  const input = String(raw || '').trim();
  if (!input) return null;

  if (input.startsWith('/media/file/')) {
    return canonicalMediaPath(input);
  }

  if (input.startsWith('/uploads/')) {
    const fileName = path.basename(input);
    return mediaPathFromFileName(fileName);
  }

  try {
    const parsed = new URL(input);
    if (parsed.pathname.startsWith('/media/file/')) {
      return canonicalMediaPath(parsed.pathname);
    }
    if (parsed.pathname.startsWith('/uploads/')) {
      const fileName = path.basename(parsed.pathname);
      return mediaPathFromFileName(fileName);
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString().slice(0, 2048);
    }
    return null;
  } catch {
    return null;
  }
}

function signPayload(mediaPath: string, expiresAt: number): string {
  return crypto
    .createHmac('sha256', MEDIA_SIGNING_SECRET)
    .update(`${mediaPath}:${expiresAt}`)
    .digest('base64url');
}

export function signMediaPath(mediaPath: string, ttlSeconds = MEDIA_URL_TTL_SECONDS): string {
  const canonical = canonicalMediaPath(mediaPath);
  if (!canonical) return mediaPath;
  const safeTtl = clampTTL(ttlSeconds);
  const expiresAt = Math.floor(Date.now() / 1000) + safeTtl;
  const sig = signPayload(canonical, expiresAt);
  return `${canonical}?exp=${expiresAt}&sig=${encodeURIComponent(sig)}`;
}

export function verifyMediaPathSignature(mediaPath: string, expRaw: unknown, sigRaw: unknown): boolean {
  const canonical = canonicalMediaPath(mediaPath);
  if (!canonical) return false;

  const expiresAt = Number(expRaw);
  const sig = String(sigRaw || '').trim();
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000) || !sig) {
    return false;
  }

  const expected = signPayload(canonical, Math.floor(expiresAt));
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(sig);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function resolveMediaForDelivery(raw: string): string {
  const normalized = normalizeMediaStorageValue(raw);
  if (!normalized) return '';
  if (normalized.startsWith('/media/file/')) {
    return signMediaPath(normalized);
  }
  return normalized;
}

export function resolveMediaArrayForDelivery(items: string[]): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const item of items || []) {
    const resolved = resolveMediaForDelivery(item);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    next.push(resolved);
  }
  return next;
}
