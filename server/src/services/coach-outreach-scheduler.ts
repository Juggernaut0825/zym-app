import fs from 'fs/promises';
import path from 'path';
import { getDB } from '../database/runtime-db.js';
import { CoachService } from './coach-service.js';
import { MessageService, buildCoachTopic } from './message-service.js';
import { publishRealtimeEvent } from '../realtime/realtime-event-bus.js';
import { logger } from '../utils/logger.js';
import { formatProcessMemoryUsage } from '../utils/process-metrics.js';
import { resolveUserDataDir } from '../utils/path-resolver.js';

const DEFAULT_INTERVAL_MINUTES = 10;
const DEFAULT_NIGHTLY_HOUR = 20;
const DEFAULT_INACTIVITY_DAYS = 3;
const DEFAULT_ONBOARDING_DELAY_HOURS = 6;

interface OutreachUser {
  id: number;
  selected_coach?: 'zj' | 'lc' | null;
  timezone?: string | null;
  created_at?: string | null;
  email_verified_at?: string | null;
}

function normalizeTimezone(raw: unknown): string {
  const timezone = String(raw || '').trim();
  if (!timezone) {
    return String(process.env.DEFAULT_USER_TIMEZONE || 'UTC').trim() || 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return String(process.env.DEFAULT_USER_TIMEZONE || 'UTC').trim() || 'UTC';
  }
}

function localDateParts(date: Date, timezone: string): { day: string; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour || 0),
    minute: Number(parts.minute || 0),
  };
}

function parseIso(value: unknown): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function hoursSince(date: Date | null, now = new Date()): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return (now.getTime() - date.getTime()) / 3_600_000;
}

function daysSince(date: Date | null, now = new Date()): number {
  if (!date) return Number.POSITIVE_INFINITY;
  return (now.getTime() - date.getTime()) / 86_400_000;
}

