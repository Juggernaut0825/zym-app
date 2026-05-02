import fs from 'fs/promises';
import path from 'path';
import { getDB } from '../database/runtime-db.js';
import { CoachService } from './coach-service.js';
import { MessageService, buildCoachTopic, encodeUtf8Base64 } from './message-service.js';
import { ActivityNotificationService } from './activity-notification-service.js';
import { PushNotificationService } from './push-notification-service.js';
import { publishRealtimeEvent } from '../realtime/realtime-event-bus.js';
import { logger } from '../utils/logger.js';
import { formatProcessMemoryUsage } from '../utils/process-metrics.js';
import { resolveUserDataDir } from '../utils/path-resolver.js';
import { coachTypedToolsService } from './coach-typed-tools-service.js';
import { computeCoachProgressSummary, normalizeCoachCheckIn } from '../utils/coach-progress.js';
import { resolveSelectedCoachForUser } from '../utils/coach-prefs.js';

const DEFAULT_INTERVAL_MINUTES = 10;
const DEFAULT_NIGHTLY_HOUR = 20;
const DEFAULT_INACTIVITY_DAYS = 3;
const DEFAULT_ONBOARDING_DELAY_HOURS = 6;

interface OutreachUser {
  id: number;
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

function localDayDistance(fromDay: string | null | undefined, toDay: string): number {
  const safeFrom = String(fromDay || '').trim();
  const safeTo = String(toDay || '').trim();
  if (!safeFrom || !safeTo) return Number.POSITIVE_INFINITY;
  const fromDate = new Date(`${safeFrom}T00:00:00.000Z`);
  const toDate = new Date(`${safeTo}T00:00:00.000Z`);
  if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
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
          SELECT id, timezone, created_at, email_verified_at
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

    const coachId = resolveSelectedCoachForUser(userId);
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
    if (this.alreadyHasCoachMessageForLocalDay(topic, timezone, localNow.day)) {
      return false;
    }

    if (await this.maybeSendOnboarding(userId, coachId, timezone, topic, user.created_at, now)) {
      return true;
    }
    if (await this.maybeSendProgressCheckIn(userId, coachId, timezone, topic, localNow, now)) {
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

  private alreadyHasCoachMessageForLocalDay(topic: string, timezone: string, localDay: string): boolean {
    const rows = getDB()
      .prepare(`
        SELECT created_at
        FROM messages
        WHERE topic = ? AND from_user_id = 0
        ORDER BY id DESC
        LIMIT 20
      `)
      .all(topic) as Array<{ created_at?: string | null }>;

    return rows.some((row) => (
      localDateParts(parseIso(row.created_at) || new Date(0), timezone).day === localDay
    ));
  }

  private reserveOutreachEvent(input: {
    userId: number;
    triggerType: string;
    dedupeKey: string;
    coachId: string;
    localDay: string;
    timezone: string;
  }): boolean {
    try {
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
          JSON.stringify({ timezone: input.timezone, status: 'reserved' }),
          null,
        );
      return true;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error).toLowerCase();
      if (message.includes('unique') || message.includes('duplicate')) {
        return false;
      }
      throw error;
    }
  }

