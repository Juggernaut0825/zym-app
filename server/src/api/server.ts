import express, { Request } from 'express';
import cors from 'cors';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { AuthService, EmailVerificationRequiredError } from '../services/auth-service.js';
import { authEmailService } from '../services/auth-email-service.js';
import { CommunityService } from '../services/community-service.js';
import { MediaService } from '../services/media-service.js';
import { MessageService, buildP2PTopic } from '../services/message-service.js';
import { FriendService } from '../services/friend-service.js';
import { GroupService } from '../services/group-service.js';
import { getDB } from '../database/runtime-db.js';
import { FitnessSkills } from '../services/fitness-skills.js';
import { CoachService } from '../services/coach-service.js';
import { ModerationService } from '../services/moderation-service.js';
import { MediaAssetService } from '../services/media-asset-service.js';
import { SecurityEventService } from '../services/security-event-service.js';
import { knowledgeIngestionService } from '../services/knowledge-ingestion-service.js';
import { coachTypedToolsService } from '../services/coach-typed-tools-service.js';
import { AdminAuthService } from '../services/admin-auth-service.js';
import { AdminService } from '../services/admin-service.js';
import { APIGateway } from '../security/api-gateway.js';
import {
  fileNameFromMediaPath,
  mediaPathFromFileName,
  normalizeMediaStorageValue,
  resolveMediaForDelivery,
  verifyMediaPathSignature,
} from '../security/media-url.js';
import { requireAuth, requireSameUserIdFromBody, requireSameUserIdFromParam } from '../security/auth-middleware.js';
import { requireAdminAuth } from '../security/admin-auth-middleware.js';
import { extractMentionHandles } from '../utils/coach-mention.js';
import { WSServer } from '../websocket/ws-server.js';
import { MediaStore } from '../context/media-store.js';
import { resolveUserDataDir } from '../utils/path-resolver.js';
import type { MediaAssetVisibility } from '../storage/storage-provider.js';
import { logger } from '../utils/logger.js';
import { buildCoachReplyJob } from '../jobs/coach-reply-routing.js';
import { enqueueCoachReply } from '../jobs/coach-reply-worker.js';
import { publishRealtimeEvent } from '../realtime/realtime-event-bus.js';
import { ensureAppDataDirs, resolveUploadsDir } from '../config/app-paths.js';
import { getRuntimeHealthReport } from '../health/runtime-health.js';

ensureAppDataDirs();
const uploadsDir = resolveUploadsDir();

const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);
const ALLOWED_MEDIA_URL_PROTOCOLS = new Set(['http:', 'https:']);
const PROFILE_UPLOAD_SOURCES = new Set([
  'web_profile_avatar',
  'web_profile_background',
]);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const fileName = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}${ext}`;
    cb(null, fileName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_, file, cb) => {
    const mime = (file.mimetype || '').toLowerCase();
    if (ALLOWED_UPLOAD_MIME.has(mime)) {
      cb(null, true);
      return;
    }

    const fallbackByExt = /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm)$/i.test(file.originalname || '');
    cb(null, fallbackByExt);
  },
});

const mediaStore = new MediaStore();
const mediaAssetService = MediaAssetService.createFromEnvironment({ uploadsDir });
const MODERATION_TARGET_TYPES = ['user', 'post', 'message', 'group'] as const;
const app = express();
const isProduction = process.env.NODE_ENV === 'production';

function normalizeOrigin(raw: unknown): string {
  return String(raw || '').trim().replace(/\/+$/, '');
}

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://app.zym8.com',
  'https://zym8.com',
  'https://www.zym8.com',
];

const configuredAllowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const allowedOrigins = new Set(
  [...defaultAllowedOrigins, ...configuredAllowedOrigins]
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean),
);

if (isProduction && configuredAllowedOrigins.length === 0) {
  logger.warn('[api] CORS_ALLOWED_ORIGINS is empty in production; using built-in allowlist for zym8 web origins');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser clients (native apps, curl).
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    callback(null, allowedOrigins.has(normalizedOrigin) || (!isProduction && allowedOrigins.size === 0));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  maxAge: 86400,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  const isSecureProxy = String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  if (isProduction && (req.secure || isSecureProxy)) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

app.use(express.json({ limit: '6mb' }));
app.use(APIGateway.rateLimit(300, 60_000, 'global'));

function toUserId(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Invalid user id');
  }
  return parsed;
}

function toOptionalInt(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isValidTimeZone(value: string): boolean {
  const timezone = String(value || '').trim();
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function persistUserTimezone(userId: number, timezoneRaw: unknown): Promise<void> {
  const timezone = String(timezoneRaw || '').trim().slice(0, 80);
  if (!timezone || !isValidTimeZone(timezone)) return;

  const db = getDB();
  const current = db.prepare('SELECT timezone FROM users WHERE id = ?').get(userId) as { timezone?: string | null } | undefined;
  const currentTimezone = String(current?.timezone || '').trim();
  if (currentTimezone !== timezone) {
    db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(timezone, userId);
  }
  try {
    await coachTypedToolsService.setProfile(String(userId), { timezone });
  } catch (error: any) {
    console.warn(`[timezone-sync] failed to sync coach profile for user ${userId}: ${String(error?.message || error)}`);
  }
}

function parseStringArrayJson(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item)).filter(Boolean);
  } catch {
    return [];
  }
}

interface CoachMealEntry {
  id?: string;
  time?: string;
  timezone?: string;
  occurred_at_utc?: string | null;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  description?: string;
  items?: unknown[];
  [key: string]: unknown;
}

interface CoachTrainingEntry {
  id?: string;
  time?: string;
  timezone?: string;
  occurred_at_utc?: string | null;
  name?: string;
  sets?: number;
  reps?: string;
  weight_kg?: number;
  volume_kg?: number;
  notes?: string;
  [key: string]: unknown;
}

interface CoachDailyBucket {
  meals: CoachMealEntry[];
  training: CoachTrainingEntry[];
  total_intake: number;
  total_burned: number;
  [key: string]: unknown;
}

type CoachDailyRecords = Record<string, CoachDailyBucket>;

const COACH_RECORD_TEXT_MAX = 500;
const COACH_PROFILE_TEXT_MAX = 80;
const COACH_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const COACH_TIME_PATTERN = /^\d{2}:\d{2}$/;
const COACH_RECORD_ID_PATTERN = /^[a-zA-Z0-9._-]{6,120}$/;
const FRIEND_CONNECT_CODE_TTL_SECONDS = 120;
const FRIEND_CONNECT_CODE_BUFFER_SECONDS = 15;
const INGESTION_BLOCK_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /tool\s*call/i,
  /\bexecute\b.*\bcommand\b/i,
  /bash\s+scripts\//i,
  /```/,
];

