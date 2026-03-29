import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs/promises';
import { getDB } from '../database/runtime-db.js';
import { resolveUserDataDir } from '../utils/path-resolver.js';
import { googleAuthService } from './google-auth-service.js';

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
const EMAIL_VERIFICATION_TTL_SECONDS = clampNumber(process.env.EMAIL_VERIFICATION_TTL_SECONDS, 15 * 60, 7 * 24 * 60 * 60, 24 * 60 * 60);
const PASSWORD_RESET_TTL_SECONDS = clampNumber(process.env.PASSWORD_RESET_TTL_SECONDS, 15 * 60, 24 * 60 * 60, 60 * 60);
let lastSessionCleanupAt = 0;

type EmailActionType = 'verify_email' | 'reset_password';

interface AuthTokenPayload {
  userId: string | number;
  sid: string;
}

interface EmailActionLookupRow {
  user_id?: number;
  username?: string;
  email?: string | null;
  consumed_at?: string | null;
  expires_at?: string | null;
  email_verified_at?: string | null;
}

function normalizeEmail(email: unknown): string | null {
  return String(email || '').trim().toLowerCase() || null;
}

function normalizeLoginIdentifier(identifier: unknown): string {
  return String(identifier || '').trim().toLowerCase();
}

function isEmailVerified(value: unknown): boolean {
  return String(value || '').trim().length > 0;
}