  private clearReservedOutreachEvent(dedupeKey: string): void {
    getDB()
      .prepare(`
        DELETE FROM coach_outreach_events
        WHERE dedupe_key = ? AND message_id IS NULL
      `)
      .run(dedupeKey);
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

  private async maybeSendProgressCheckIn(
    userId: number,
    coachId: 'zj' | 'lc',
    timezone: string,
    topic: string,
    localNow: { day: string; hour: number; minute: number },
    now: Date,
  ): Promise<boolean> {
    if (localNow.hour < 8 || localNow.hour > 20 || localNow.minute > 20) {
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
    if (localDateParts(parseIso(latestUserMessage?.created_at) || new Date(0), timezone).day === localNow.day) {
      return false;
    }

    const daily = await readDailyRecord(userId);
    const profile = await coachTypedToolsService.getProfile(String(userId)).catch(() => ({}));
    const summary = computeCoachProgressSummary(daily, (profile as any)?.goal);
    const daysSinceWeight = localDayDistance(summary.latestWeightDay, localNow.day);
    const daysSinceCheckIn = localDayDistance(summary.latestCheckInDay, localNow.day);

    if (daysSinceWeight < 3 && daysSinceCheckIn < 3) {
      return false;
    }

    const dedupeKey = `progress_checkin:${userId}:${localNow.day}`;
    return this.sendOutreach({
      userId,
      coachId,
      timezone,
      topic,
      triggerType: 'progress_checkin',
      localDay: localNow.day,
      dedupeKey,
      instruction: 'The user has not logged a recent progress check-in. Send one concise coach message that nudges a quick weigh-in or short status update, and explain why a 30-second check-in helps you adjust training or food.',
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

    const reserved = this.reserveOutreachEvent({
      userId: input.userId,
      triggerType: input.triggerType,
      dedupeKey: input.dedupeKey,
      coachId: input.coachId,
      localDay: input.localDay,
      timezone: input.timezone,
    });
    if (!reserved) {
      return false;
    }

    let messageId: number | null = null;

    try {
      const daily = await readDailyRecord(input.userId);
      const stateContext = await this.buildStateContext(input.userId, input.timezone, input.localDay, daily);
      const content = await CoachService.composeProactiveMessage(String(input.userId), `
Trigger: ${input.triggerType}
User timezone: ${input.timezone}
Local day: ${input.localDay}

${input.instruction}
${stateContext}
    `.trim(), {
        coachOverride: input.coachId,
        platform: 'scheduler',
        conversationScope: 'coach_dm',
      });

      if (!content.trim()) {
        this.clearReservedOutreachEvent(input.dedupeKey);
        return false;
      }

      messageId = await MessageService.sendMessage(0, input.topic, content, []);
      getDB()
        .prepare(`
          UPDATE coach_outreach_events
          SET message_id = ?, payload = ?
          WHERE dedupe_key = ?
        `)
        .run(
          messageId,
          JSON.stringify({ timezone: input.timezone, status: 'sent' }),
          input.dedupeKey,
        );

      let activityNotificationTargets: number[] = [];
      try {
        activityNotificationTargets = ActivityNotificationService.createMessageNotifications(
          0,
          input.topic,
          messageId,
          content,
          [input.userId],
        );
      } catch (error) {
        logger.warn('[outreach] failed to create coach activity notification', error);
      }

      if (activityNotificationTargets.length > 0) {
        void PushNotificationService.sendMessageNotifications({
          actorUserId: 0,
          recipientUserIds: activityNotificationTargets,
          topic: input.topic,
          messageId,
          snippet: content,
        }).catch((error) => logger.warn('[outreach] failed to send coach push notification', error));
      }

      const [message] = await MessageService.getMessages(input.topic, 1);
      await publishRealtimeEvent({
        type: 'message_created',
        topic: input.topic,
        message: message || {
          id: messageId,
          topic: input.topic,
          from_user_id: 0,
          content,
          content_b64: encodeUtf8Base64(content),
          media_urls: [],
          mentions: [],
          created_at: new Date().toISOString(),
        },
      });
      await publishRealtimeEvent({
        type: 'inbox_updated',
        userIds: Array.from(new Set([
          input.userId,
          ...activityNotificationTargets,
        ])),
      });

      logger.info(`[outreach] sent trigger=${input.triggerType} user=${input.userId} coach=${input.coachId}`);
      return true;
    } catch (error) {
      if (!messageId) {
        this.clearReservedOutreachEvent(input.dedupeKey);
      }
      throw error;
    }
  }

  private async buildStateContext(
    userId: number,
    timezone: string,
    localDay: string,
    daily: Record<string, any>,
  ): Promise<string> {
    try {
      const profile = await coachTypedToolsService.getProfile(String(userId));
      const summary = ((profile as any)?.progress_summary || computeCoachProgressSummary(daily, (profile as any)?.goal)) as any;
      const todayBucket = daily[localDay] && typeof daily[localDay] === 'object' ? daily[localDay] : {};
      const todayCheckIn = normalizeCoachCheckIn((todayBucket as any)?.check_in);
      const todayMeals = Array.isArray((todayBucket as any)?.meals) ? (todayBucket as any).meals.length : 0;
      const todayTraining = Array.isArray((todayBucket as any)?.training) ? (todayBucket as any).training.length : 0;

      const lines: string[] = ['[USER_STATE]'];
      if ((profile as any)?.goal) {
        lines.push(`Goal: ${(profile as any).goal}`);
      }
      if (summary?.trendNarrative) {
        lines.push(`Progress: ${summary.trendNarrative}`);
      }
      if (todayCheckIn) {
        lines.push('Today already has a progress check-in.');
      } else {
        lines.push('Today does not have a progress check-in yet.');
      }
      lines.push(`Today logs: ${todayMeals} meals, ${todayTraining} training entries.`);
      return `\n\n${lines.join('\n')}`;
    } catch {
      return '';
    }
  }
}