function sanitizePlainText(value: unknown, maxLength: number): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function containsIngestionPayload(text: string): boolean {
  if (!text) return false;
  return INGESTION_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function assertNoIngestionPayload(req: Request, userId: number, field: string, value: unknown): void {
  const text = sanitizePlainText(value, 1000);
  if (!text) return;
  if (!containsIngestionPayload(text)) return;
  trackSecurityEvent(req, 'coach_record_ingestion_blocked', {
    userId,
    severity: 'warn',
    metadata: {
      field,
      valuePreview: text.slice(0, 160),
    },
  });
  throw new Error(`Suspicious content detected in ${field}`);
}

function isValidDayKey(value: string): boolean {
  if (!COACH_DAY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTimeText(value: string): boolean {
  if (!COACH_TIME_PATTERN.test(value)) return false;
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function parseOccurredAtUtc(value: unknown): string | null {
  const text = sanitizePlainText(value, 80);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('occurredAtUtc must be a valid ISO-8601 datetime');
  }
  return parsed.toISOString();
}

function roundTo2(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function parseRepsForVolume(repsRaw: unknown): number {
  const text = sanitizePlainText(repsRaw, 20);
  const match = text.match(/\d{1,3}/);
  if (!match) return 0;
  const parsed = Number(match[0]);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return Math.min(parsed, 200);
}

function createCoachRecordId(prefix: 'meal' | 'train', day: string): string {
  const stamp = day.replace(/-/g, '');
  const rand = Math.random().toString(16).slice(2, 8);
  return `${prefix}_${stamp}_${rand}`;
}

function getCoachProfilePath(userId: number): string {
  return path.join(resolveUserDataDir(String(userId)), 'profile.json');
}

function getCoachDailyPath(userId: number): string {
  return path.join(resolveUserDataDir(String(userId)), 'daily.json');
}

function normalizeSelectedCoach(value: unknown): 'zj' | 'lc' | null {
  return value === 'lc' || value === 'zj' ? value : null;
}

function inferSelectedCoachFromHistory(userId: number): 'zj' | 'lc' | null {
  const db = getDB();
  const legacyTopic = `coach_${userId}`;
  const zjTopic = `coach_zj_${userId}`;
  const lcTopic = `coach_lc_${userId}`;

  const latestMessage = db.prepare(`
    SELECT topic
    FROM messages
    WHERE topic IN (?, ?, ?)
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(legacyTopic, zjTopic, lcTopic) as { topic?: string | null } | undefined;

  const latestTopic = String(latestMessage?.topic || '').trim();
  if (latestTopic === lcTopic) return 'lc';
  if (latestTopic === zjTopic || latestTopic === legacyTopic) return 'zj';

  const latestOutreach = db.prepare(`
    SELECT coach_id
    FROM coach_outreach_events
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).get(userId) as { coach_id?: string | null } | undefined;

  return normalizeSelectedCoach(latestOutreach?.coach_id);
}

function resolveSelectedCoachForUser(userId: number): 'zj' | 'lc' | null {
  const db = getDB();
  const user = db
    .prepare('SELECT selected_coach FROM users WHERE id = ?')
    .get(userId) as { selected_coach?: string | null } | undefined;
  const persisted = normalizeSelectedCoach(user?.selected_coach);
  if (persisted) {
    return persisted;
  }

  const inferred = inferSelectedCoachFromHistory(userId);
  if (inferred) {
    db.prepare('UPDATE users SET selected_coach = ? WHERE id = ?').run(inferred, userId);
  }
  return inferred;
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath: string, payload: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const serialized = JSON.stringify(payload, null, 2);
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  await fsPromises.writeFile(tempPath, serialized, 'utf8');
  try {
    await fsPromises.rename(tempPath, filePath);
  } catch (error: any) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'EACCES') {
      throw error;
    }
    logger.warn(`[api] atomic rename failed for ${filePath}; falling back to direct write (${String(error?.code || 'unknown')})`);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, serialized, 'utf8');
    await fsPromises.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

function normalizeCoachDailyRecords(raw: unknown): CoachDailyRecords {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const out: CoachDailyRecords = {};
  for (const [day, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidDayKey(day)) continue;
    const bucket = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const meals = Array.isArray(bucket.meals) ? bucket.meals as CoachMealEntry[] : [];
    const training = Array.isArray(bucket.training) ? bucket.training as CoachTrainingEntry[] : [];
    out[day] = {
      ...bucket,
      meals,
      training,
      total_intake: roundTo2(bucket.total_intake),
      total_burned: roundTo2(bucket.total_burned),
    };
  }

  return out;
}

function ensureCoachEntryIds(daily: CoachDailyRecords): boolean {
  let changed = false;
  for (const [day, bucket] of Object.entries(daily)) {
    for (const meal of bucket.meals) {
      const existing = sanitizePlainText(meal.id, 120);
      if (!COACH_RECORD_ID_PATTERN.test(existing)) {
        meal.id = createCoachRecordId('meal', day);
        changed = true;
      } else {
        meal.id = existing;
      }
    }
    for (const entry of bucket.training) {
      const existing = sanitizePlainText(entry.id, 120);
      if (!COACH_RECORD_ID_PATTERN.test(existing)) {
        entry.id = createCoachRecordId('train', day);
        changed = true;
      } else {
        entry.id = existing;
      }
    }
  }
  return changed;
}

function recomputeCoachDailyTotals(bucket: CoachDailyBucket): void {
  const meals = Array.isArray(bucket.meals) ? bucket.meals : [];
  const training = Array.isArray(bucket.training) ? bucket.training : [];

  bucket.total_intake = roundTo2(
    meals.reduce((sum, meal) => sum + roundTo2(meal.calories), 0),
  );

  let totalVolume = 0;
  for (const entry of training) {
    const sets = Math.max(0, Math.min(60, Number(entry.sets || 0)));
    const reps = parseRepsForVolume(entry.reps);
    const weightKg = Math.max(0, Math.min(500, Number(entry.weight_kg || 0)));
    const volume = roundTo2(sets * reps * weightKg);
    entry.volume_kg = volume;
    totalVolume += volume;
  }

  bucket.total_burned = Math.round(totalVolume / 10);
}

async function loadCoachDailyRecords(userId: number): Promise<{
  daily: CoachDailyRecords;
  changed: boolean;
}> {
  const dailyPath = getCoachDailyPath(userId);
  const raw = await readJsonFile<Record<string, unknown>>(dailyPath, {});
  const daily = normalizeCoachDailyRecords(raw);
  const changed = ensureCoachEntryIds(daily);
  return { daily, changed };
}

function buildPublicOrigin(req: Request): string {
  const configuredOrigin = String(process.env.PUBLIC_BASE_URL || '').trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin.replace(/\/$/, '');
    } catch {
      // Fallback to request-derived origin below.
    }
  }

  const rawHost = String(req.get('host') || '').trim().toLowerCase();
  const isValidHost = /^[a-z0-9.-]+(?::\d{1,5})?$/.test(rawHost)
    || /^\[[0-9a-f:]+\](?::\d{1,5})?$/i.test(rawHost);
  if (!isValidHost) {
    throw new Error('Invalid host header');
  }

  const secureProxy = String(req.headers['x-forwarded-proto'] || '').toLowerCase().includes('https');
  const protocol = req.secure || secureProxy ? 'https' : req.protocol || 'http';
  return `${protocol}://${rawHost}`;
}

function tryBuildPublicOrigin(req: Request): string | null {
  try {
    return buildPublicOrigin(req);
  } catch {
    const fallback = String(process.env.PUBLIC_BASE_URL || '').trim();
    if (fallback) {
      try {
        return new URL(fallback).origin.replace(/\/$/, '');
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function publishRealtimeEventSafely(event: Parameters<typeof publishRealtimeEvent>[0], label: string): Promise<void> {
  try {
    await publishRealtimeEvent(event);
  } catch (error) {
    logger.error(`[api] realtime publish failed (${label})`, error);
  }
}

function cleanupExpiredFriendConnectCodes(): void {
  getDB()
    .prepare("DELETE FROM friend_connect_codes WHERE datetime(expires_at) <= datetime('now')")
    .run();
}

function generateUniqueConnectCode(): string {
  const db = getDB();
  const activeStmt = db.prepare(`
    SELECT id
    FROM friend_connect_codes
    WHERE connect_code = ?
      AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `);
  const legacyStmt = db.prepare('SELECT id FROM users WHERE connect_code = ?');
  for (let attempts = 0; attempts < 60; attempts += 1) {
    const code = String(Math.floor(10_000_000 + Math.random() * 90_000_000));
    const activeExists = activeStmt.get(code);
    const legacyExists = legacyStmt.get(code);
    if (!activeExists && !legacyExists) return code;
  }
  throw new Error('Failed to generate unique connect code');
}

function issueUserConnectCode(userId: number): { connectId: string; expiresAt: string } {
  const db = getDB();
  cleanupExpiredFriendConnectCodes();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as { id?: number } | undefined;
  if (!user) {
    throw new Error('User not found');
  }

  const active = db.prepare(`
    SELECT connect_code, expires_at
    FROM friend_connect_codes
    WHERE user_id = ?
      AND datetime(expires_at) > datetime('now')
    ORDER BY datetime(expires_at) DESC
    LIMIT 1
  `).get(userId) as { connect_code?: string | null; expires_at?: string | null } | undefined;

  const activeCode = String(active?.connect_code || '').trim();
  const activeExpiresAt = String(active?.expires_at || '').trim();
  if (activeCode && activeExpiresAt) {
    const expiresAtMs = new Date(activeExpiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs > (Date.now() + FRIEND_CONNECT_CODE_BUFFER_SECONDS * 1000)) {
      return {
        connectId: activeCode,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    }
  }

  const connectCode = generateUniqueConnectCode();
  const expiresAt = new Date(Date.now() + FRIEND_CONNECT_CODE_TTL_SECONDS * 1000).toISOString();
  db.prepare('DELETE FROM friend_connect_codes WHERE user_id = ?').run(userId);
  db.prepare(`
    INSERT INTO friend_connect_codes (user_id, connect_code, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, connectCode, expiresAt);
  return {
    connectId: connectCode,
    expiresAt,
  };
}

function findUserIdByConnectId(code: string): number | undefined {
  cleanupExpiredFriendConnectCodes();

  const dynamicRow = getDB().prepare(`
    SELECT user_id
    FROM friend_connect_codes
    WHERE connect_code = ?
      AND datetime(expires_at) > datetime('now')
    ORDER BY datetime(expires_at) DESC
    LIMIT 1
  `).get(code) as { user_id?: number } | undefined;
  const dynamicUserId = Number(dynamicRow?.user_id || 0);
  if (Number.isInteger(dynamicUserId) && dynamicUserId > 0) {
    return dynamicUserId;
  }

  const row = getDB().prepare('SELECT id FROM users WHERE connect_code = ?').get(code) as { id?: number } | undefined;
  const userId = Number(row?.id || 0);
  if (!Number.isInteger(userId) || userId <= 0) return undefined;
  return userId;
}

function extractUserIdFromConnectCode(raw: unknown): number | undefined {
  const value = String(raw || '').trim();
  if (!value) return undefined;

  if (/^\d{6,8}$/.test(value)) {
    return findUserIdByConnectId(value);
  }

  if (/^\d+$/.test(value)) {
    return toOptionalInt(value);
  }

  try {
    const url = new URL(value);
    const token = url.searchParams.get('token');
    const tokenUserId = token ? AuthService.verifyFriendConnectToken(token) : null;
    if (token && !tokenUserId) {
      throw new Error('Connect code expired or invalid. Please refresh QR.');
    }

    const connectId = String(url.searchParams.get('connectId') || '').trim();
    const fromConnectId = /^\d{6,8}$/.test(connectId) ? findUserIdByConnectId(connectId) : undefined;
    const fromUid = toOptionalInt(url.searchParams.get('uid'));
    const fromUserId = toOptionalInt(url.searchParams.get('userId'));
    const resolvedUserId = fromConnectId || fromUid || fromUserId;

    if (tokenUserId && resolvedUserId && tokenUserId !== resolvedUserId) {
      throw new Error('Connect code payload mismatch. Please refresh QR.');
    }

    return tokenUserId || resolvedUserId;
  } catch (error) {
    if (error instanceof Error && /connect code|payload mismatch/i.test(error.message)) {
      throw error;
    }
    // Fallback to regex parsing for custom strings.
  }

  const tokenMatch = value.match(/token\s*[:=]\s*([A-Za-z0-9_\-.]+)/i);
  if (tokenMatch?.[1]) {
    const tokenUserId = AuthService.verifyFriendConnectToken(tokenMatch[1]);
    if (!tokenUserId) {
      throw new Error('Connect code expired or invalid. Please refresh QR.');
    }
    return tokenUserId;
  }

  const connectIdMatch = value.match(/connectId\s*[:=]\s*(\d{6,8})/i);
  if (connectIdMatch?.[1]) {
    return findUserIdByConnectId(connectIdMatch[1]);
  }

  const direct = value.match(/(?:uid|userId)\s*[:=]\s*(\d+)/i);
  if (direct?.[1]) {
    return toOptionalInt(direct[1]);
  }

  const scheme = value.match(/add-friend[:/](\d+)/i);
  if (scheme?.[1]) {
    return toOptionalInt(scheme[1]);
  }

  return undefined;
}

function parseGroupId(topic: string): number | null {
  if (!topic.startsWith('grp_')) return null;
  const groupId = Number(topic.replace('grp_', ''));
  return Number.isInteger(groupId) ? groupId : null;
}

function isoDateDaysAgo(daysAgo: number): string {
  const normalizedDaysAgo = Number.isFinite(daysAgo) ? Math.max(0, Math.floor(daysAgo)) : 0;
  const current = new Date();
  current.setUTCHours(0, 0, 0, 0);
  current.setUTCDate(current.getUTCDate() - normalizedDaysAgo);
  return current.toISOString().slice(0, 10);
}

function healthScore(steps: number, calories: number, activeMinutes: number): number {
  return Math.max(0, Math.floor(steps)) + Math.max(0, Math.floor(calories)) + Math.max(0, Math.floor(activeMinutes)) * 12;
}

function resolveUploadedFilePathFromInput(raw: unknown): string {
  const input = String(raw || '').trim();
  if (!input) {
    throw new Error('imagePath is required');
  }

  let fileName: string | null = null;
  const normalized = normalizeMediaStorageValue(input);
  if (normalized && normalized.startsWith('/media/file/')) {
    fileName = fileNameFromMediaPath(normalized);
  }

  if (!fileName && input.startsWith('/uploads/')) {
    fileName = path.basename(input.split('?')[0] || '');
  }

  if (!fileName && (input.startsWith('http://') || input.startsWith('https://'))) {
    try {
      const parsed = new URL(input);
      if (parsed.pathname.startsWith('/uploads/')) {
        fileName = path.basename(parsed.pathname);
      } else {
        const maybePath = normalizeMediaStorageValue(parsed.toString());
        if (maybePath?.startsWith('/media/file/')) {
          fileName = fileNameFromMediaPath(maybePath);
        } else {
          throw new Error('Image URL must reference uploaded media');
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Invalid image URL');
    }
  }

  if (!fileName) {
    fileName = path.basename(input.split('?')[0] || '');
  }

  if (!fileName || fileName === '.' || fileName === '..') {
    throw new Error('Invalid image path');
  }

  const absoluteUploadRoot = path.resolve(uploadsDir);
  const resolved = path.resolve(path.join(absoluteUploadRoot, fileName));
  if (!resolved.startsWith(`${absoluteUploadRoot}${path.sep}`)) {
    throw new Error('Invalid image path');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('Uploaded file not found');
  }

  return resolved;
}

async function resolveMediaPathForAnalysis(raw: unknown, actorUserId: number): Promise<{
  absolutePath: string;
  cleanup: () => Promise<void>;
}> {
  const normalized = normalizeMediaStorageValue(String(raw || '').trim());
  const asset = normalized ? mediaAssetService.getByStorageValue(normalized) : null;
  if (!asset) {
    return {
      absolutePath: resolveUploadedFilePathFromInput(raw),
      cleanup: async () => {},
    };
  }

  const allowed = await mediaAssetService.canAccessAsset(asset, actorUserId, false);
  if (!allowed) {
    throw new Error('Forbidden media asset');
  }

  const delivery = await mediaAssetService.resolveDelivery(asset);
  if (delivery?.absolutePath) {
    return {
      absolutePath: delivery.absolutePath,
      cleanup: async () => {},
    };
  }

  const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'zym-media-analysis-'));
  const extension = path.extname(asset.fileName) || '.bin';
  const absolutePath = path.join(tempDir, `${asset.id}${extension}`);
  const body = await mediaAssetService.getObjectBody(asset);
  await fsPromises.writeFile(absolutePath, body);
  return {
    absolutePath,
    cleanup: async () => {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    },
  };
}

function buildMediaDelivery(req: Request, fileName: string): { path: string; url: string } {
  const mediaPath = mediaPathFromFileName(fileName);
  if (!mediaPath) {
    throw new Error('Invalid file name');
  }
  const signedPath = resolveMediaForDelivery(mediaPath);
  const origin = tryBuildPublicOrigin(req);
  const url = signedPath.startsWith('/') && origin ? `${origin}${signedPath}` : signedPath;
  return { path: signedPath, url };
}

function normalizePublicMediaBaseUrl(): string | null {
  const configured = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim();
  if (!configured) return null;
  try {
    const parsed = new URL(configured);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function encodeObjectKeyForPublicUrl(objectKey: string): string {
  return String(objectKey || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildPublicMediaDelivery(asset: { objectKey: string; visibility: MediaAssetVisibility; storageProvider?: string | null }): { path: string; url: string } | null {
  const baseUrl = normalizePublicMediaBaseUrl();
  if (!baseUrl) return null;
  if (asset.visibility !== 'public') return null;
  if (asset.storageProvider && asset.storageProvider !== 's3') return null;
  const encodedKey = encodeObjectKeyForPublicUrl(asset.objectKey);
  if (!encodedKey) return null;
  const absoluteUrl = `${baseUrl}/${encodedKey}`;
  return {
    path: absoluteUrl,
    url: absoluteUrl,
  };
}

function buildAssetDelivery(req: Request, asset: { fileName: string; objectKey: string; visibility: MediaAssetVisibility; storageProvider?: string | null }): { path: string; url: string } {
  return buildMediaDelivery(req, asset.fileName);
}

function inferUploadMimeType(fileName: string, fallback: string): string {
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

  return byExt[ext] || fallback || 'application/octet-stream';
}

function requestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (Array.isArray(forwarded)) {
    return String(forwarded[0] || '').split(',')[0].trim().slice(0, 80);
  }
  return String(forwarded || req.ip || '').split(',')[0].trim().slice(0, 80);
}

function requestUserAgent(req: Request): string {
  return String(req.headers['user-agent'] || '').trim().slice(0, 300);
}

function trackSecurityEvent(
  req: Request,
  eventType: string,
  options: {
    userId?: number | null;
    sessionId?: string | null;
    severity?: 'info' | 'warn' | 'high';
    metadata?: Record<string, unknown>;
  } = {},
) {
  try {
    SecurityEventService.create({
      userId: options.userId ?? req.authUserId ?? null,
      sessionId: options.sessionId ?? req.authSessionId ?? null,
      eventType,
      severity: options.severity || 'info',
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req),
      metadata: {
        path: req.originalUrl,
        method: req.method,
        ...(options.metadata || {}),
      },
    });
  } catch {
    // Keep request flow resilient if audit insertion fails.
  }
}

function sanitizeMediaUrls(input: unknown, maxItems = 5): string[] {
  if (!Array.isArray(input)) return [];

  const cleaned: string[] = [];
  for (const candidate of input) {
    if (cleaned.length >= maxItems) break;
    const value = String(candidate || '').trim().slice(0, 2048);
    if (!value) continue;
    const normalized = normalizeMediaStorageValue(value);
    if (!normalized) continue;
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      try {
        const parsed = new URL(normalized);
        if (!ALLOWED_MEDIA_URL_PROTOCOLS.has(parsed.protocol)) continue;
      } catch {
        continue;
      }
    }
    cleaned.push(normalized);
  }

  return Array.from(new Set(cleaned));
}

function normalizeMediaVisibility(raw: unknown, fallback: MediaAssetVisibility = 'private'): MediaAssetVisibility {
  if (raw === 'public' || raw === 'friends' || raw === 'authenticated') {
    return raw;
  }
  return fallback;
}

function normalizePostVisibility(raw: unknown, fallback: 'private' | 'friends' | 'public' = 'friends'): 'private' | 'friends' | 'public' {
  if (raw === 'public' || raw === 'private') {
    return raw;
  }
  if (raw === 'friends' || raw === 'authenticated') {
    return 'friends';
  }
  return fallback;
}

function mediaUrlForClient(req: Request, mediaUrl: unknown): string | null {
  const value = String(mediaUrl || '').trim();
  if (!value) return null;

  const asset = mediaAssetService.getByStorageValue(value);
  if (asset) {
    return buildMediaDelivery(req, asset.fileName).url;
  }

  const delivered = resolveMediaForDelivery(value);
  if (!delivered) return null;

  if (!delivered.startsWith('/')) {
    return delivered;
  }

  const origin = tryBuildPublicOrigin(req);
  return origin ? `${origin}${delivered}` : delivered;
}

function mediaUrlsForClient(req: Request, mediaUrls: string[]): string[] {
  const delivered: string[] = [];
  const seen = new Set<string>();
  for (const item of mediaUrls || []) {
    const resolved = mediaUrlForClient(req, item);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    delivered.push(resolved);
  }
  return delivered;
}

function mediaPathsForAssetIds(assetIds: string[]): string[] {
  const paths: string[] = [];
  for (const assetId of assetIds) {
    const asset = mediaAssetService.getById(assetId);
    const mediaPath = asset ? mediaPathFromFileName(asset.fileName) : null;
    if (mediaPath) {
      paths.push(mediaPath);
    }
  }
  return Array.from(new Set(paths));
}

function resolveOwnedAssetIds(userId: number, mediaIds: string[], mediaUrls: string[]): string[] {
  const collected = new Set<string>();
  for (const asset of mediaAssetService.getOwnedReadyAssets(userId, mediaIds)) {
    collected.add(asset.id);
  }
  for (const mediaUrl of mediaUrls) {
    const asset = mediaAssetService.getByStorageValue(mediaUrl);
    if (asset && asset.ownerUserId === userId && asset.status === 'ready') {
      collected.add(asset.id);
    }
  }
  return Array.from(collected);
}

function sanitizeMediaIds(input: unknown, maxItems = 5): string[] {
  if (!Array.isArray(input)) return [];

  const cleaned: string[] = [];
  for (const candidate of input) {
    if (cleaned.length >= maxItems) break;
    const value = String(candidate || '').trim().slice(0, 128);
    if (!value) continue;
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(value)) continue;
    cleaned.push(value);
  }

  return Array.from(new Set(cleaned));
}

function assertAuthUser(req: Request): number {
  const authUserId = req.authUserId;
  if (!authUserId) {
    throw new Error('Unauthenticated request');
  }
  return authUserId;
}

function assertKnowledgeAdmin(req: Request): number {
  const userId = assertAuthUser(req);
  if (!knowledgeIngestionService.isAdmin(userId)) {
    throw new Error('Knowledge admin privilege required');
  }
  return userId;
}

function isFriend(userA: number, userB: number): boolean {
  if (userA === userB) return true;

  const row = getDB().prepare(`
    SELECT 1 FROM friendships
    WHERE status = 'accepted' AND (
      (user_id = ? AND friend_id = ?) OR
      (user_id = ? AND friend_id = ?)
    )
    LIMIT 1
  `).get(userA, userB, userB, userA);

  return Boolean(row);
}

function isGroupMember(groupId: number, userId: number): boolean {
  const row = getDB().prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  return Boolean(row);
}

function isGroupOwner(groupId: number, userId: number): boolean {
  const row = getDB().prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = ?').get(groupId, userId, 'owner');
  return Boolean(row);
}

app.get('/health', (_req, res) => {
  void getRuntimeHealthReport()
    .then((report) => {
      const statusCode = report.ok ? 200 : 503;
      res.status(statusCode).json(report);
    })
    .catch((error) => {
      res.status(503).json({
        ok: false,
        service: 'zym-server',
        time: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
    });
});

app.get('/', (_, res) => {
  res.json({
    service: 'zym-server',
    ok: true,
    requiresAuth: true,
    publicEndpoints: [
      '/health',
      '/auth/register',
      '/auth/login',
      '/auth/google',
      '/auth/refresh',
      '/auth/verify-email/request',
      '/auth/verify-email/confirm',
      '/auth/forgot-password',
      '/auth/reset-password',
      '/admin/auth/status',
      '/admin/auth/login',
    ],
    note: 'Use Authorization: Bearer <token> for protected endpoints.',
  });
});

app.get('/admin/auth/status', (_req, res) => {
  res.json(AdminAuthService.getPublicConfig());
});

app.post('/admin/auth/login',
  APIGateway.rateLimit(12, 10 * 60_000, 'admin-auth-login'),
  APIGateway.validateSchema({
    username: { required: true, type: 'string', minLength: 1, maxLength: 80 },
    password: { required: true, type: 'string', minLength: 1, maxLength: 200 },
  }),
  (req, res) => {
    if (!AdminAuthService.isConfigured()) {
      return res.status(503).json({ error: 'Admin dashboard is not configured on the server.' });
    }

    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();
    const result = AdminAuthService.login(username, password);
    if (!result) {
      trackSecurityEvent(req, 'admin_login_failed', {
        severity: 'warn',
        metadata: {
          providedUsername: username.slice(0, 80),
        },
      });
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    trackSecurityEvent(req, 'admin_login_success', {
      metadata: {
        adminUsername: result.username,
      },
    });
    res.json(result);
  },
);

app.get('/admin/overview', requireAdminAuth, async (req, res) => {
  try {
    const overview = await AdminService.getOverview();
    res.json({
      adminUsername: req.adminUsername || 'admin',
      ...overview,
    });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to load admin overview.' });
  }
});

app.get('/admin/users', requireAdminAuth, (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const limit = Number(req.query.limit || 500);
    const users = AdminService.listUsers(search, limit);
    res.json({ users });
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to load admin users.' });
  }
});

app.post('/auth/register',
  APIGateway.rateLimit(18, 10 * 60_000, 'auth-register'),
  APIGateway.validateSchema({
    username: { required: true, type: 'string', minLength: 3, maxLength: 32, pattern: /^[a-zA-Z0-9_]+$/ },
    email: { required: true, type: 'string', minLength: 3, maxLength: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    password: { required: true, type: 'string', minLength: 8, maxLength: 200 },
    healthDisclaimerAccepted: { required: true, type: 'boolean' },
    consentVersion: { required: true, type: 'string', minLength: 4, maxLength: 40 },
  }),
  async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    const healthDisclaimerAccepted = Boolean(req.body.healthDisclaimerAccepted);
    const consentVersion = String(req.body.consentVersion || '').trim();

    if (!username || !email || password.length < 8 || !healthDisclaimerAccepted || !consentVersion) {
      return res.status(400).json({ error: 'Username, email, password, and health disclaimer acceptance are required' });
    }

    const userId = await AuthService.register(username, email, password, {
      healthDisclaimerAccepted,
      consentVersion,
      ipAddress: String(req.ip || req.socket.remoteAddress || '').trim() || null,
      userAgent: String(req.headers['user-agent'] || '').trim() || null,
    });
    const registeredUser = AuthService.findUserByEmail(email);
    if (!registeredUser) {
      throw new Error('Registered account could not be loaded.');
    }

    try {
      await authEmailService.sendVerificationEmail(registeredUser);
    } catch (mailError) {
      getDB().prepare('DELETE FROM users WHERE id = ?').run(userId);
      throw mailError;
    }

    trackSecurityEvent(req, 'auth_register_success', {
      userId: Number(userId),
      metadata: {
        username: username.slice(0, 64),
        email: registeredUser.email.slice(0, 120),
      },
    });

    res.json({ userId, verificationRequired: true });
  } catch (err: any) {
    const message = String(err.message || '');
    if (message.includes('users_username_key') || message.includes('UNIQUE constraint failed: users.username')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    if (message.includes('users_email_key') || message.includes('UNIQUE constraint failed: users.email')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/verify-email/request',
  APIGateway.rateLimit(12, 10 * 60_000, 'auth-verify-email-request'),
  APIGateway.validateSchema({
    email: { required: true, type: 'string', minLength: 3, maxLength: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  }),
  async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = AuthService.findUserByEmail(email);
    if (user && !user.emailVerifiedAt) {
      await authEmailService.sendVerificationEmail(user);
      trackSecurityEvent(req, 'auth_verification_email_sent', {
        userId: user.id,
        metadata: {
          email: user.email.slice(0, 120),
        },
      });
    }

    res.json({ ok: true, message: 'If the account exists, a verification email has been sent.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to send verification email.' });
  }
});

app.post('/auth/verify-email/confirm',
  APIGateway.rateLimit(30, 10 * 60_000, 'auth-verify-email-confirm'),
  APIGateway.validateSchema({
    token: { required: true, type: 'string', minLength: 12, maxLength: 512 },
  }),
  async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const verified = AuthService.verifyEmailWithToken(token);
    if (!verified) {
      return res.status(400).json({ error: 'This verification link is invalid or expired.' });
    }

    trackSecurityEvent(req, 'auth_email_verified', {
      userId: verified.userId,
      metadata: {
        email: verified.email.slice(0, 120),
      },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to verify email.' });
  }
});

app.post('/auth/forgot-password',
  APIGateway.rateLimit(12, 10 * 60_000, 'auth-forgot-password'),
  APIGateway.validateSchema({
    email: { required: true, type: 'string', minLength: 3, maxLength: 120, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  }),
  async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const user = AuthService.findUserByEmail(email);
    if (user && user.emailVerifiedAt) {
      await authEmailService.sendPasswordResetEmail(user);
      trackSecurityEvent(req, 'auth_password_reset_requested', {
        userId: user.id,
        metadata: {
          email: user.email.slice(0, 120),
        },
      });
    }

    res.json({ ok: true, message: 'If the account exists, a password reset email has been sent.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to request password reset.' });
  }
});

app.post('/auth/reset-password',
  APIGateway.rateLimit(18, 10 * 60_000, 'auth-reset-password'),
  APIGateway.validateSchema({
    token: { required: true, type: 'string', minLength: 12, maxLength: 512 },
    password: { required: true, type: 'string', minLength: 8, maxLength: 200 },
  }),
  async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');
    const reset = await AuthService.resetPasswordWithToken(token, password);
    if (!reset) {
      return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    }

    WSServer.getInstance()?.disconnectUserSessions(reset.userId);
    trackSecurityEvent(req, 'auth_password_reset_completed', {
      userId: reset.userId,
      metadata: {
        email: reset.email.slice(0, 120),
      },
    });

    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to reset password.' });
  }
});

app.post('/auth/login',
  APIGateway.rateLimit(36, 10 * 60_000, 'auth-login'),
  APIGateway.validateSchema({
    identifier: { type: 'string', minLength: 1, maxLength: 120 },
    username: { type: 'string', minLength: 1, maxLength: 120 },
    password: { required: true, type: 'string', minLength: 1, maxLength: 200 },
    timezone: { type: 'string', maxLength: 80 },
  }),
  async (req, res) => {
  try {
    const identifier = String(req.body.identifier || req.body.username || '').trim();
    const password = String(req.body.password || '');
    const timezone = String(req.body.timezone || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Email or username is required' });
    }
    if (timezone && !isValidTimeZone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone format' });
    }
    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwarded)
      ? String(forwarded[0] || '')
      : String(forwarded || req.ip || '').split(',')[0].trim();
    const result = await AuthService.login(identifier, password, {
      deviceName: String(req.headers['user-agent'] || '').trim(),
      ipAddress,
    });

    if (!result) {
      trackSecurityEvent(req, 'auth_login_failed', {
        severity: 'warn',
        metadata: {
          identifier: identifier.slice(0, 120),
        },
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    trackSecurityEvent(req, 'auth_login_success', {
      userId: Number(result.userId),
      sessionId: String(result.sessionId || ''),
      metadata: {
        identifier: identifier.slice(0, 120),
      },
    });

    if (timezone) {
      await persistUserTimezone(Number(result.userId), timezone);
    }

    const db = getDB();
    const user = db.prepare('SELECT id, username, timezone FROM users WHERE id = ?').get(result.userId) as any;
    const selectedCoach = resolveSelectedCoachForUser(Number(result.userId));
    if (Array.isArray(result.revokedSessionIds) && result.revokedSessionIds.length > 0) {
      const ws = WSServer.getInstance();
      for (const revokedSessionId of result.revokedSessionIds) {
        ws?.disconnectUserSession(Number(result.userId), String(revokedSessionId || ''));
      }
      trackSecurityEvent(req, 'auth_session_limit_revoke', {
        userId: Number(result.userId),
        severity: 'info',
        metadata: {
          revokedSessionCount: result.revokedSessionIds.length,
        },
      });
    }

    res.json({
      ...result,
      username: user?.username,
      selectedCoach,
      timezone: user?.timezone || null,
    });
  } catch (err: any) {
    if (err instanceof EmailVerificationRequiredError) {
      trackSecurityEvent(req, 'auth_login_blocked_unverified', {
        severity: 'info',
        metadata: {
          identifier: String(req.body.identifier || req.body.username || '').trim().slice(0, 120),
          email: err.email.slice(0, 120),
        },
      });
      return res.status(403).json({ error: 'Please verify your email before signing in.' });
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/auth/google',
  APIGateway.rateLimit(36, 10 * 60_000, 'auth-google'),
  APIGateway.validateSchema({
    idToken: { required: true, type: 'string', minLength: 32, maxLength: 4096 },
    timezone: { type: 'string', maxLength: 80 },
    healthDisclaimerAccepted: { type: 'boolean' },
    consentVersion: { type: 'string', minLength: 4, maxLength: 40 },
  }),
  async (req, res) => {
    try {
      const idToken = String(req.body.idToken || '').trim();
      const timezone = String(req.body.timezone || '').trim();
      if (timezone && !isValidTimeZone(timezone)) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }

      const forwarded = req.headers['x-forwarded-for'];
      const ipAddress = Array.isArray(forwarded)
        ? String(forwarded[0] || '')
        : String(forwarded || req.ip || '').split(',')[0].trim();

      const result = await AuthService.loginWithGoogle(idToken, {
        deviceName: String(req.headers['user-agent'] || '').trim(),
        ipAddress,
        userAgent: String(req.headers['user-agent'] || '').trim(),
        healthDisclaimerAccepted: Boolean(req.body.healthDisclaimerAccepted),
        consentVersion: String(req.body.consentVersion || '').trim(),
      });

      if (timezone) {
        await persistUserTimezone(Number(result.userId), timezone);
      }

      const db = getDB();
      const user = db.prepare('SELECT id, username, timezone, email FROM users WHERE id = ?').get(result.userId) as any;
      const selectedCoach = resolveSelectedCoachForUser(Number(result.userId));

      trackSecurityEvent(req, 'auth_google_login_success', {
        userId: Number(result.userId),
        sessionId: String(result.sessionId || ''),
        metadata: {
          email: String(user?.email || '').slice(0, 120),
        },
      });

      res.json({
        ...result,
        username: user?.username,
        selectedCoach,
        timezone: user?.timezone || null,
      });
    } catch (err: any) {
      trackSecurityEvent(req, 'auth_google_login_failed', {
        severity: 'warn',
        metadata: {
          message: String(err?.message || '').slice(0, 160),
        },
      });
      res.status(400).json({ error: err.message || 'Google sign-in failed.' });
    }
  });

app.post('/auth/refresh',
  APIGateway.rateLimit(80, 10 * 60_000, 'auth-refresh'),
  APIGateway.validateSchema({
  refreshToken: { required: true, type: 'string', minLength: 24, maxLength: 512 },
  timezone: { type: 'string', maxLength: 80 },
}),
  async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || '').trim();
    const timezone = String(req.body.timezone || '').trim();
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    if (timezone && !isValidTimeZone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone format' });
    }

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress = Array.isArray(forwarded)
      ? String(forwarded[0] || '')
      : String(forwarded || req.ip || '').split(',')[0].trim();

    const refreshed = AuthService.refreshSession(refreshToken, {
      deviceName: String(req.headers['user-agent'] || '').trim(),
      ipAddress,
    });

    if (!refreshed) {
      trackSecurityEvent(req, 'auth_refresh_failed', { severity: 'warn' });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    trackSecurityEvent(req, 'auth_refresh_success', {
      userId: Number(refreshed.userId),
      sessionId: String(refreshed.sessionId || ''),
    });

    if (timezone) {
      await persistUserTimezone(Number(refreshed.userId), timezone);
    }

    const db = getDB();
    const user = db.prepare('SELECT id, username, timezone FROM users WHERE id = ?').get(refreshed.userId) as any;
    const selectedCoach = resolveSelectedCoachForUser(Number(refreshed.userId));

    res.json({
      ...refreshed,
      username: user?.username,
      selectedCoach,
      timezone: user?.timezone || null,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to refresh session' });
  }
});

app.get(['/media/file/:fileName', '/uploads/:fileName'], async (req, res) => {
  try {
    const mediaPath = mediaPathFromFileName(String(req.params.fileName || ''));
    if (!mediaPath) {
      return res.status(400).json({ error: 'Invalid media path' });
    }

    const hasValidSignature = verifyMediaPathSignature(mediaPath, req.query.exp, req.query.sig);

    const authHeader = String(req.headers.authorization || '').trim();
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : '';
    const authPayload = bearerToken ? AuthService.verifyToken(bearerToken) : null;

    const fileName = fileNameFromMediaPath(mediaPath);
    if (!fileName) {
      return res.status(400).json({ error: 'Invalid media file' });
    }

    const asset = mediaAssetService.getByFileName(fileName);
    if (asset) {
      const actorUserId = authPayload?.userId ? Number(authPayload.userId) : null;
      if (!(await mediaAssetService.canAccessAsset(asset, actorUserId, hasValidSignature))) {
        return res.status(actorUserId ? 403 : 401).json({ error: 'Unauthorized media access' });
      }

      const handle = await mediaAssetService.resolveDelivery(asset);
      if (!handle) {
        return res.status(404).json({ error: 'Media not found' });
      }

      res.setHeader('Content-Type', asset.mimeType || inferUploadMimeType(asset.fileName, 'application/octet-stream'));
      res.setHeader('Cache-Control', hasValidSignature ? 'public, max-age=3600' : 'private, max-age=60');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (handle.absolutePath) {
        return res.sendFile(handle.absolutePath);
      }
      if (handle.redirectUrl) {
        return res.redirect(302, handle.redirectUrl);
      }
      return res.status(404).json({ error: 'Media not found' });
    }

    const isAuthenticated = Boolean(authPayload?.userId);
    if (!hasValidSignature && !isAuthenticated) {
      return res.status(401).json({ error: 'Unauthorized media access' });
    }

    const absoluteUploadRoot = path.resolve(uploadsDir);
    const resolved = path.resolve(path.join(absoluteUploadRoot, fileName));
    if (!resolved.startsWith(`${absoluteUploadRoot}${path.sep}`)) {
      return res.status(400).json({ error: 'Invalid media file path' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const mime = inferUploadMimeType(fileName, 'application/octet-stream');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', hasValidSignature ? 'public, max-age=3600' : 'private, max-age=60');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolved);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Failed to load media' });
  }
});

app.use(requireAuth);

app.post('/media/upload-url',
  APIGateway.rateLimit(60, 10 * 60_000, 'media-upload-url'),
  APIGateway.validateSchema({
    fileName: { required: true, type: 'string', minLength: 1, maxLength: 255 },
    contentType: { required: true, type: 'string', minLength: 1, maxLength: 120 },
    sizeBytes: { type: 'number', min: 1, max: 50 * 1024 * 1024 },
    source: { type: 'string', maxLength: 40 },
    visibility: { type: 'string', minLength: 1, maxLength: 20 },
  }),
  async (req, res) => {
    try {
      const authUserId = assertAuthUser(req);
      const fileName = path.basename(String(req.body.fileName || '').trim());
      const contentType = String(req.body.contentType || '').trim().toLowerCase();
      const sizeBytes = Number(req.body.sizeBytes || 0);
      const source = String(req.body.source || 'upload').trim();
      const visibility = normalizeMediaVisibility(req.body.visibility, 'private');
      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }
      if (!ALLOWED_UPLOAD_MIME.has(contentType)) {
        return res.status(400).json({ error: 'Unsupported contentType' });
      }

      const isHeic = contentType.includes('heic')
        || contentType.includes('heif')
        || fileName.toLowerCase().endsWith('.heic')
        || fileName.toLowerCase().endsWith('.heif');
      if (isHeic && PROFILE_UPLOAD_SOURCES.has(source)) {
        logger.warn(`[media] rejecting HEIC profile upload source=${source} file="${fileName}" size=${sizeBytes || 0}`);
        return res.status(400).json({ error: 'Profile avatar/background uploads do not support HEIC/HEIF yet. Please convert to JPG or PNG first.' });
      }
      if (isHeic) {
        return res.json({ strategy: 'legacy_multipart' });
      }

      const intent = await mediaAssetService.createUploadIntent({
        ownerUserId: authUserId,
        fileName,
        mimeType: contentType,
        sizeBytes,
        source,
        visibility,
      }, (asset) => {
        const origin = tryBuildPublicOrigin(req) || '';
        return {
          method: 'PUT',
          url: `${origin}/media/upload/direct/${encodeURIComponent(asset.id)}`,
          headers: {
            'Content-Type': contentType,
          },
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        };
      });

      const delivery = buildAssetDelivery(req, intent.asset);
      res.json({
        strategy: mediaAssetService.provider.kind === 's3' ? 'presigned' : 'direct',
        assetId: intent.asset.id,
        upload: intent.upload,
        path: delivery.path,
        url: delivery.url,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create upload intent' });
    }
  });

app.put('/media/upload/direct/:assetId',
  APIGateway.rateLimit(60, 10 * 60_000, 'media-upload-direct'),
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    try {
      const authUserId = assertAuthUser(req);
      const assetId = String(req.params.assetId || '').trim();
      const asset = mediaAssetService.getById(assetId);
      if (!asset) {
        return res.status(404).json({ error: 'Upload intent not found' });
      }
      if (asset.ownerUserId !== authUserId) {
        return res.status(403).json({ error: 'Forbidden upload intent' });
      }
      if (asset.status !== 'pending') {
        return res.status(409).json({ error: 'Upload intent already finalized' });
      }

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
      if (!body.length) {
        return res.status(400).json({ error: 'Empty upload body' });
      }
      await mediaAssetService.writeObjectForAsset(asset, body, asset.mimeType);
      res.status(204).end();
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to upload media' });
    }
  });

app.post('/media/finalize',
  APIGateway.rateLimit(60, 10 * 60_000, 'media-finalize'),
  APIGateway.validateSchema({
    assetId: { required: true, type: 'string', minLength: 5, maxLength: 80 },
  }),
  async (req, res) => {
    try {
      const authUserId = assertAuthUser(req);
      const assetId = String(req.body.assetId || '').trim();
      const asset = mediaAssetService.getById(assetId);
      if (!asset) {
        return res.status(404).json({ error: 'Media asset not found' });
      }
      if (asset.ownerUserId !== authUserId) {
        return res.status(403).json({ error: 'Forbidden media asset' });
      }

      const finalized = await mediaAssetService.finalizeUpload(assetId);
      const delivery = buildAssetDelivery(req, finalized);
      res.json({
        assetId: finalized.id,
        mediaId: finalized.id,
        path: delivery.path,
        url: delivery.url,
        fileName: finalized.fileName,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to finalize media upload' });
    }
  });

app.get('/media/access-url/:assetId', async (req, res) => {
  try {
    const authUserId = assertAuthUser(req);
    const assetId = String(req.params.assetId || '').trim();
    const asset = mediaAssetService.getById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Media asset not found' });
    }
    const allowed = await mediaAssetService.canAccessAsset(asset, authUserId, false);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden media asset' });
    }
    const delivery = buildAssetDelivery(req, asset);
    res.json({ path: delivery.path, url: delivery.url, assetId: asset.id });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to resolve media access URL' });
  }
});

app.post('/auth/logout', (req, res) => {
  const authToken = String(req.authToken || '');
  const authUserId = req.authUserId;
  const authSessionId = req.authSessionId;

  if (authToken) {
    AuthService.logoutToken(authToken);
  }

  if (authUserId && authSessionId) {
    WSServer.getInstance()?.disconnectUserSession(authUserId, authSessionId);
    trackSecurityEvent(req, 'auth_logout_success', {
      userId: authUserId,
      sessionId: authSessionId,
    });
  }

  res.json({ success: true });
});

app.post('/auth/logout-all', (req, res) => {
  const authUserId = assertAuthUser(req);
  AuthService.revokeAllSessions(authUserId, req.authSessionId);
  WSServer.getInstance()?.disconnectUserSessions(authUserId, req.authSessionId);
  trackSecurityEvent(req, 'auth_logout_all_success', {
    userId: authUserId,
    sessionId: req.authSessionId || null,
  });
  res.json({ success: true });
});

app.post('/auth/delete-account',
  requireSameUserIdFromBody('userId'),
  APIGateway.rateLimit(8, 10 * 60_000, 'auth-delete-account'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
  }),
  async (req, res) => {
    try {
      const authUserId = assertAuthUser(req);
      const userId = toUserId(req.body.userId);
      if (authUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden user scope' });
      }

      const wsServer = WSServer.getInstance();
      await mediaAssetService.deleteAllForUser(userId);
      const { affectedFriendIds } = await AuthService.deleteAccount(userId);
      wsServer?.disconnectUserSessions(userId);

      if (affectedFriendIds.length > 0) {
        await publishRealtimeEventSafely({
          type: 'friends_updated',
          userIds: affectedFriendIds,
        }, 'delete-account-friends-updated');
        await publishRealtimeEventSafely({
          type: 'inbox_updated',
          userIds: affectedFriendIds,
        }, 'delete-account-inbox-updated');
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to delete account.' });
    }
  });

app.get('/auth/sessions', (req, res) => {
  const authUserId = assertAuthUser(req);
  const sessions = AuthService.getSessions(authUserId).map((session) => ({
    sessionId: session.session_id,
    deviceName: session.device_name,
    ipAddress: session.ip_address,
    createdAt: session.created_at,
    expiresAt: session.expires_at,
    revokedAt: session.revoked_at,
    lastSeenAt: session.last_seen_at,
    current: session.session_id === req.authSessionId,
  }));
  res.json({ sessions });
});

app.get('/security/events/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  const userId = toUserId(req.params.userId);
  const rawLimit = Number(req.query.limit || 40);
  const limit = Number.isFinite(rawLimit) ? Math.min(120, Math.max(1, Math.floor(rawLimit))) : 40;
  const events = SecurityEventService.listForUser(userId, limit);
  res.json({ events });
});

app.post('/auth/sessions/revoke', APIGateway.validateSchema({
  sessionId: { required: true, type: 'string', minLength: 6, maxLength: 128 },
}), (req, res) => {
  const authUserId = assertAuthUser(req);
  const sessionId = String(req.body.sessionId || '').trim();
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const changed = AuthService.revokeSession(authUserId, sessionId);
  if (!changed) {
    trackSecurityEvent(req, 'auth_session_revoke_missing', {
      userId: authUserId,
      severity: 'warn',
      metadata: { targetSessionId: sessionId },
    });
    return res.status(404).json({ error: 'Session not found' });
  }

  WSServer.getInstance()?.disconnectUserSession(authUserId, sessionId);
  trackSecurityEvent(req, 'auth_session_revoke_success', {
    userId: authUserId,
    metadata: { targetSessionId: sessionId },
  });
  res.json({ success: true });
});

app.get('/users/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return res.json({ users: [] });
  }

  const users = getDB().prepare(
    'SELECT id, username, avatar_url FROM users WHERE username LIKE ? ORDER BY username ASC LIMIT 12',
  ).all(`%${q}%`).map((row: any) => ({
    id: Number(row.id),
    username: String(row.username || ''),
    avatar_url: mediaUrlForClient(req, row.avatar_url),
  }));
  res.json({ users });
});

app.get('/users/public/:id', (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.id);
  const db = getDB();

  const user = db
    .prepare('SELECT id, username, avatar_url, bio, fitness_goal FROM users WHERE id = ?')
    .get(targetUserId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });

  const relation = db.prepare(`
    SELECT status
    FROM friendships
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
    ORDER BY id DESC
    LIMIT 1
  `).get(authUserId, targetUserId, targetUserId, authUserId) as any;

  const friendshipStatus = authUserId === targetUserId ? 'self' : (relation?.status || 'none');
  res.json({
    id: user.id,
    username: user.username,
    avatar_url: mediaUrlForClient(req, user.avatar_url),
    bio: user.bio,
    fitness_goal: user.fitness_goal,
    friendship_status: friendshipStatus,
  });
});

app.get('/users/:id', (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.id);

  if (!isFriend(authUserId, targetUserId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const user = getDB().prepare('SELECT id, username, avatar_url, bio, fitness_goal FROM users WHERE id = ?').get(targetUserId) as any;
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: Number(user.id),
    username: String(user.username || ''),
    avatar_url: mediaUrlForClient(req, user.avatar_url),
    bio: user.bio || null,
    fitness_goal: user.fitness_goal || null,
  });
});

app.post('/coach/select', requireSameUserIdFromBody('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const coach = req.body.coach === 'lc' ? 'lc' : 'zj';
    getDB().prepare('UPDATE users SET selected_coach = ? WHERE id = ?').run(coach, userId);
    res.json({ success: true, selectedCoach: coach });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/community/post',
  APIGateway.rateLimit(90, 10 * 60_000, 'community-post'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    type: { type: 'string', minLength: 1, maxLength: 40 },
    visibility: { type: 'string', minLength: 1, maxLength: 20 },
    content: { type: 'string', maxLength: 8000 },
    mediaUrls: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 2048 },
    mediaIds: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 128 },
  }),
  async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const type = String(req.body.type || 'text').slice(0, 40);
    const visibility = normalizePostVisibility(req.body.visibility, 'friends');
    const content = String(req.body.content || '').slice(0, 8000);
    const mediaUrls = sanitizeMediaUrls(req.body.mediaUrls, 5);
    const mediaIds = sanitizeMediaIds(req.body.mediaIds, 5);
    const resolvedAssetIds = resolveOwnedAssetIds(userId, mediaIds, mediaUrls);
    const resolvedMediaUrls = mediaUrls.length > 0 ? mediaUrls : mediaPathsForAssetIds(resolvedAssetIds);

    const postId = CommunityService.createPost(userId, type, content, resolvedMediaUrls, visibility);
    await mediaAssetService.attachAssetsToPost(resolvedAssetIds, userId, postId, visibility);
    res.json({ postId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/community/post/visibility',
  APIGateway.rateLimit(120, 10 * 60_000, 'community-post-visibility'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    postId: { required: true, type: 'number', integer: true, min: 1 },
    visibility: { required: true, type: 'string', minLength: 1, maxLength: 20 },
  }),
  async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const postId = toUserId(req.body.postId);
    const visibility = normalizePostVisibility(req.body.visibility, 'friends');
    CommunityService.updatePostVisibility(postId, userId, visibility);
    mediaAssetService.syncPostAssetVisibility(userId, postId, visibility);
    res.json({ success: true, visibility });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to update post visibility.' });
  }
});

app.post('/community/post/delete',
  APIGateway.rateLimit(80, 10 * 60_000, 'community-post-delete'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    postId: { required: true, type: 'number', integer: true, min: 1 },
  }),
  async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const postId = toUserId(req.body.postId);
    await mediaAssetService.deletePostAssets(userId, postId);
    CommunityService.deletePost(postId, userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to delete post.' });
  }
});

app.post('/community/react',
  APIGateway.rateLimit(200, 10 * 60_000, 'community-react'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    postId: { required: true, type: 'number', integer: true, min: 1 },
    reactionType: { type: 'string', minLength: 1, maxLength: 24 },
  }),
  async (req, res) => {
  try {
    CommunityService.reactToPost(toUserId(req.body.postId), toUserId(req.body.userId), String(req.body.reactionType || 'like'));
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/community/feed/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const feed = CommunityService.getFeed(toUserId(req.params.userId)).map((post: any) => ({
    ...post,
    avatar_url: mediaUrlForClient(req, post.avatar_url),
    media_urls: mediaUrlsForClient(req, Array.isArray(post.media_urls) ? post.media_urls : []),
  }));
  res.json({ feed });
});

app.get('/community/post/:postId/comments', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const postId = toUserId(req.params.postId);

  if (!CommunityService.canAccessPost(authUserId, postId)) {
    return res.status(403).json({ error: 'Forbidden post scope' });
  }

  const comments = CommunityService.getComments(postId).map((comment: any) => ({
    ...comment,
    avatar_url: mediaUrlForClient(req, comment.avatar_url),
  }));
  res.json({ comments });
});

app.post('/community/comment',
  APIGateway.rateLimit(220, 10 * 60_000, 'community-comment'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  postId: { required: true, type: 'number', integer: true, min: 1 },
  content: { required: true, type: 'string', minLength: 1, maxLength: 1200 },
}),
  async (req, res) => {
  const userId = toUserId(req.body.userId);
  const postId = toUserId(req.body.postId);
  const content = String(req.body.content || '').trim().slice(0, 1200);
  if (!content) {
    return res.status(400).json({ error: 'Comment content is required' });
  }

  if (!CommunityService.canAccessPost(userId, postId)) {
    return res.status(403).json({ error: 'Forbidden post scope' });
  }

  const commentId = CommunityService.addComment(postId, userId, content);
  const mentions = extractMentionHandles(content);
  const notifiedUsers = MessageService.createPostCommentMentionNotifications(
    userId,
    postId,
    mentions,
    commentId,
    content,
  );
  if (notifiedUsers.length > 0) {
    await publishRealtimeEventSafely({
      type: 'inbox_updated',
      userIds: notifiedUsers,
    }, 'community-comment-mentions');
  }

  res.json({ success: true, commentId });
});

app.post('/media/upload', APIGateway.rateLimit(40, 10 * 60_000, 'media-upload'), upload.single('file'), async (req: Request, res) => {
  try {
    const authUserId = assertAuthUser(req);
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No file' });
    const source = String(req.body?.source || 'upload').trim().slice(0, 40) || 'upload';
    const visibility = normalizeMediaVisibility(req.body?.visibility, 'private');

    let processedPath = file.path as string;
    let finalName = path.basename(processedPath);

    const lowerName = String(file.originalname || '').toLowerCase();
    const lowerMime = String(file.mimetype || '').toLowerCase();
    const isHeic = lowerMime.includes('heic')
      || lowerMime.includes('heif')
      || lowerName.endsWith('.heic')
      || lowerName.endsWith('.heif');
    if (isHeic && PROFILE_UPLOAD_SOURCES.has(source)) {
      logger.warn(`[media] blocking legacy HEIC profile upload source=${source} file="${String(file.originalname || '').slice(0, 200)}" size=${Number(file.size || 0)}`);
      void fsPromises.unlink(file.path).catch(() => {});
      return res.status(400).json({ error: 'Profile avatar/background uploads do not support HEIC/HEIF yet. Please convert to JPG or PNG first.' });
    }
    if (isHeic) {
      const heicStart = Date.now();
      logger.info(`[media] HEIC conversion:start source=${source} file="${String(file.originalname || '').slice(0, 200)}" size=${Number(file.size || 0)}`);
      processedPath = await MediaService.convertHEIC(file.path);
      finalName = path.basename(processedPath);
      logger.info(`[media] HEIC conversion:done source=${source} file="${String(file.originalname || '').slice(0, 200)}" elapsed_ms=${Date.now() - heicStart}`);
    }

    const absoluteUploadRoot = `${path.resolve(uploadsDir)}${path.sep}`;
    const normalizedProcessedPath = path.resolve(processedPath);
    if (!normalizedProcessedPath.startsWith(absoluteUploadRoot)) {
      throw new Error('Invalid upload file path');
    }

    let assetId: string | null = null;
    let legacyMediaId: string | null = null;
    let deliveredPath = '';
    let deliveredUrl = '';

    const deliveredMime = inferUploadMimeType(finalName, String(file.mimetype || '').toLowerCase());

    try {
      const asset = mediaAssetService.provider.kind === 'local'
        ? await mediaAssetService.registerStoredObject({
            ownerUserId: authUserId,
            fileName: finalName,
            mimeType: deliveredMime,
            originalFilename: String(file.originalname || finalName),
            source,
            visibility,
            metadata: {
              platform: source,
            },
          })
        : await mediaAssetService.registerUpload({
            ownerUserId: authUserId,
            absolutePath: processedPath,
            fileName: finalName,
            mimeType: deliveredMime,
            originalFilename: String(file.originalname || finalName),
            source,
            visibility,
            metadata: {
              platform: source,
            },
          });
      assetId = asset.id;
      const delivered = buildAssetDelivery(req, asset);
      deliveredPath = delivered.path;
      deliveredUrl = delivered.url;
    } catch (assetErr) {
      console.error('Failed to register uploaded media asset:', assetErr);
      try {
        const refs = await mediaStore.ingestLocalFiles(String(authUserId), [{
          absolutePath: processedPath,
          contentType: deliveredMime,
          name: finalName,
          platform: source,
        }]);
        legacyMediaId = refs[0]?.id || null;
      } catch (ingestErr) {
        console.error('Failed to index uploaded media fallback:', ingestErr);
      }
    }

    if (!deliveredPath) {
      const delivered = buildMediaDelivery(req, finalName);
      deliveredPath = delivered.path;
      deliveredUrl = delivered.url;
    }

    if (mediaAssetService.provider.kind === 'local') {
      if (processedPath !== file.path) {
        void fsPromises.unlink(file.path).catch(() => {});
      }
    } else {
      void fsPromises.unlink(file.path).catch(() => {});
      if (processedPath !== file.path) {
        void fsPromises.unlink(processedPath).catch(() => {});
      }
    }

    res.json({
      path: deliveredPath,
      url: deliveredUrl,
      fileName: assetId ? (mediaAssetService.getById(assetId)?.fileName || finalName) : finalName,
      mediaId: assetId || legacyMediaId,
      assetId,
      legacyMediaId,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/media/analyze-food',
  APIGateway.rateLimit(60, 10 * 60_000, 'media-analyze-food'),
  APIGateway.validateSchema({
    imagePath: { type: 'string', maxLength: 2048 },
    path: { type: 'string', maxLength: 2048 },
    url: { type: 'string', maxLength: 2048 },
  }),
  async (req, res) => {
  try {
    const authUserId = assertAuthUser(req);
    const { absolutePath, cleanup } = await resolveMediaPathForAnalysis(
      req.body.imagePath || req.body.path || req.body.url,
      authUserId,
    );
    try {
      const result = await MediaService.analyzeFood(absolutePath);
      res.json(result);
    } finally {
      await cleanup();
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/messages/inbox/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const inbox = await MessageService.getInbox(req.params.userId);
  res.json({
    ...inbox,
    dms: (inbox.dms || []).map((item: any) => ({
      ...item,
      avatar_url: mediaUrlForClient(req, item.avatar_url),
    })),
  });
});

app.get('/messages/:topic', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const topic = String(req.params.topic || '').trim();
  const allowed = await MessageService.canAccessTopic(authUserId, topic);
  if (!allowed) {
    return res.status(403).json({ error: 'Forbidden topic' });
  }

  const messages = await MessageService.getMessages(topic);
  res.json({
    messages: messages.reverse().map((message) => ({
      ...message,
      avatar_url: mediaUrlForClient(req, message.avatar_url),
      media_urls: mediaUrlsForClient(req, Array.isArray(message.media_urls) ? message.media_urls : []),
    })),
  });
});

app.post('/messages/read', requireSameUserIdFromBody('userId'), APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  topic: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 120,
    pattern: /^(coach_(?:zj|lc)_\d+|coach_\d+|p2p_\d+_\d+|grp_\d+)$/,
  },
  messageId: { type: 'number', integer: true, min: 1 },
}), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const topic = String(req.body.topic || '').trim();
    const allowed = await MessageService.canAccessTopic(userId, topic);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden topic' });
    }

    const messageId = toOptionalInt(req.body.messageId);
    await MessageService.markTopicRead(userId, topic, messageId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/notifications/mentions/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  const userId = toUserId(req.params.userId);
  const mentions = MessageService.getMentionNotifications(userId);
  res.json({ mentions });
});

app.post('/notifications/mentions/read', requireSameUserIdFromBody('userId'), APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  ids: { type: 'array', maxItems: 80, itemType: 'number' },
}), (req, res) => {
  const userId = toUserId(req.body.userId);
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map((item: unknown) => Number(item)) : [];
  const changed = MessageService.markMentionNotificationsRead(userId, ids);
  res.json({ success: true, updated: changed });
});

app.post('/moderation/report',
  APIGateway.rateLimit(28, 10 * 60_000, 'moderation-report'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  targetType: { required: true, type: 'string', enum: [...MODERATION_TARGET_TYPES] },
  targetId: { required: true, type: 'number', integer: true, min: 1 },
  reason: { required: true, type: 'string', minLength: 3, maxLength: 80 },
  details: { type: 'string', maxLength: 1200 },
}),
  (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const targetType = String(req.body.targetType || '').trim() as typeof MODERATION_TARGET_TYPES[number];
    const targetId = toUserId(req.body.targetId);
    const reason = String(req.body.reason || '').trim().slice(0, 80);
    const details = String(req.body.details || '').trim().slice(0, 1200);

    if (!MODERATION_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: 'Invalid targetType' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const reportId = ModerationService.createReport(userId, targetType, targetId, reason, details);
    trackSecurityEvent(req, 'moderation_report_submitted', {
      userId,
      metadata: {
        targetType,
        targetId,
        reason,
        reportId,
      },
    });
    res.json({ success: true, reportId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit report' });
  }
});

app.get('/moderation/reports/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  const userId = toUserId(req.params.userId);
  const reports = ModerationService.getReportsForUser(userId);
  res.json({ reports });
});

app.post('/knowledge/ingestion/request',
  APIGateway.rateLimit(20, 10 * 60_000, 'knowledge-ingestion-request'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    source: { required: true, type: 'string', minLength: 3, maxLength: 180 },
    domain: { required: true, type: 'string', enum: ['fitness', 'nutrition'] },
    title: { type: 'string', maxLength: 140 },
    content: { required: true, type: 'string', minLength: 120, maxLength: 240000 },
  }),
  (req, res) => {
    try {
      const requesterUserId = toUserId(req.body.userId);
      const result = knowledgeIngestionService.requestIngestion({
        requesterUserId,
        source: String(req.body.source || ''),
        domain: String(req.body.domain || 'fitness') as 'fitness' | 'nutrition',
        title: String(req.body.title || ''),
        content: String(req.body.content || ''),
      });
      trackSecurityEvent(req, 'knowledge_ingestion_requested', {
        userId: requesterUserId,
        metadata: {
          requestId: result.requestId,
          riskLevel: result.riskLevel,
          riskFlags: result.riskFlags,
        },
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to request ingestion' });
    }
  });

app.get('/knowledge/ingestion/requests/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  try {
    const userId = toUserId(req.params.userId);
    const requests = knowledgeIngestionService.listRequests(userId);
    res.json({ requests });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to list ingestion requests' });
  }
});

app.post('/knowledge/ingestion/review',
  APIGateway.rateLimit(30, 10 * 60_000, 'knowledge-ingestion-review'),
  APIGateway.validateSchema({
    requestId: { required: true, type: 'number', integer: true, min: 1 },
    action: { required: true, type: 'string', enum: ['approve', 'reject'] },
    notes: { type: 'string', maxLength: 500 },
  }),
  (req, res) => {
    try {
      const actorUserId = assertKnowledgeAdmin(req);
      const result = knowledgeIngestionService.reviewRequest({
        actorUserId,
        requestId: toUserId(req.body.requestId),
        action: String(req.body.action || 'approve') as 'approve' | 'reject',
        notes: String(req.body.notes || ''),
      });
      trackSecurityEvent(req, 'knowledge_ingestion_reviewed', {
        userId: actorUserId,
        metadata: {
          requestId: result.requestId,
          status: result.status,
        },
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      const statusCode = /admin privilege/i.test(String(err?.message || '')) ? 403 : 400;
      res.status(statusCode).json({ error: err.message || 'Failed to review ingestion request' });
    }
  });

app.post('/knowledge/ingestion/apply',
  APIGateway.rateLimit(20, 10 * 60_000, 'knowledge-ingestion-apply'),
  APIGateway.validateSchema({
    requestId: { required: true, type: 'number', integer: true, min: 1 },
  }),
  async (req, res) => {
    try {
      const actorUserId = assertKnowledgeAdmin(req);
      const result = await knowledgeIngestionService.applyApprovedRequest({
        actorUserId,
        requestId: toUserId(req.body.requestId),
      });
      trackSecurityEvent(req, 'knowledge_ingestion_applied', {
        userId: actorUserId,
        metadata: {
          requestId: result.requestId,
          file: result.file,
          vectorUpserted: result.vectorUpserted,
        },
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      const statusCode = /admin privilege/i.test(String(err?.message || '')) ? 403 : 400;
      res.status(statusCode).json({ error: err.message || 'Failed to apply ingestion request' });
    }
  });

app.post('/messages/send',
  APIGateway.rateLimit(260, 10 * 60_000, 'messages-send'),
  requireSameUserIdFromBody('fromUserId'),
  APIGateway.validateSchema({
  fromUserId: { required: true, type: 'number', integer: true, min: 1 },
  topic: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 120,
    pattern: /^(coach_(?:zj|lc)_\d+|coach_\d+|p2p_\d+_\d+|grp_\d+)$/,
  },
  content: { type: 'string', maxLength: 8000 },
  mediaUrls: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 2048 },
  mediaIds: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 128 },
  replyTo: { type: 'number', integer: true, min: 1 },
  clientMessageId: { type: 'string', minLength: 1, maxLength: 80, pattern: /^[a-zA-Z0-9._:-]{1,80}$/ },
}),
  async (req, res) => {
  try {
    const fromUserId = toUserId(req.body.fromUserId);
    const topic = String(req.body.topic || '').trim();
    const content = String(req.body.content || '').trim().slice(0, 8000);
    const clientMessageId = String(req.body.clientMessageId || '').trim().slice(0, 80) || null;
    const mediaUrls = sanitizeMediaUrls(req.body.mediaUrls, 5);
    const mediaIds = sanitizeMediaIds(req.body.mediaIds, 5);
    const resolvedAssetIds = resolveOwnedAssetIds(fromUserId, mediaIds, mediaUrls);
    const resolvedMediaUrls = mediaUrls.length > 0 ? mediaUrls : mediaPathsForAssetIds(resolvedAssetIds);

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    if (!content && resolvedMediaUrls.length === 0 && resolvedAssetIds.length === 0) {
      return res.status(400).json({ error: 'Message content or media is required' });
    }

    const allowed = await MessageService.canAccessTopic(fromUserId, topic);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden topic' });
    }

    const participants = await MessageService.getTopicParticipants(topic);

    const mentions = extractMentionHandles(content);
    const messageId = await MessageService.sendMessage(fromUserId, topic, content, resolvedMediaUrls, mentions, toOptionalInt(req.body.replyTo));
    await mediaAssetService.attachAssetsToMessage(resolvedAssetIds, fromUserId, messageId, topic);
    await MessageService.markTopicRead(fromUserId, topic, messageId);
    const mentionTargets = await MessageService.createMessageMentionNotifications(
      fromUserId,
      topic,
      mentions,
      messageId,
      content,
    );
    const [newMessage] = (await MessageService.getMessages(topic, 1));
    const deliveredMediaUrls = mediaUrlsForClient(req, resolvedMediaUrls);
    const deliveredMessage = newMessage
      ? {
          ...newMessage,
          client_message_id: clientMessageId,
          avatar_url: mediaUrlForClient(req, newMessage.avatar_url),
          media_urls: mediaUrlsForClient(req, Array.isArray(newMessage.media_urls) ? newMessage.media_urls : []),
        }
      : null;

    await publishRealtimeEventSafely({
      type: 'message_created',
      topic,
      clientMessageId,
      message: deliveredMessage || {
      id: messageId,
      topic,
      from_user_id: fromUserId,
      content,
      media_urls: deliveredMediaUrls,
      mentions,
      reply_to: null,
      created_at: new Date().toISOString(),
      username: req.body.username || `User ${fromUserId}`,
        avatar_url: null,
        is_coach: false,
        client_message_id: clientMessageId,
      },
    }, 'message-created');
    await publishRealtimeEventSafely({
      type: 'inbox_updated',
      userIds: participants.length > 0 ? participants : [fromUserId],
    }, 'inbox-updated');
    if (mentionTargets.length > 0) {
      await publishRealtimeEventSafely({
        type: 'inbox_updated',
        userIds: mentionTargets,
      }, 'mention-inbox-updated');
    }

    const coachReplyJob = buildCoachReplyJob({
      userId: fromUserId,
      topic,
      content,
      mentions,
      mediaUrls: deliveredMediaUrls,
      mediaIds: resolvedAssetIds.length > 0 ? resolvedAssetIds : mediaIds,
      participantUserIds: participants,
      platform: 'web',
    });
    if (coachReplyJob) {
      try {
        await enqueueCoachReply(coachReplyJob);
      } catch (error) {
        logger.error('[api] failed to enqueue coach reply', error);
      }
    }

    res.json({ success: true, messageId, clientMessageId, message: deliveredMessage });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/friends/add', requireSameUserIdFromBody('userId'), APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  friendId: { type: 'number', integer: true, min: 1 },
  username: { type: 'string', minLength: 1, maxLength: 40 },
  connectCode: { type: 'string', minLength: 4, maxLength: 256 },
}), async (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    let friendId = toOptionalInt(req.body.friendId);
    if (!friendId && req.body.connectCode) {
      friendId = extractUserIdFromConnectCode(req.body.connectCode);
    }

    if (!friendId && req.body.username) {
      const user = getDB().prepare('SELECT id FROM users WHERE username = ?').get(String(req.body.username).trim()) as any;
      friendId = user?.id;
    }

    if (!friendId) {
      return res.status(400).json({ error: 'friendId, username, or connectCode is required' });
    }

    const targetUser = getDB().prepare('SELECT id FROM users WHERE id = ?').get(friendId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Friend user not found' });
    }

    await FriendService.addFriend(String(userId), String(friendId));
    await publishRealtimeEventSafely({
      type: 'friends_updated',
      userIds: [userId, Number(friendId)],
    }, 'friends-add-updated');
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/friends/connect/:userId', requireSameUserIdFromParam('userId'), (req, res) => {
  const userId = toUserId(req.params.userId);
  const issued = issueUserConnectCode(userId);
  const connectId = issued.connectId;
  const ttlSeconds = FRIEND_CONNECT_CODE_TTL_SECONDS;
  const token = AuthService.createFriendConnectToken(userId, ttlSeconds);
  const connectCode = `zym://add-friend?uid=${userId}&connectId=${connectId}&token=${encodeURIComponent(token)}`;
  const expiresAt = issued.expiresAt;
  res.json({ userId, connectId, connectCode, token, ttlSeconds, expiresAt });
});

app.post('/friends/resolve-connect', APIGateway.rateLimit(60, 10 * 60_000, 'friends-resolve-connect'), APIGateway.validateSchema({
  connectCode: { required: true, type: 'string', minLength: 4, maxLength: 256 },
}), (req, res) => {
  try {
    const connectCode = String(req.body?.connectCode || '').trim();
    if (!connectCode) {
      return res.status(400).json({ error: 'connectCode is required' });
    }
    const userId = extractUserIdFromConnectCode(connectCode);
    if (!userId) {
      return res.status(404).json({ error: 'Connect code not found' });
    }
    const user = getDB().prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as { id?: number; username?: string } | undefined;
    if (!user?.id) {
      return res.status(404).json({ error: 'Connect code user not found' });
    }
    res.json({ userId: Number(user.id), username: user.username || '' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Invalid connect code' });
  }
});

app.post('/friends/accept',
  APIGateway.rateLimit(90, 10 * 60_000, 'friends-accept'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    friendId: { required: true, type: 'number', integer: true, min: 1 },
  }),
  async (req, res) => {
  const userId = toUserId(req.body.userId);
  const friendId = toUserId(req.body.friendId);
  await FriendService.acceptFriend(String(userId), String(friendId));
  await publishRealtimeEventSafely({
    type: 'friends_updated',
    userIds: [userId, friendId],
  }, 'friends-accept-updated');
  await publishRealtimeEventSafely({
    type: 'inbox_updated',
    userIds: [userId, friendId],
  }, 'friends-accept-inbox-updated');
  res.json({ success: true });
});

app.get('/friends/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const friends = (await FriendService.getFriends(req.params.userId)).map((friend: any) => ({
    ...friend,
    avatar_url: mediaUrlForClient(req, friend.avatar_url),
  }));
  res.json({ friends });
});

app.get('/friends/requests/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const requests = (await FriendService.getPendingRequests(req.params.userId)).map((row: any) => ({
    ...row,
    avatar_url: mediaUrlForClient(req, row.avatar_url),
  }));
  res.json({ requests });
});