function sanitizeUsernameSeed(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const sliced = normalized.slice(0, 32);
  if (sliced.length >= 3) {
    return sliced;
  }
  return `${sliced || 'zym'}user`.slice(0, 32);
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

function createEmailActionToken(tokenType: EmailActionType): string {
  const prefix = tokenType === 'verify_email' ? 'verify' : 'reset';
  return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

function hashEmailActionToken(token: string): string {
  return crypto.createHash('sha256').update(String(token || '').trim()).digest('hex');
}

function createSessionExpiryIso(): string {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

function createEmailActionExpiryIso(tokenType: EmailActionType): string {
  const ttlSeconds = tokenType === 'verify_email'
    ? EMAIL_VERIFICATION_TTL_SECONDS
    : PASSWORD_RESET_TTL_SECONDS;
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
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

export class EmailVerificationRequiredError extends Error {
  readonly email: string;

  constructor(email: string) {
    super('Please verify your email before signing in.');
    this.name = 'EmailVerificationRequiredError';
    this.email = email;
  }
}

export class AuthService {
  static async register(
    username: string,
    email: string,
    password: string,
    options?: {
      healthDisclaimerAccepted?: boolean;
      consentVersion?: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    },
  ) {
    const hash = await bcrypt.hash(password, 10);
    const normalizedEmail = normalizeEmail(email);
    const db = getDB();
    const result = db
      .prepare('INSERT INTO users (username, email, password_hash, selected_coach) VALUES (?, ?, ?, NULL)')
      .run(username, normalizedEmail, hash);

    const userId = Number(result.lastInsertRowid || 0);
    if (userId > 0 && options?.healthDisclaimerAccepted) {
      db.prepare(`
        INSERT OR IGNORE INTO user_consents (user_id, consent_type, version, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        userId,
        'health_disclaimer',
        String(options.consentVersion || '2026-03-26').slice(0, 40),
        String(options.ipAddress || '').slice(0, 120) || null,
        String(options.userAgent || '').slice(0, 500) || null,
      );
    }

    return result.lastInsertRowid;
  }

  static findUserByEmail(email: string) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;
    const user = getDB()
      .prepare('SELECT id, username, email, email_verified_at FROM users WHERE lower(email) = ? LIMIT 1')
      .get(normalizedEmail) as {
        id?: number;
        username?: string;
        email?: string | null;
        email_verified_at?: string | null;
      } | undefined;

    const userId = Number(user?.id || 0);
    const safeEmail = normalizeEmail(user?.email);
    if (!Number.isInteger(userId) || userId <= 0 || !safeEmail) return null;
    return {
      id: userId,
      username: String(user?.username || ''),
      email: safeEmail,
      emailVerifiedAt: String(user?.email_verified_at || '').trim() || null,
    };
  }

  static createEmailActionToken(userId: number, email: string, tokenType: EmailActionType): string {
    const normalizedEmail = normalizeEmail(email);
    if (!Number.isInteger(userId) || userId <= 0 || !normalizedEmail) {
      throw new Error('A valid user and email are required to create an auth email token.');
    }

    const rawToken = createEmailActionToken(tokenType);
    const tokenHash = hashEmailActionToken(rawToken);
    const expiresAt = createEmailActionExpiryIso(tokenType);

    getDB()
      .prepare(`
        UPDATE auth_email_tokens
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND token_type = ? AND consumed_at IS NULL
      `)
      .run(userId, tokenType);

    getDB()
      .prepare(`
        INSERT INTO auth_email_tokens (user_id, email, token_hash, token_type, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(userId, normalizedEmail, tokenHash, tokenType, expiresAt);

    return rawToken;
  }

  private static lookupEmailActionTokenRow(token: string, tokenType: EmailActionType): EmailActionLookupRow | null {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) return null;

    const row = getDB()
      .prepare(`
        SELECT t.user_id, t.email, t.consumed_at, t.expires_at, u.username, u.email_verified_at
        FROM auth_email_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
          AND t.token_type = ?
        LIMIT 1
      `)
      .get(hashEmailActionToken(normalizedToken), tokenType) as EmailActionLookupRow | undefined;

    return row || null;
  }

  private static lookupEmailActionToken(token: string, tokenType: EmailActionType): { userId: number; username: string; email: string } | null {
    const row = this.lookupEmailActionTokenRow(token, tokenType);
    if (!row) return null;

    if (String(row.consumed_at || '').trim()) return null;
    if (!String(row.expires_at || '').trim() || !String(row.email || '').trim()) return null;

    const expiresAt = new Date(String(row.expires_at));
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return null;
    }

    const userId = Number(row?.user_id || 0);
    const email = normalizeEmail(row?.email);
    if (!Number.isInteger(userId) || userId <= 0 || !email) return null;

    return {
      userId,
      username: String(row?.username || ''),
      email,
    };
  }

  static verifyEmailWithToken(token: string): { userId: number; username: string; email: string } | null {
    const row = this.lookupEmailActionTokenRow(token, 'verify_email');
    if (!row) return null;

    const userId = Number(row.user_id || 0);
    const email = normalizeEmail(row.email);
    if (!Number.isInteger(userId) || userId <= 0 || !email) return null;

    const match = {
      userId,
      username: String(row.username || ''),
      email,
    };

    if (isEmailVerified(row.email_verified_at)) {
      return match;
    }

    const expiresAt = new Date(String(row.expires_at || ''));
    const expired = !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();
    if (String(row.consumed_at || '').trim() || expired) {
      return null;
    }

    getDB()
      .prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?')
      .run(match.userId);

    getDB()
      .prepare(`
        UPDATE auth_email_tokens
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND token_type = 'verify_email' AND consumed_at IS NULL
      `)
      .run(match.userId);

    return match;
  }

  static async deleteAccount(userId: number): Promise<{ affectedFriendIds: number[] }> {
    const safeUserId = Number(userId);
    if (!Number.isInteger(safeUserId) || safeUserId <= 0) {
      throw new Error('A valid user is required to delete an account.');
    }

    const db = getDB();
    const affectedFriendIds = db.prepare(`
      SELECT DISTINCT CASE
        WHEN user_id = ? THEN friend_id
        ELSE user_id
      END AS friend_id
      FROM friendships
      WHERE user_id = ? OR friend_id = ?
    `).all(safeUserId, safeUserId, safeUserId)
      .map((row: any) => Number(row.friend_id || 0))
      .filter((value: number) => Number.isInteger(value) && value > 0 && value !== safeUserId);

    const coachTopicLegacy = `coach_${safeUserId}`;
    const coachTopicZj = `coach_zj_${safeUserId}`;
    const coachTopicLc = `coach_lc_${safeUserId}`;
    const p2pPrefix = `p2p_${safeUserId}_%`;
    const p2pSuffix = `p2p_%_${safeUserId}`;

    db.exec('BEGIN');
    try {
      db.prepare(`
        DELETE FROM mention_notifications
        WHERE source_type = 'post_comment'
          AND source_id IN (
            SELECT id
            FROM post_comments
            WHERE user_id = ?
               OR post_id IN (SELECT id FROM posts WHERE user_id = ?)
          )
      `).run(safeUserId, safeUserId);

      db.prepare(`
        DELETE FROM mention_notifications
        WHERE user_id = ?
           OR message_id IN (
             SELECT id
             FROM messages
             WHERE from_user_id = ?
                OR topic IN (?, ?, ?)
                OR topic LIKE ?
                OR topic LIKE ?
           )
      `).run(safeUserId, safeUserId, coachTopicLegacy, coachTopicZj, coachTopicLc, p2pPrefix, p2pSuffix);

      db.prepare(`
        DELETE FROM message_reads
        WHERE user_id = ?
           OR topic IN (?, ?, ?)
           OR topic LIKE ?
           OR topic LIKE ?
      `).run(safeUserId, coachTopicLegacy, coachTopicZj, coachTopicLc, p2pPrefix, p2pSuffix);

      db.prepare('DELETE FROM coach_outreach_events WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM security_events WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM abuse_reports WHERE reporter_user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM knowledge_ingestion_audit WHERE actor_user_id = ?').run(safeUserId);
      db.prepare(`
        DELETE FROM knowledge_ingestion_audit
        WHERE request_id IN (SELECT id FROM knowledge_ingestion_requests WHERE requester_user_id = ?)
      `).run(safeUserId);
      db.prepare(`
        UPDATE knowledge_ingestion_requests
        SET reviewed_by_user_id = NULL
        WHERE reviewed_by_user_id = ?
      `).run(safeUserId);
      db.prepare('DELETE FROM knowledge_ingestion_requests WHERE requester_user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM media_asset_attachments WHERE owner_user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM media_asset_attachments WHERE entity_type = \'post\' AND entity_id IN (SELECT id FROM posts WHERE user_id = ?)').run(safeUserId);
      db.prepare(`
        DELETE FROM media_asset_attachments
        WHERE entity_type = 'message'
          AND entity_id IN (
            SELECT id
            FROM messages
            WHERE from_user_id = ?
               OR topic IN (?, ?, ?)
               OR topic LIKE ?
               OR topic LIKE ?
          )
      `).run(safeUserId, coachTopicLegacy, coachTopicZj, coachTopicLc, p2pPrefix, p2pSuffix);
      db.prepare('DELETE FROM post_reactions WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM post_reactions WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').run(safeUserId);
      db.prepare('DELETE FROM post_comments WHERE post_id IN (SELECT id FROM posts WHERE user_id = ?)').run(safeUserId);
      db.prepare('DELETE FROM post_comments WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM posts WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM group_members WHERE group_id IN (SELECT id FROM groups WHERE owner_id = ?)').run(safeUserId);
      db.prepare('DELETE FROM group_members WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM groups WHERE owner_id = ?').run(safeUserId);
      db.prepare('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?').run(safeUserId, safeUserId);
      db.prepare('DELETE FROM friend_connect_codes WHERE user_id = ?').run(safeUserId);
      db.prepare(`
        DELETE FROM messages
        WHERE from_user_id = ?
           OR topic IN (?, ?, ?)
           OR topic LIKE ?
           OR topic LIKE ?
      `).run(safeUserId, coachTopicLegacy, coachTopicZj, coachTopicLc, p2pPrefix, p2pSuffix);
      db.prepare('DELETE FROM auth_email_tokens WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM user_consents WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM health_data WHERE user_id = ?').run(safeUserId);
      db.prepare('DELETE FROM users WHERE id = ?').run(safeUserId);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    await fs.rm(resolveUserDataDir(String(safeUserId)), { recursive: true, force: true }).catch(() => undefined);

    return {
      affectedFriendIds: Array.from(new Set(affectedFriendIds)),
    };
  }

  static async resetPasswordWithToken(token: string, nextPassword: string): Promise<{ userId: number; email: string } | null> {
    if (String(nextPassword || '').length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const match = this.lookupEmailActionToken(token, 'reset_password');
    if (!match) return null;

    const passwordHash = await bcrypt.hash(nextPassword, 10);
    getDB()
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(passwordHash, match.userId);

    getDB()
      .prepare(`
        UPDATE auth_email_tokens
        SET consumed_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND token_type = 'reset_password' AND consumed_at IS NULL
      `)
      .run(match.userId);

    this.revokeAllSessions(match.userId);
    return {
      userId: match.userId,
      email: match.email,
    };
  }

  static async login(
    identifier: string,
    password: string,
    context: { deviceName?: string; ipAddress?: string } = {},
  ) {
    runSessionCleanupIfNeeded();
    const normalizedIdentifier = normalizeLoginIdentifier(identifier);
    if (!normalizedIdentifier) return null;

    const user = getDB().prepare(`
      SELECT id, username, password_hash, email, email_verified_at
      FROM users
      WHERE lower(username) = ? OR lower(email) = ?
      LIMIT 1
    `).get(normalizedIdentifier, normalizedIdentifier) as any;

    if (!user?.password_hash || !(await bcrypt.compare(password, user.password_hash))) return null;
    const normalizedEmail = normalizeEmail(user.email);
    if (normalizedEmail && !isEmailVerified(user.email_verified_at)) {
      throw new EmailVerificationRequiredError(normalizedEmail);
    }
    return this.issueSessionForUser(Number(user.id || 0), context);
  }

  static async loginWithGoogle(
    idToken: string,
    context: {
      deviceName?: string;
      ipAddress?: string;
      healthDisclaimerAccepted?: boolean;
      consentVersion?: string;
      userAgent?: string | null;
    } = {},
  ) {
    const identity = await googleAuthService.verifyIdToken(idToken);
    if (!identity.emailVerified) {
      throw new Error('This Google account email is not verified.');
    }

    const db = getDB();
    let user = db.prepare(`
      SELECT id, username, email, email_verified_at, google_sub
      FROM users
      WHERE google_sub = ?
      LIMIT 1
    `).get(identity.sub) as any;

    if (!user) {
      user = db.prepare(`
        SELECT id, username, email, email_verified_at, google_sub
        FROM users
        WHERE lower(email) = ?
        LIMIT 1
      `).get(identity.email) as any;
    }

    if (!user) {
      if (!context.healthDisclaimerAccepted) {
        throw new Error('Please confirm the health disclaimer before continuing with Google.');
      }
      const username = this.generateUniqueUsername(identity.name || identity.email.split('@')[0] || 'zymuser');
      const result = db.prepare(`
        INSERT INTO users (username, email, password_hash, email_verified_at, selected_coach, google_sub)
        VALUES (?, ?, NULL, CURRENT_TIMESTAMP, NULL, ?)
      `).run(username, identity.email, identity.sub);
      const userId = Number(result.lastInsertRowid || 0);
      if (userId > 0) {
        db.prepare(`
          INSERT OR IGNORE INTO user_consents (user_id, consent_type, version, ip_address, user_agent)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          userId,
          'health_disclaimer',
          String(context.consentVersion || '2026-03-26').slice(0, 40),
          String(context.ipAddress || '').slice(0, 120) || null,
          String(context.userAgent || '').slice(0, 500) || null,
        );
      }
      user = db.prepare(`
        SELECT id, username, email, email_verified_at, google_sub
        FROM users
        WHERE id = ?
      `).get(userId) as any;
    } else {
      const updates: string[] = [];
      const params: unknown[] = [];

      if (!String(user.google_sub || '').trim()) {
        updates.push('google_sub = ?');
        params.push(identity.sub);
      }
      if (!normalizeEmail(user.email) && identity.email) {
        updates.push('email = ?');
        params.push(identity.email);
      }
      if (!isEmailVerified(user.email_verified_at)) {
        updates.push('email_verified_at = CURRENT_TIMESTAMP');
      }

      if (updates.length > 0) {
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, user.id);
      }
    }

    return this.issueSessionForUser(Number(user.id || 0), context);
  }

  private static generateUniqueUsername(seed: string): string {
    const base = sanitizeUsernameSeed(seed);
    const existing = getDB()
      .prepare('SELECT username FROM users WHERE lower(username) = ? LIMIT 1');

    if (!existing.get(base.toLowerCase())) {
      return base;
    }

    for (let attempt = 1; attempt <= 9999; attempt += 1) {
      const suffix = `_${attempt}`;
      const candidate = `${base.slice(0, Math.max(3, 32 - suffix.length))}${suffix}`;
      if (!existing.get(candidate.toLowerCase())) {
        return candidate;
      }
    }

    return `${base.slice(0, 24)}_${crypto.randomBytes(3).toString('hex')}`.slice(0, 32);
  }

  private static issueSessionForUser(
    userId: number,
    context: { deviceName?: string; ipAddress?: string } = {},
  ) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('A valid user is required to create a session.');
    }

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
      .run(userId, sessionId, safeDeviceName, safeIpAddress, refreshTokenHash, expiresAt);

    const activeSessions = getDB()
      .prepare(`
        SELECT session_id
        FROM user_sessions
        WHERE user_id = ?
          AND revoked_at IS NULL
          AND datetime(expires_at) > datetime('now')
        ORDER BY datetime(last_seen_at) DESC, datetime(created_at) DESC
      `)
      .all(userId) as Array<{ session_id: string }>;

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
        .run(userId, ...overflow.map((row) => row.session_id));
      if (revokeResult.changes > 0) {
        revokedSessionIds = overflow.map((row) => row.session_id);
        getDB()
          .prepare('UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = ?')
          .run(sessionId);
      }
    }

    const token = createAccessToken(userId, sessionId);

    return {
      userId,
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

  static createFriendConnectToken(userId: number, ttlSeconds = 120): string {
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
