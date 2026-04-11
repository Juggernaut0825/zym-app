import { getDB } from '../database/runtime-db.js';

export const SUPPORTED_COACH_IDS = ['zj', 'lc'] as const;

export type CoachId = (typeof SUPPORTED_COACH_IDS)[number];

export interface CoachCatalogEntry {
  id: CoachId;
  label: string;
  shortDescription: string;
}

export const COACH_CATALOG: CoachCatalogEntry[] = [
  {
    id: 'zj',
    label: 'ZJ Coach',
    shortDescription: 'Encouraging, supportive, and steady.',
  },
  {
    id: 'lc',
    label: 'LC Coach',
    shortDescription: 'Strict, direct, and accountability-focused.',
  },
];

export function normalizeCoachId(value: unknown): CoachId | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'zj' || normalized === 'lc') {
    return normalized;
  }
  return null;
}

function parseCoachIds(raw: unknown): CoachId[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeCoachId(item))
      .filter((item): item is CoachId => Boolean(item));
  }

  const text = String(raw || '').trim();
  if (!text) {
    return [];
  }

  if (text.startsWith('[')) {
    try {
      return parseCoachIds(JSON.parse(text));
    } catch {
      return [];
    }
  }

  const single = normalizeCoachId(text);
  if (single) {
    return [single];
  }

  return text
    .split(',')
    .map((item) => normalizeCoachId(item))
    .filter((item): item is CoachId => Boolean(item));
}

export function normalizeCoachIds(raw: unknown, preferred?: CoachId | null): CoachId[] {
  const deduped = Array.from(new Set(parseCoachIds(raw)));
  if (!preferred || !deduped.includes(preferred)) {
    return deduped;
  }
  return [preferred, ...deduped.filter((item) => item !== preferred)];
}

export function serializeCoachIds(raw: unknown, preferred?: CoachId | null): string | null {
  const normalized = normalizeCoachIds(raw, preferred);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function topicToCoachId(topic: string): CoachId | null {
  const normalized = String(topic || '').trim();
  if (!normalized) return null;
  if (/^coach_lc_\d+$/.test(normalized)) return 'lc';
  if (/^coach_(?:zj_)?\d+$/.test(normalized)) return 'zj';
  return null;
}

function inferEnabledCoachesFromHistory(userId: number, preferred?: CoachId | null): CoachId[] {
  const db = getDB();
  const legacyTopic = `coach_${userId}`;
  const zjTopic = `coach_zj_${userId}`;
  const lcTopic = `coach_lc_${userId}`;

  const messageRows = db.prepare(`
    SELECT topic, MAX(created_at) AS last_message_at
    FROM messages
    WHERE topic IN (?, ?, ?)
    GROUP BY topic
    ORDER BY last_message_at DESC, topic DESC
  `).all(legacyTopic, zjTopic, lcTopic) as Array<{ topic?: string | null }>;

  const outreachRows = db.prepare(`
    SELECT coach_id
    FROM coach_outreach_events
    WHERE user_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 8
  `).all(userId) as Array<{ coach_id?: string | null }>;

  return normalizeCoachIds([
    preferred,
    ...messageRows.map((row) => topicToCoachId(String(row?.topic || ''))),
    ...outreachRows.map((row) => normalizeCoachId(row?.coach_id)),
  ], preferred);
}

export function resolveEnabledCoachesForUser(userId: number): CoachId[] {
  const db = getDB();
  const row = db
    .prepare('SELECT selected_coach, enabled_coaches FROM users WHERE id = ?')
    .get(userId) as { selected_coach?: string | null; enabled_coaches?: string | null } | undefined;

  const selected = normalizeCoachId(row?.selected_coach);
  const persisted = normalizeCoachIds(row?.enabled_coaches, selected);
  if (persisted.length > 0) {
    return persisted;
  }

  const inferred = inferEnabledCoachesFromHistory(userId, selected);
  if (inferred.length > 0) {
    db.prepare('UPDATE users SET enabled_coaches = ?, selected_coach = ? WHERE id = ?')
      .run(serializeCoachIds(inferred, selected || inferred[0]), selected || inferred[0], userId);
  }
  return inferred;
}

export function resolveSelectedCoachForUser(userId: number): CoachId | null {
  const db = getDB();
  const row = db
    .prepare('SELECT selected_coach, enabled_coaches FROM users WHERE id = ?')
    .get(userId) as { selected_coach?: string | null; enabled_coaches?: string | null } | undefined;

  const selected = normalizeCoachId(row?.selected_coach);
  const enabled = normalizeCoachIds(row?.enabled_coaches, selected);

  if (selected) {
    if (!enabled.includes(selected)) {
      db.prepare('UPDATE users SET enabled_coaches = ? WHERE id = ?')
        .run(serializeCoachIds([selected, ...enabled], selected), userId);
    }
    return selected;
  }

  if (enabled.length > 0) {
    db.prepare('UPDATE users SET selected_coach = ? WHERE id = ?').run(enabled[0], userId);
    return enabled[0];
  }

  const inferred = inferEnabledCoachesFromHistory(userId);
  if (inferred.length > 0) {
    db.prepare('UPDATE users SET enabled_coaches = ?, selected_coach = ? WHERE id = ?')
      .run(serializeCoachIds(inferred, inferred[0]), inferred[0], userId);
    return inferred[0];
  }

  return null;
}

export function persistEnabledCoachesForUser(
  userId: number,
  raw: unknown,
  preferred?: CoachId | null,
): CoachId[] {
  const normalized = normalizeCoachIds(raw, preferred);
  const selected = preferred && normalized.includes(preferred)
    ? preferred
    : normalized[0] || null;

  getDB()
    .prepare('UPDATE users SET enabled_coaches = ?, selected_coach = ? WHERE id = ?')
    .run(serializeCoachIds(normalized, selected), selected, userId);

  return normalized;
}

export function enableCoachForUser(userId: number, coachId: CoachId, preferred = false): CoachId[] {
  const selected = preferred ? coachId : (resolveSelectedCoachForUser(userId) || coachId);
  const current = resolveEnabledCoachesForUser(userId);
  return persistEnabledCoachesForUser(userId, [...current, coachId], selected);
}

export function coachDisplayName(coachId: CoachId): string {
  return coachId === 'lc' ? 'LC Coach' : 'ZJ Coach';
}