app.post('/groups/create',
  APIGateway.rateLimit(50, 10 * 60_000, 'groups-create'),
  APIGateway.validateSchema({
  ownerId: { required: true, type: 'number', integer: true, min: 1 },
  name: { type: 'string', minLength: 1, maxLength: 80 },
  coachEnabled: { type: 'string', enum: ['none', 'zj', 'lc'] },
}),
  async (req, res) => {
  const authUserId = assertAuthUser(req);
  const ownerId = toUserId(req.body.ownerId);
  if (authUserId !== ownerId) {
    return res.status(403).json({ error: 'Forbidden owner scope' });
  }

  const groupId = await GroupService.createGroup(
    String(req.body.name || '').trim() || 'New Group',
    String(ownerId),
    String(req.body.coachEnabled || 'none'),
  );
  res.json({ groupId });
});

app.post('/groups/add-member',
  APIGateway.rateLimit(120, 10 * 60_000, 'groups-add-member'),
  APIGateway.validateSchema({
  groupId: { required: true, type: 'number', integer: true, min: 1 },
  userId: { type: 'number', integer: true, min: 1 },
  username: { type: 'string', minLength: 1, maxLength: 40 },
}),
  async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.body.groupId);

  if (!isGroupOwner(groupId, authUserId)) {
    return res.status(403).json({ error: 'Only group owner can add members' });
  }

  let userId = toOptionalInt(req.body.userId);
  if (!userId && req.body.username) {
    const user = getDB().prepare('SELECT id FROM users WHERE lower(username) = ?').get(String(req.body.username).trim().toLowerCase()) as any;
    userId = user?.id;
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId or username is required' });
  }

  await GroupService.addMember(String(groupId), String(userId));
  res.json({ success: true });
});

