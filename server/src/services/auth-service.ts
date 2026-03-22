import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getDB } from '../database/runtime-db.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
if (!configuredJwtSecret && isProduction) {
  throw new Error('[auth] JWT_SECRET must be set in production.');
}
const JWT_SECRET = configuredJwtSecret || crypto.randomBytes(32).toString('hex');
if (!configuredJwtSecret) {
  console.warn('[auth] JWT_SECRET is not set; using ephemeral secret for this runtime. Set JWT_SECRET in production.');
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

const ACCESS_TOKEN_TTL_SECONDS = clampNumber(process.env.ACCESS_TOKEN_TTL_SECONDS, 300, 24 * 60 * 60, 12 * 60 * 60);
const SESSION_TTL_SECONDS = clampNumber(process.env.SESSION_TTL_SECONDS, 24 * 60 * 60, 365 * 24 * 60 * 60, 90 * 24 * 60 * 60);
const MAX_ACTIVE_SESSIONS_PER_USER = clampNumber(process.env.MAX_ACTIVE_SESSIONS_PER_USER, 1, 24, 8);
const SESSION_CLEANUP_INTERVAL_SECONDS = clampNumber(process.env.SESSION_CLEANUP_INTERVAL_SECONDS, 60, 24 * 60 * 60, 15 * 60);
const REVOKED_SESSION_RETENTION_DAYS = clampNumber(process.env.REVOKED_SESSION_RETENTION_DAYS, 1, 365, 30);
let lastSessionCleanupAt = 0;

interface AuthTokenPayload {
  userId: string | number;
  sid: string;
}

function createAccessToken(userId: number, sessionId: string): string {
  return jwt.sign(
    { userId, sid: sessionId },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s` },
  );
}

function createRefreshToken(): string {
  return `rt_${crypto.randomBytes(48).toString('base64url')}`;
}

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

function createSessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

function runSessionCleanupIfNeeded(force = false): number {
  const now = Date.now();
  if (!force && now - lastSessionCleanupAt < SESSION_CLEANUP_INTERVAL_SECONDS * 1000) {
    return 0;
  }
  lastSessionCleanupAt = now;
  return getDB()
    .prepare(`
      DELETE FROM user_sessions
      WHERE datetime(expires_at) <= datetime('now')
         OR (revoked_at IS NOT NULL AND datetime(revoked_at) < datetime('now', '-' || ? || ' days'))
    `)
    .run(REVOKED_SESSION_RETENTION_DAYS).changes;
}

export class AuthService {
  static async register(username: string, email: string, password: string) {
    const hash = await bcrypt.hash(password, 10);
    const normalizedEmail = String(email || '').trim().toLowerCase() || null;
    const result = getDB()
      .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
      .run(username, normalizedEmail, hash);
    return result.lastInsertRowid;
  }

  static async login(
    username: string,
    password: string,
    context: { deviceName?: string; ipAddress?: string } = {},
  ) {
    runSessionCleanupIfNeeded();
    const user = getDB().prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as any;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
    const sessionId = crypto.randomUUID();
    const expiresAt = createSessionExpiryIso();
    const refreshToken = createRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const safeDeviceName = String(context.deviceName || '').trim().slice(0, 120) || null;
    const safeIpAddress = String(context.ipAddress || '').trim().slice(0, 80) || null;

    getDB()
      .prepare(`
        INSERT INTO user_sessions (user_id, session_id, device_name, ip_address, refresh_token_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(user.id, sessionId, safeDeviceName, safeIpAddress, refreshTokenHash, expiresAt);

    const activeSessions = getDB()
      .prepare(`
        SELECT session_id
        FROM user_sessions
        WHERE user_id = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
        ORDER BY datetime(last_seen_at) DESC, datetime(created_at) DESC
      `)
      .all(user.id) as Array<{ session_id: string }>;

    const overflow = activeSessions.slice(MAX_ACTIVE_SESSIONS_PER_USER);
    let revokedSessionIds: string[] = [];
    if (overflow.length > 0) {
      const placeholders = overflow.map(() => '?').join(', ');
      const revokeResult = getDB()
        .prepare(`
          UPDATE user_sessions
          SET revoked_at = CURRENT_TIMESTAMP, refresh_token_hash = NULL
          WHERE user_id = ? AND session_id IN (${placeholders}) AND revoked_at IS NULL
        `)
        .run(user.id, ...overflow.map((row) => row.session_id));
      if (revokeResult.changes > 0) {
        revokedSessionIds = overflow.map((row) => row.session_id);
        getDB()
          .prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?')
          .run(sessionId);
      }
    }

    const token = createAccessToken(user.id, sessionId);

    return {
      userId: user.id,
      token,
      refreshToken,
      sessionId,
      expiresAt,
      revokedSessionIds,
    };
  }

  static verifyToken(token: string): { userId: string; sid: string } | null {
    try {
      runSessionCleanupIfNeeded();
      const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      const userId = Number(payload.userId);
      const sessionId = String(payload.sid || '').trim();

      if (!Number.isInteger(userId) || userId <= 0 || !sessionId) {
        return null;
      }

      if (!this.isSessionActive(userId, sessionId)) {
        return null;
      }

      getDB()
        .prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?')
        .run(sessionId);

      return { userId: String(userId), sid: sessionId };
    } catch {
      return null;
    }
  }

  static isSessionActive(userId: number, sessionId: string): boolean {
    if (!Number.isInteger(userId) || userId <= 0) return false;
    const normalizedSessionId = String(sessionId || '').trim();
    if (!normalizedSessionId) return false;
    const row = getDB()
      .prepare(`
        SELECT session_id
        FROM user_sessions
        WHERE session_id = ?
          AND user_id = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
        LIMIT 1
      `)
      .get(normalizedSessionId, userId) as { session_id?: string } | undefined;
    return Boolean(row?.session_id);
  }

  static cleanupSessions(force = false): number {
    return runSessionCleanupIfNeeded(force);
  }

  static logoutToken(token: string): boolean {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
      const userId = Number(payload.userId);
      const sessionId = String(payload.sid || '').trim();
      if (!Number.isInteger(userId) || userId <= 0 || !sessionId) return false;
      const result = getDB()
        .prepare(`
          UPDATE user_sessions
          SET revoked_at = CURRENT_TIMESTAMP, refresh_token_hash = NULL
          WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL
        `)
        .run(userId, sessionId);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  static getSessions(userId: number) {
    runSessionCleanupIfNeeded();
    return getDB()
      .prepare(`
        SELECT session_id, device_name, ip_address, created_at, expires_at, revoked_at, last_seen_at
        FROM user_sessions
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
      `)
      .all(userId) as Array<{
        session_id: string;
        device_name: string | null;
        ip_address: string | null;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
        last_seen_at: string | null;
      }>;
  }

  static revokeSession(userId: number, sessionId: string): boolean {
    const result = getDB()
      .prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP, refresh_token_hash = NULL
        WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL
      `)
      .run(userId, sessionId);
    return result.changes > 0;
  }

  static revokeAllSessions(userId: number, exceptSessionId?: string) {
    if (exceptSessionId) {
      getDB()
        .prepare(`
          UPDATE user_sessions
          SET revoked_at = CURRENT_TIMESTAMP, refresh_token_hash = NULL
          WHERE user_id = ? AND session_id != ? AND revoked_at IS NULL
        `)
        .run(userId, exceptSessionId);
      return;
    }

    getDB()
      .prepare(`
        UPDATE user_sessions
        SET revoked_at = CURRENT_TIMESTAMP, refresh_token_hash = NULL
        WHERE user_id = ? AND revoked_at IS NULL
      `)
      .run(userId);
  }

  static refreshSession(
    refreshToken: string,
    context: { deviceName?: string; ipAddress?: string } = {},
  ): { userId: number; token: string; refreshToken: string; sessionId: string; expiresAt: string } | null {
    runSessionCleanupIfNeeded();
    const normalizedToken = String(refreshToken || '').trim();
    if (!normalizedToken || normalizedToken.length < 24) return null;

    const tokenHash = hashRefreshToken(normalizedToken);
    const row = getDB()
      .prepare(`
        SELECT user_id, session_id
        FROM user_sessions
        WHERE refresh_token_hash = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
        LIMIT 1
      `)
      .get(tokenHash) as { user_id?: number; session_id?: string } | undefined;

    const userId = Number(row?.user_id || 0);
    const sessionId = String(row?.session_id || '').trim();
    if (!Number.isInteger(userId) || userId <= 0 || !sessionId) return null;

    const nextRefreshToken = createRefreshToken();
    const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken);
    const nextSessionExpiry = createSessionExpiryIso();
    const safeDeviceName = String(context.deviceName || '').trim().slice(0, 120) || null;
    const safeIpAddress = String(context.ipAddress || '').trim().slice(0, 80) || null;

    const result = getDB()
      .prepare(`
        UPDATE user_sessions
        SET refresh_token_hash = ?,
            expires_at = ?,
            last_seen_at = CURRENT_TIMESTAMP,
            device_name = COALESCE(?, device_name),
            ip_address = COALESCE(?, ip_address)
        WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL
      `)
      .run(nextRefreshTokenHash, nextSessionExpiry, safeDeviceName, safeIpAddress, userId, sessionId);

    if (result.changes <= 0) return null;

    const token = createAccessToken(userId, sessionId);
    return {
      userId,
      token,
      refreshToken: nextRefreshToken,
      sessionId,
      expiresAt: nextSessionExpiry,
    };
  }

  static createFriendConnectToken(userId: number, ttlSeconds = 60): string {
    return jwt.sign(
      {
        typ: 'friend_connect',
        uid: userId,
      },
      JWT_SECRET,
      { expiresIn: `${Math.max(10, ttlSeconds)}s` },
    );
  }

  static verifyFriendConnectToken(token: string): number | null {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { typ?: string; uid?: number | string };
      if (payload.typ !== 'friend_connect') return null;
      const userId = Number(payload.uid);
      if (!Number.isInteger(userId) || userId <= 0) return null;
      return userId;
    } catch {
      return null;
    }
  }
}
