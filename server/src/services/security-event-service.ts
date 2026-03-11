import { getDB } from '../database/sqlite-db.js';

export type SecurityEventSeverity = 'info' | 'warn' | 'high';

export interface SecurityEvent {
  id: number;
  user_id: number | null;
  session_id: string | null;
  event_type: string;
  severity: SecurityEventSeverity;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SecurityEventInput {
  userId?: number | null;
  sessionId?: string | null;
  eventType: string;
  severity?: SecurityEventSeverity;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

function normalizeNullableString(value: unknown, maxLength: number): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeEventType(eventType: unknown): string {
  const text = String(eventType || '').trim().toLowerCase().slice(0, 80);
  if (!/^[a-z0-9_.-]{3,80}$/.test(text)) {
    throw new Error('Invalid event type');
  }
  return text;
}

function normalizeSeverity(severity: unknown): SecurityEventSeverity {
  if (severity === 'warn' || severity === 'high') {
    return severity;
  }
  return 'info';
}

function normalizeUserId(userId: unknown): number | null {
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function safeSerializeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  try {
    const json = JSON.stringify(metadata);
    return json.length > 8_000 ? json.slice(0, 8_000) : json;
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

export class SecurityEventService {
  static create(input: SecurityEventInput): number {
    const eventType = normalizeEventType(input.eventType);
    const severity = normalizeSeverity(input.severity);
    const userId = normalizeUserId(input.userId);
    const sessionId = normalizeNullableString(input.sessionId, 128);
    const ipAddress = normalizeNullableString(input.ipAddress, 80);
    const userAgent = normalizeNullableString(input.userAgent, 300);
    const metadata = safeSerializeMetadata(input.metadata);

    const result = getDB()
      .prepare(`
        INSERT INTO security_events (user_id, session_id, event_type, severity, ip_address, user_agent, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(userId, sessionId, eventType, severity, ipAddress, userAgent, metadata);

    return Number(result.lastInsertRowid);
  }

  static listForUser(userId: number, limit = 50): SecurityEvent[] {
    const safeUserId = normalizeUserId(userId);
    if (!safeUserId) return [];
    const safeLimit = Math.min(120, Math.max(1, Math.floor(Number(limit) || 50)));

    const rows = getDB()
      .prepare(`
        SELECT id, user_id, session_id, event_type, severity, ip_address, user_agent, metadata, created_at
        FROM security_events
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
        LIMIT ?
      `)
      .all(safeUserId, safeLimit) as Array<{
      id: number;
      user_id: number | null;
      session_id: string | null;
      event_type: string;
      severity: SecurityEventSeverity;
      ip_address: string | null;
      user_agent: string | null;
      metadata: string | null;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: Number(row.id),
      user_id: row.user_id ? Number(row.user_id) : null,
      session_id: row.session_id || null,
      event_type: String(row.event_type || ''),
      severity: normalizeSeverity(row.severity),
      ip_address: row.ip_address || null,
      user_agent: row.user_agent || null,
      metadata: parseMetadata(row.metadata),
      created_at: String(row.created_at || ''),
    }));
  }
}