app.post('/groups/remove-member',
  APIGateway.rateLimit(120, 10 * 60_000, 'groups-remove-member'),
  APIGateway.validateSchema({
  groupId: { required: true, type: 'number', integer: true, min: 1 },
  userId: { type: 'number', integer: true, min: 1 },
  username: { type: 'string', minLength: 1, maxLength: 40 },
}),
  async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.body.groupId);

  if (!isGroupMember(groupId, authUserId)) {
    return res.status(403).json({ error: 'Forbidden group scope' });
  }

  let userId = toOptionalInt(req.body.userId);
  if (!userId && req.body.username) {
    const user = getDB().prepare('SELECT id FROM users WHERE lower(username) = ?').get(String(req.body.username).trim().toLowerCase()) as any;
    userId = user?.id;
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId or username is required' });
  }

  const memberRow = getDB().prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId) as any;
  if (!memberRow) {
    return res.status(404).json({ error: 'Member not found in this group' });
  }

  const authIsOwner = isGroupOwner(groupId, authUserId);
  const removingSelf = authUserId === userId;
  if (!authIsOwner && !removingSelf) {
    return res.status(403).json({ error: 'Only owner can remove other members' });
  }

  if (memberRow.role === 'owner') {
    return res.status(400).json({ error: 'Owner membership cannot be removed' });
  }

  await GroupService.removeMember(String(groupId), String(userId));
  res.json({ success: true });
});