async function readDailyRecord(userId: number): Promise<Record<string, any>> {
  const filePath = path.join(resolveUserDataDir(String(userId)), 'daily.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, any>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function latestTrainingDay(daily: Record<string, any>): string | null {
  return Object.keys(daily)
    .filter((day) => Array.isArray(daily[day]?.training) && daily[day].training.length > 0)
    .sort()
    .pop() || null;
}

export class CoachOutreachScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;

  constructor(intervalMinutes?: number) {
    const minutes = Number(intervalMinutes || process.env.COACH_OUTREACH_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
    const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES;
    this.intervalMs = Math.max(60_000, normalizedMinutes * 60_000);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    void this.runOnce();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce() {
    if (this.running) return;
    this.running = true;
    const startedAt = Date.now();
    let userCount = 0;
    let sentCount = 0;

    try {
      const rows = getDB()
        .prepare(`
          SELECT id, selected_coach, timezone, created_at, email_verified_at
          FROM users
          WHERE email_verified_at IS NOT NULL
          ORDER BY id ASC
        `)
        .all() as unknown as OutreachUser[];
      userCount = rows.length;

      for (const user of rows) {
        try {
          if (await this.processUser(user)) {
            sentCount += 1;
          }
        } catch (error) {
          logger.error(`[outreach] failed user=${user.id}`, error);
        }
      }
    } finally {
      this.running = false;
      logger.info(
        `[outreach] cycle users=${userCount} sent=${sentCount} elapsedMs=${Date.now() - startedAt} ${formatProcessMemoryUsage()}`,
      );
    }
  }

  private async processUser(user: OutreachUser): Promise<boolean> {
    const userId = Number(user.id || 0);
    if (!Number.isInteger(userId) || userId <= 0) return false;

    const coachId = user.selected_coach === 'lc'
      ? 'lc'
      : user.selected_coach === 'zj'
        ? 'zj'
        : null;
    if (!coachId) {
      return false;
    }
    const timezone = normalizeTimezone(user.timezone);
    const topic = buildCoachTopic(userId, coachId);
    const now = new Date();
    const localNow = localDateParts(now, timezone);

    if (this.alreadySentForLocalDay(userId, localNow.day)) {
      return false;
    }

    if (await this.maybeSendOnboarding(userId, coachId, timezone, topic, user.created_at, now)) {
      return true;
    }
    if (await this.maybeSendInactivity(userId, coachId, timezone, topic, localNow, now)) {
      return true;
    }
    return this.maybeSendNightlyCheckIn(userId, coachId, timezone, topic, localNow);
  }

  private alreadySentForLocalDay(userId: number, localDay: string): boolean {
    const row = getDB()
      .prepare(`
        SELECT 1
        FROM coach_outreach_events
        WHERE user_id = ? AND local_day = ?
        LIMIT 1
      `)
      .get(userId, localDay) as { 1?: number } | undefined;
    return Boolean(row);
  }

  private async maybeSendOnboarding(
    userId: number,
    coachId: 'zj' | 'lc',
    timezone: string,
    topic: string,
    createdAtRaw: unknown,
    now: Date,
  ): Promise<boolean> {
    const createdAt = parseIso(createdAtRaw);
    const ageHours = hoursSince(createdAt, now);
    if (ageHours < DEFAULT_ONBOARDING_DELAY_HOURS || ageHours > 72) {
      return false;
    }

    const existingMessage = getDB()
      .prepare('SELECT 1 FROM messages WHERE topic = ? LIMIT 1')
      .get(topic) as { 1?: number } | undefined;
    if (existingMessage) {
      return false;
    }

    const dedupeKey = `onboarding:${userId}`;
    const existingEvent = getDB()
      .prepare('SELECT 1 FROM coach_outreach_events WHERE dedupe_key = ? LIMIT 1')
      .get(dedupeKey) as { 1?: number } | undefined;
    if (existingEvent) {
      return false;
    }

    return this.sendOutreach({
      userId,
      coachId,
      timezone,
      topic,
      triggerType: 'onboarding',
      localDay: localDateParts(now, timezone).day,
      dedupeKey,
      instruction: 'Welcome the user to coaching, help them start the conversation, and ask one simple actionable check-in question about their current goal or training situation.',
    });
  }

  private async maybeSendInactivity(
    userId: number,
    coachId: 'zj' | 'lc',
    timezone: string,
    topic: string,
    localNow: { day: string; hour: number; minute: number },
    now: Date,
  ): Promise<boolean> {
    const latestUserMessage = getDB()
      .prepare(`
        SELECT created_at
        FROM messages
        WHERE topic = ? AND from_user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(topic, userId) as { created_at?: string | null } | undefined;

    const latestEvent = getDB()
      .prepare(`
        SELECT sent_at
        FROM coach_outreach_events
        WHERE user_id = ? AND trigger_type = 'inactivity'
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(userId) as { sent_at?: string | null } | undefined;

    if (daysSince(parseIso(latestEvent?.sent_at), now) < DEFAULT_INACTIVITY_DAYS) {
      return false;
    }

    if (daysSince(parseIso(latestUserMessage?.created_at), now) < DEFAULT_INACTIVITY_DAYS) {
      return false;
    }

    const daily = await readDailyRecord(userId);
    const latestTraining = latestTrainingDay(daily);
    if (latestTraining) {
      const latestTrainingDate = parseIso(`${latestTraining}T00:00:00.000Z`);
      if (daysSince(latestTrainingDate, now) < DEFAULT_INACTIVITY_DAYS) {
        return false;
      }
    }

    const dedupeKey = `inactivity:${userId}:${localNow.day}`;
    return this.sendOutreach({
      userId,
      coachId,
      timezone,
      topic,
      triggerType: 'inactivity',
      localDay: localNow.day,
      dedupeKey,
      instruction: 'The user has been quiet and has not logged recent training. Send one concise re-engagement check-in that feels supportive but not spammy. Focus on restarting momentum with one easy next step.',
    });
  }

  private async maybeSendNightlyCheckIn(
    userId: number,
    coachId: 'zj' | 'lc',
    timezone: string,
    topic: string,
    localNow: { day: string; hour: number; minute: number },
  ): Promise<boolean> {
    const nightlyHour = Number(process.env.COACH_NIGHTLY_CHECKIN_HOUR || DEFAULT_NIGHTLY_HOUR);
    if (localNow.hour !== nightlyHour || localNow.minute > 20) {
      return false;
    }

    const latestUserMessage = getDB()
      .prepare(`
        SELECT created_at
        FROM messages
        WHERE topic = ? AND from_user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(topic, userId) as { created_at?: string | null } | undefined;

    const latestCoachMessage = getDB()
      .prepare(`
        SELECT created_at
        FROM messages
        WHERE topic = ? AND from_user_id = 0
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(topic) as { created_at?: string | null } | undefined;

    if (localDateParts(parseIso(latestUserMessage?.created_at) || new Date(0), timezone).day === localNow.day) {
      return false;
    }
    if (localDateParts(parseIso(latestCoachMessage?.created_at) || new Date(0), timezone).day === localNow.day) {
      return false;
    }

    const dedupeKey = `nightly_checkin:${userId}:${localNow.day}`;
    return this.sendOutreach({
      userId,
      coachId,
      timezone,
      topic,
      triggerType: 'nightly_checkin',
      localDay: localNow.day,
      dedupeKey,
      instruction: 'Send a short nightly coaching check-in. Ask about how training, food, recovery, or consistency went today, and keep it easy to reply to.',
    });
  }

  private async sendOutreach(input: {
    userId: number;
    coachId: 'zj' | 'lc';
    timezone: string;
    topic: string;
    triggerType: string;
    localDay: string;
    dedupeKey: string;
    instruction: string;
  }): Promise<boolean> {
    const existing = getDB()
      .prepare('SELECT 1 FROM coach_outreach_events WHERE dedupe_key = ? LIMIT 1')
      .get(input.dedupeKey) as { 1?: number } | undefined;
    if (existing) {
      return false;
    }

    const content = await CoachService.composeProactiveMessage(String(input.userId), `
Trigger: ${input.triggerType}
User timezone: ${input.timezone}
Local day: ${input.localDay}

${input.instruction}
    `.trim(), {
      coachOverride: input.coachId,
      platform: 'scheduler',
      conversationScope: 'coach_dm',
    });

    if (!content.trim()) {
      return false;
    }

    const messageId = await MessageService.sendMessage(0, input.topic, content, []);
    getDB()
      .prepare(`
        INSERT INTO coach_outreach_events (user_id, trigger_type, dedupe_key, coach_id, local_day, payload, message_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.userId,
        input.triggerType,
        input.dedupeKey,
        input.coachId,
        input.localDay,
        JSON.stringify({ timezone: input.timezone }),
        messageId,
      );

    const [message] = await MessageService.getMessages(input.topic, 1);
    await publishRealtimeEvent({
      type: 'message_created',
      topic: input.topic,
      message: message || {
        id: messageId,
        topic: input.topic,
        from_user_id: 0,
        content,
        media_urls: [],
        mentions: [],
        created_at: new Date().toISOString(),
      },
    });
    await publishRealtimeEvent({
      type: 'inbox_updated',
      userIds: [input.userId],
    });

    logger.info(`[outreach] sent trigger=${input.triggerType} user=${input.userId} coach=${input.coachId}`);
    return true;
  }
}