app.get('/groups/:groupId/members', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const groupId = toUserId(req.params.groupId);

  if (!isGroupMember(groupId, authUserId)) {
    return res.status(403).json({ error: 'Forbidden group scope' });
  }

  const members = (await GroupService.getMembers(req.params.groupId)).map((row: any) => ({
    ...row,
    avatar_url: mediaUrlForClient(req, row.avatar_url),
  }));
  res.json({ members });
});

app.get('/groups/user/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const groups = await GroupService.getGroups(req.params.userId);
  res.json({ groups });
});

app.get('/profile/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const db = getDB();
  const user = db
    .prepare('SELECT id, username, avatar_url, background_url, bio, fitness_goal, hobbies, selected_coach, timezone FROM users WHERE id = ?')
    .get(req.params.userId) as any;

  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    ...user,
    avatar_url: mediaUrlForClient(req, user.avatar_url),
    background_url: mediaUrlForClient(req, user.background_url),
  });
});

app.get('/profile/public/:userId', async (req, res) => {
  const authUserId = assertAuthUser(req);
  const targetUserId = toUserId(req.params.userId);
  const db = getDB();

  const user = db
    .prepare('SELECT id, username, avatar_url, background_url, bio, fitness_goal, hobbies, selected_coach, timezone FROM users WHERE id = ?')
    .get(targetUserId) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const fullAccess = authUserId === targetUserId || isFriend(authUserId, targetUserId);
  const avatarAsset = user.avatar_url ? mediaAssetService.getByStorageValue(user.avatar_url) : null;
  const backgroundAsset = user.background_url ? mediaAssetService.getByStorageValue(user.background_url) : null;
  if (!fullAccess) {
    const recentPublicPosts = db.prepare(`
      SELECT p.id, p.user_id, p.type, p.content, p.media_urls, p.created_at, p.visibility,
        (SELECT COUNT(1) FROM post_reactions pr WHERE pr.post_id = p.id) AS reaction_count
      FROM posts p
      WHERE p.user_id = ? AND p.visibility = 'public'
      ORDER BY p.created_at DESC
      LIMIT 16
    `).all(targetUserId).map((post: any) => ({
      id: Number(post.id),
      user_id: Number(post.user_id),
      type: String(post.type || 'text'),
      visibility: normalizePostVisibility(post.visibility, 'public'),
      content: post.content || null,
      media_urls: mediaUrlsForClient(req, parseStringArrayJson(post.media_urls)),
      reaction_count: Number(post.reaction_count || 0),
      created_at: String(post.created_at),
    }));

    return res.json({
      visibility: 'limited',
      isFriend: false,
      profile: {
        id: user.id,
        username: user.username,
        avatar_url: avatarAsset?.visibility === 'public' ? mediaUrlForClient(req, user.avatar_url) : null,
        background_url: backgroundAsset?.visibility === 'public' ? mediaUrlForClient(req, user.background_url) : null,
        bio: null,
        fitness_goal: null,
        hobbies: null,
        selected_coach: user.selected_coach === 'lc' || user.selected_coach === 'zj' ? user.selected_coach : null,
        timezone: null,
      },
      today_health: null,
      recent_posts: recentPublicPosts,
    });
  }

  const today = new Date().toISOString().split('T')[0];
  const todayHealth = db
    .prepare('SELECT steps, calories_burned, active_minutes, synced_at FROM health_data WHERE user_id = ? AND date = ?')
    .get(targetUserId, today) as any;

  const recentPosts = db.prepare(`
    SELECT p.id, p.user_id, p.type, p.content, p.media_urls, p.created_at, p.visibility,
      (SELECT COUNT(1) FROM post_reactions pr WHERE pr.post_id = p.id) AS reaction_count
    FROM posts p
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
    LIMIT 16
  `).all(targetUserId).map((post: any) => ({
    id: Number(post.id),
    user_id: Number(post.user_id),
    type: String(post.type || 'text'),
    visibility: normalizePostVisibility(post.visibility, 'friends'),
    content: post.content || null,
    media_urls: mediaUrlsForClient(req, parseStringArrayJson(post.media_urls)),
    reaction_count: Number(post.reaction_count || 0),
    created_at: String(post.created_at),
  }));

  res.json({
    visibility: 'full',
    isFriend: authUserId === targetUserId ? true : isFriend(authUserId, targetUserId),
    profile: {
      ...user,
      avatar_url: mediaUrlForClient(req, user.avatar_url),
      background_url: mediaUrlForClient(req, user.background_url),
    },
    today_health: todayHealth
      ? {
          date: today,
          steps: Number(todayHealth.steps || 0),
          calories_burned: Number(todayHealth.calories_burned || 0),
          active_minutes: Number(todayHealth.active_minutes || 0),
          synced_at: String(todayHealth.synced_at || ''),
        }
      : null,
    recent_posts: recentPosts,
  });
});

app.post('/profile/update', requireSameUserIdFromBody('userId'), APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  avatar_url: { type: 'string', maxLength: 2048 },
  avatar_visibility: { type: 'string', minLength: 1, maxLength: 20 },
  background_url: { type: 'string', maxLength: 2048 },
  background_visibility: { type: 'string', minLength: 1, maxLength: 20 },
  bio: { type: 'string', maxLength: 1000 },
  fitness_goal: { type: 'string', maxLength: 200 },
  hobbies: { type: 'string', maxLength: 400 },
  timezone: { type: 'string', maxLength: 80 },
}), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.body.userId);
  const { avatar_url, avatar_visibility, background_url, background_visibility, bio, fitness_goal, hobbies, timezone } = req.body;
  const avatarVisibility = normalizeMediaVisibility(avatar_visibility, 'public');
  const backgroundVisibility = normalizeMediaVisibility(background_visibility, 'friends');
  const updates: string[] = [];
  const values: unknown[] = [];

  if (avatar_url !== undefined) {
    const normalized = String(avatar_url || '').trim();
    if (!normalized) {
      updates.push('avatar_url = ?');
      values.push(null);
    } else {
      const safe = normalizeMediaStorageValue(normalized);
      if (!safe) {
        return res.status(400).json({ error: 'Invalid avatar_url' });
      }
      updates.push('avatar_url = ?');
      values.push(safe.slice(0, 2048));
    }
  }
  if (background_url !== undefined) {
    const normalized = String(background_url || '').trim();
    if (!normalized) {
      updates.push('background_url = ?');
      values.push(null);
    } else {
      const safe = normalizeMediaStorageValue(normalized);
      if (!safe) {
        return res.status(400).json({ error: 'Invalid background_url' });
      }
      updates.push('background_url = ?');
      values.push(safe.slice(0, 2048));
    }
  }
  if (bio !== undefined) { updates.push('bio = ?'); values.push(String(bio).slice(0, 1000)); }
  if (fitness_goal !== undefined) { updates.push('fitness_goal = ?'); values.push(String(fitness_goal).slice(0, 200)); }
  if (hobbies !== undefined) { updates.push('hobbies = ?'); values.push(String(hobbies).slice(0, 400)); }
  if (timezone !== undefined) {
    const normalizedTimezone = String(timezone || '').trim();
    if (!normalizedTimezone) {
      return res.status(400).json({ error: 'timezone cannot be empty' });
    }
    if (!isValidTimeZone(normalizedTimezone)) {
      return res.status(400).json({ error: 'Invalid timezone format' });
    }
    updates.push('timezone = ?');
    values.push(normalizedTimezone.slice(0, 80));
  }

  if (updates.length > 0) {
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (timezone !== undefined) {
    await persistUserTimezone(userId, timezone);
  }

  if (avatar_url !== undefined) {
    const normalized = String(avatar_url || '').trim();
    const asset = normalized ? mediaAssetService.getByStorageValue(normalized) : null;
    await mediaAssetService.attachUserAsset(asset?.id || null, userId, 'user_avatar', avatarVisibility);
  }
  if (background_url !== undefined) {
    const normalized = String(background_url || '').trim();
    const asset = normalized ? mediaAssetService.getByStorageValue(normalized) : null;
    await mediaAssetService.attachUserAsset(asset?.id || null, userId, 'user_background', backgroundVisibility);
  }

  res.json({ success: true });
});

app.get('/coach/records/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.params.userId);
    const requestedDays = Number(req.query.days || 21);
    const maxDays = Number.isFinite(requestedDays)
      ? Math.min(120, Math.max(1, Math.floor(requestedDays)))
      : 21;

    const profile = await coachTypedToolsService.getProfile(String(userId));
    const { daily, changed } = await loadCoachDailyRecords(userId);

    if (changed) {
      await writeJsonAtomic(getCoachDailyPath(userId), daily);
    }

    const sortedDays = Object.keys(daily)
      .filter((day) => isValidDayKey(day))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, maxDays);

    const records = sortedDays.map((day) => {
      const bucket = daily[day];
      recomputeCoachDailyTotals(bucket);
      return {
        day,
        total_intake: bucket.total_intake,
        total_burned: bucket.total_burned,
        meals: bucket.meals,
        training: bucket.training,
      };
    });

    const mealCount = records.reduce((sum, day) => sum + day.meals.length, 0);
    const trainingCount = records.reduce((sum, day) => sum + day.training.length, 0);
    const selectedCoach = resolveSelectedCoachForUser(userId);

    res.json({
      selectedCoach,
      profile,
      records,
      stats: {
        days: records.length,
        mealCount,
        trainingCount,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to load coach records' });
  }
});

app.post('/coach/records/profile/update',
  requireSameUserIdFromBody('userId'),
  APIGateway.rateLimit(80, 10 * 60_000, 'coach-record-profile-update'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    height: { type: 'string', maxLength: 40 },
    height_cm: { type: 'number', min: 80, max: 260 },
    weight: { type: 'string', maxLength: 40 },
    weight_kg: { type: 'number', min: 20, max: 350 },
    age: { type: 'number', integer: true, min: 10, max: 100 },
    body_fat_pct: { type: 'number', min: 2, max: 70 },
    training_days: { type: 'number', integer: true, min: 1, max: 7 },
    gender: { type: 'string', maxLength: 40 },
    activity_level: { type: 'string', maxLength: 60 },
    goal: { type: 'string', maxLength: 120 },
    experience_level: { type: 'string', maxLength: 40 },
    notes: { type: 'string', maxLength: 2000 },
    timezone: { type: 'string', maxLength: 80 },
  }),
  async (req, res) => {
    try {
      const userId = toUserId(req.body.userId);
      const patch: Record<string, unknown> = {};
      const allowedKeys = [
        'height',
        'height_cm',
        'weight',
        'weight_kg',
        'age',
        'body_fat_pct',
        'training_days',
        'gender',
        'activity_level',
        'goal',
        'experience_level',
        'notes',
        'timezone',
      ] as const;

      for (const key of allowedKeys) {
        if (req.body[key] !== undefined) {
          patch[key] = req.body[key];
        }
      }

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No profile fields provided for update' });
      }

      if (patch.timezone !== undefined && !isValidTimeZone(String(patch.timezone || ''))) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }

      const next = await coachTypedToolsService.setProfile(String(userId), patch);
      trackSecurityEvent(req, 'coach_record_profile_updated', {
        userId,
        metadata: {
          keys: Object.keys(patch),
        },
      });

      res.json({ success: true, profile: next });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update coach profile' });
    }
  });

app.post('/coach/records/meal/update',
  requireSameUserIdFromBody('userId'),
  APIGateway.rateLimit(90, 10 * 60_000, 'coach-record-meal-update'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    day: { required: true, type: 'string', pattern: COACH_DAY_PATTERN },
    mealId: { required: true, type: 'string', pattern: COACH_RECORD_ID_PATTERN },
    description: { type: 'string', maxLength: COACH_RECORD_TEXT_MAX },
    calories: { type: 'number', min: 0, max: 4000 },
    protein_g: { type: 'number', min: 0, max: 500 },
    carbs_g: { type: 'number', min: 0, max: 500 },
    fat_g: { type: 'number', min: 0, max: 300 },
    time: { type: 'string', pattern: COACH_TIME_PATTERN },
    timezone: { type: 'string', maxLength: 80 },
    occurredAtUtc: { type: 'string', maxLength: 80 },
  }),
  async (req, res) => {
    try {
      const userId = toUserId(req.body.userId);
      const day = String(req.body.day || '').trim();
      const mealId = sanitizePlainText(req.body.mealId, 120);
      if (!isValidDayKey(day)) {
        return res.status(400).json({ error: 'Invalid day format' });
      }
      if (!COACH_RECORD_ID_PATTERN.test(mealId)) {
        return res.status(400).json({ error: 'Invalid mealId format' });
      }

      const nextTime = req.body.time !== undefined ? sanitizePlainText(req.body.time, 8) : undefined;
      if (nextTime !== undefined && !isValidTimeText(nextTime)) {
        return res.status(400).json({ error: 'Invalid time format; use HH:mm' });
      }

      const nextTimezone = req.body.timezone !== undefined ? sanitizePlainText(req.body.timezone, COACH_PROFILE_TEXT_MAX) : undefined;
      if (nextTimezone !== undefined && !isValidTimeZone(nextTimezone)) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }

      if (req.body.description !== undefined) {
        assertNoIngestionPayload(req, userId, 'description', req.body.description);
      }

      const { daily, changed } = await loadCoachDailyRecords(userId);
      const bucket = daily[day];
      if (!bucket) {
        return res.status(404).json({ error: 'Day record not found' });
      }

      const target = bucket.meals.find((meal) => String(meal.id || '') === mealId);
      if (!target) {
        return res.status(404).json({ error: 'Meal record not found' });
      }

      if (req.body.description !== undefined) target.description = sanitizePlainText(req.body.description, COACH_RECORD_TEXT_MAX);
      if (req.body.calories !== undefined) target.calories = roundTo2(req.body.calories);
      if (req.body.protein_g !== undefined) target.protein_g = roundTo2(req.body.protein_g);
      if (req.body.carbs_g !== undefined) target.carbs_g = roundTo2(req.body.carbs_g);
      if (req.body.fat_g !== undefined) target.fat_g = roundTo2(req.body.fat_g);
      if (nextTime !== undefined) target.time = nextTime;
      if (nextTimezone !== undefined) target.timezone = nextTimezone;
      if (req.body.occurredAtUtc !== undefined) target.occurred_at_utc = parseOccurredAtUtc(req.body.occurredAtUtc);

      recomputeCoachDailyTotals(bucket);
      await writeJsonAtomic(getCoachDailyPath(userId), daily);

      trackSecurityEvent(req, 'coach_record_meal_updated', {
        userId,
        metadata: {
          day,
          mealId,
          hadBackfillChange: changed,
        },
      });

      res.json({
        success: true,
        day,
        meal: target,
        total_intake: bucket.total_intake,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update meal record' });
    }
  });

app.post('/coach/records/training/update',
  requireSameUserIdFromBody('userId'),
  APIGateway.rateLimit(90, 10 * 60_000, 'coach-record-training-update'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    day: { required: true, type: 'string', pattern: COACH_DAY_PATTERN },
    trainingId: { required: true, type: 'string', pattern: COACH_RECORD_ID_PATTERN },
    name: { type: 'string', maxLength: 120 },
    sets: { type: 'number', integer: true, min: 0, max: 60 },
    reps: { type: 'string', maxLength: 20, pattern: /^[0-9xX+\-\s]{1,20}$/ },
    weight_kg: { type: 'number', min: 0, max: 500 },
    notes: { type: 'string', maxLength: COACH_RECORD_TEXT_MAX },
    time: { type: 'string', pattern: COACH_TIME_PATTERN },
    timezone: { type: 'string', maxLength: 80 },
    occurredAtUtc: { type: 'string', maxLength: 80 },
  }),
  async (req, res) => {
    try {
      const userId = toUserId(req.body.userId);
      const day = String(req.body.day || '').trim();
      const trainingId = sanitizePlainText(req.body.trainingId, 120);
      if (!isValidDayKey(day)) {
        return res.status(400).json({ error: 'Invalid day format' });
      }
      if (!COACH_RECORD_ID_PATTERN.test(trainingId)) {
        return res.status(400).json({ error: 'Invalid trainingId format' });
      }

      const nextTime = req.body.time !== undefined ? sanitizePlainText(req.body.time, 8) : undefined;
      if (nextTime !== undefined && !isValidTimeText(nextTime)) {
        return res.status(400).json({ error: 'Invalid time format; use HH:mm' });
      }

      const nextTimezone = req.body.timezone !== undefined ? sanitizePlainText(req.body.timezone, COACH_PROFILE_TEXT_MAX) : undefined;
      if (nextTimezone !== undefined && !isValidTimeZone(nextTimezone)) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }

      if (req.body.name !== undefined) {
        assertNoIngestionPayload(req, userId, 'name', req.body.name);
      }
      if (req.body.notes !== undefined) {
        assertNoIngestionPayload(req, userId, 'notes', req.body.notes);
      }

      const { daily, changed } = await loadCoachDailyRecords(userId);
      const bucket = daily[day];
      if (!bucket) {
        return res.status(404).json({ error: 'Day record not found' });
      }

      const target = bucket.training.find((entry) => String(entry.id || '') === trainingId);
      if (!target) {
        return res.status(404).json({ error: 'Training record not found' });
      }

      if (req.body.name !== undefined) target.name = sanitizePlainText(req.body.name, 120);
      if (req.body.sets !== undefined) target.sets = Math.max(0, Math.min(60, Math.floor(Number(req.body.sets || 0))));
      if (req.body.reps !== undefined) target.reps = sanitizePlainText(req.body.reps, 20);
      if (req.body.weight_kg !== undefined) target.weight_kg = roundTo2(req.body.weight_kg);
      if (req.body.notes !== undefined) target.notes = sanitizePlainText(req.body.notes, COACH_RECORD_TEXT_MAX);
      if (nextTime !== undefined) target.time = nextTime;
      if (nextTimezone !== undefined) target.timezone = nextTimezone;
      if (req.body.occurredAtUtc !== undefined) target.occurred_at_utc = parseOccurredAtUtc(req.body.occurredAtUtc);

      recomputeCoachDailyTotals(bucket);
      await writeJsonAtomic(getCoachDailyPath(userId), daily);

      trackSecurityEvent(req, 'coach_record_training_updated', {
        userId,
        metadata: {
          day,
          trainingId,
          hadBackfillChange: changed,
        },
      });

      res.json({
        success: true,
        day,
        training: target,
        total_burned: bucket.total_burned,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update training record' });
    }
  });

app.get('/coach/training-plan/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  try {
    const userId = toUserId(req.params.userId);
    const day = String(req.query.day || '').trim() || undefined;
    const timezone = String(req.query.timezone || '').trim() || undefined;
    const result = await coachTypedToolsService.getTrainingPlan(String(userId), { day, timezone });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to load training plan' });
  }
});

app.post('/coach/training-plan/toggle',
  requireSameUserIdFromBody('userId'),
  APIGateway.rateLimit(90, 10 * 60_000, 'coach-training-plan-toggle'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    day: { required: true, type: 'string', pattern: COACH_DAY_PATTERN },
    exerciseId: { required: true, type: 'string', pattern: COACH_RECORD_ID_PATTERN },
    completed: { required: true, type: 'boolean' },
    occurredAtUtc: { type: 'string', maxLength: 80 },
    timezone: { type: 'string', maxLength: 80 },
  }),
  async (req, res) => {
    try {
      const userId = toUserId(req.body.userId);
      const day = String(req.body.day || '').trim();
      const exerciseId = sanitizePlainText(req.body.exerciseId, 120);
      const timezone = req.body.timezone !== undefined ? sanitizePlainText(req.body.timezone, COACH_PROFILE_TEXT_MAX) : undefined;
      if (!isValidDayKey(day)) {
        return res.status(400).json({ error: 'Invalid day format' });
      }
      if (!COACH_RECORD_ID_PATTERN.test(exerciseId)) {
        return res.status(400).json({ error: 'Invalid exerciseId format' });
      }
      if (timezone !== undefined && !isValidTimeZone(timezone)) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }

      const result = await coachTypedToolsService.toggleTrainingPlanExerciseCompletion(String(userId), {
        day,
        exerciseId,
        completed: Boolean(req.body.completed),
        occurredAt: req.body.occurredAtUtc,
        timezone,
      });

      trackSecurityEvent(req, 'coach_training_plan_toggled', {
        userId,
        metadata: {
          day,
          exerciseId,
          completed: Boolean(req.body.completed),
        },
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update training plan' });
    }
  });

app.post('/health/sync', requireSameUserIdFromBody('userId'), APIGateway.validateSchema({
  userId: { required: true, type: 'number', integer: true, min: 1 },
  steps: { type: 'number', integer: true, min: 0, max: 300000 },
  calories: { type: 'number', integer: true, min: 0, max: 20000 },
  activeMinutes: { type: 'number', integer: true, min: 0, max: 1440 },
}), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.body.userId);
  const steps = toOptionalInt(req.body.steps) || 0;
  const calories = toOptionalInt(req.body.calories) || 0;
  const activeMinutes = toOptionalInt(req.body.activeMinutes) || 0;
  const today = new Date().toISOString().split('T')[0];

  db.prepare('INSERT OR REPLACE INTO health_data (user_id, date, steps, calories_burned, active_minutes) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    today,
    steps,
    calories,
    activeMinutes,
  );
  res.json({ success: true });
});

app.get('/health/leaderboard/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.params.userId);
  const friends = db.prepare(`
    SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
    UNION
    SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
  `).all(userId, userId).map((r: any) => Number(r.friend_id || r.user_id));

  const allUsers = Array.from(new Set([userId, ...friends]));
  const today = new Date().toISOString().split('T')[0];

  if (allUsers.length === 0) {
    return res.json({ leaderboard: [] });
  }

  const placeholders = allUsers.map(() => '?').join(',');
  const leaderboard = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, h.steps, h.calories_burned
    FROM users u
    LEFT JOIN health_data h ON u.id = h.user_id AND h.date = ?
    WHERE u.id IN (${placeholders})
    ORDER BY COALESCE(h.steps, 0) DESC
  `).all(today, ...allUsers).map((row: any) => ({
    ...row,
    avatar_url: mediaUrlForClient(req, row.avatar_url),
  }));

  res.json({ leaderboard });
});

app.get('/health/momentum/:userId', requireSameUserIdFromParam('userId'), async (req, res) => {
  const db = getDB();
  const userId = toUserId(req.params.userId);
  const dayWindow = 7;
  const dates = Array.from({ length: dayWindow }, (_, idx) => isoDateDaysAgo(dayWindow - 1 - idx));
  const placeholders = dates.map(() => '?').join(',');

  const rows = db.prepare(`
    SELECT date, steps, calories_burned, active_minutes
    FROM health_data
    WHERE user_id = ? AND date IN (${placeholders})
  `).all(userId, ...dates) as Array<{
    date: string;
    steps: number | null;
    calories_burned: number | null;
    active_minutes: number | null;
  }>;

  const byDate = new Map(rows.map((row) => [String(row.date), row]));
  const last7Days = dates.map((date) => {
    const row = byDate.get(date);
    const steps = Number(row?.steps || 0);
    const caloriesBurned = Number(row?.calories_burned || 0);
    const activeMinutes = Number(row?.active_minutes || 0);
    return {
      date,
      steps,
      calories_burned: caloriesBurned,
      active_minutes: activeMinutes,
      score: healthScore(steps, caloriesBurned, activeMinutes),
    };
  });

  const totals = last7Days.reduce(
    (acc, day) => {
      acc.steps += day.steps;
      acc.calories_burned += day.calories_burned;
      acc.active_minutes += day.active_minutes;
      return acc;
    },
    { steps: 0, calories_burned: 0, active_minutes: 0 },
  );

  const averages = {
    steps: Math.round(totals.steps / dayWindow),
    calories_burned: Math.round(totals.calories_burned / dayWindow),
    active_minutes: Math.round(totals.active_minutes / dayWindow),
  };

  const activityDays = last7Days.filter((day) => day.steps > 0 || day.calories_burned > 0 || day.active_minutes > 0).length;

  let streakDays = 0;
  for (let idx = last7Days.length - 1; idx >= 0; idx -= 1) {
    const day = last7Days[idx];
    if (day.steps <= 0 && day.calories_burned <= 0 && day.active_minutes <= 0) {
      break;
    }
    streakDays += 1;
  }

  const previousWindow = last7Days.slice(0, 3);
  const recentWindow = last7Days.slice(-3);
  const previousScore = previousWindow.reduce((sum, day) => sum + day.score, 0) / Math.max(1, previousWindow.length);
  const recentScore = recentWindow.reduce((sum, day) => sum + day.score, 0) / Math.max(1, recentWindow.length);
  const trendDelta = Math.round(recentScore - previousScore);
  const trendDirection = trendDelta > 30 ? 'up' : trendDelta < -30 ? 'down' : 'flat';

  const bestDay = last7Days.reduce((best, day) => {
    if (!best) return day;
    return day.score > best.score ? day : best;
  }, null as (typeof last7Days)[number] | null);

  res.json({
    today: last7Days[last7Days.length - 1] || null,
    last7Days,
    totals,
    averages,
    activityDays,
    streakDays,
    trend: {
      direction: trendDirection,
      delta: trendDelta,
    },
    bestDay: bestDay && bestDay.score > 0 ? bestDay : null,
  });
});

app.post('/fitness/analyze-food',
  APIGateway.rateLimit(40, 10 * 60_000, 'fitness-analyze-food'),
  APIGateway.validateSchema({
    imagePath: { required: true, type: 'string', minLength: 1, maxLength: 2048 },
  }),
  async (req, res) => {
  try {
    const result = await FitnessSkills.analyzeFood(String(req.body.imagePath || ''));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/fitness/workout-plan',
  APIGateway.rateLimit(40, 10 * 60_000, 'fitness-workout-plan'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    goal: { type: 'string', minLength: 1, maxLength: 40 },
  }),
  async (req, res) => {
  try {
    const result = await FitnessSkills.generateWorkoutPlan(toUserId(req.body.userId), String(req.body.goal || 'maintain'));
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/chat',
  APIGateway.rateLimit(80, 10 * 60_000, 'coach-chat'),
  APIGateway.validateSchema({
    message: { type: 'string', maxLength: 8000 },
    mediaUrls: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 2048 },
    mediaIds: { type: 'array', maxItems: 5, itemType: 'string', maxItemLength: 128 },
  }),
  async (req, res) => {
  try {
    const userId = String(assertAuthUser(req));
    const message = String(req.body.message || '').trim().slice(0, 8000);
    const mediaUrls = sanitizeMediaUrls(req.body.mediaUrls, 5);
    const mediaIds = sanitizeMediaIds(req.body.mediaIds, 5);
    const resolvedMediaUrls = mediaUrls.length > 0 ? mediaUrls : mediaPathsForAssetIds(mediaIds);

    if (!message && resolvedMediaUrls.length === 0 && mediaIds.length === 0) {
      return res.status(400).json({ error: 'Message or media is required' });
    }

    const normalizedMessage = message || 'Please analyze attached media and summarize key observations and practical guidance.';
    const deliveredMediaUrls = mediaUrlsForClient(req, resolvedMediaUrls);

    const response = await CoachService.chat(userId, normalizedMessage, {
      mediaUrls: deliveredMediaUrls,
      mediaIds,
      platform: 'web',
      conversationScope: 'coach_dm',
      allowWriteTools: true,
    });
    res.json({ response });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.post('/messages/open-dm',
  APIGateway.rateLimit(120, 10 * 60_000, 'messages-open-dm'),
  requireSameUserIdFromBody('userId'),
  APIGateway.validateSchema({
    userId: { required: true, type: 'number', integer: true, min: 1 },
    otherUserId: { required: true, type: 'number', integer: true, min: 1 },
  }),
  (req, res) => {
  try {
    const userId = toUserId(req.body.userId);
    const otherUserId = toUserId(req.body.otherUserId);

    if (userId === otherUserId) {
      return res.status(400).json({ error: 'Cannot DM yourself' });
    }

    const otherUser = getDB().prepare('SELECT id FROM users WHERE id = ?').get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const topic = buildP2PTopic(userId, otherUserId);
    res.json({ topic });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export function startAPI(port: number) {
  app.listen(port, () => console.log(`API on ${port}`));
}
