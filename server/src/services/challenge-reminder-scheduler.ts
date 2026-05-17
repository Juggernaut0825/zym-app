import { getDB } from '../database/runtime-db.js';
import { PushNotificationService } from './push-notification-service.js';
import { logger } from '../utils/logger.js';
import { formatProcessMemoryUsage } from '../utils/process-metrics.js';

const DEFAULT_INTERVAL_MINUTES = 60;

function localDayForTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = new Map(parts.map((item) => [item.type, item.value]));
  return `${map.get('year') || '1970'}-${map.get('month') || '01'}-${map.get('day') || '01'}`;
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

function yesterdayForTimezone(timezone: string): string {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return localDayForTimezone(yesterday, timezone);
}

export class ChallengeReminderScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;
  private lastRunDay = '';

  constructor(intervalMinutes?: number) {
    const minutes = Number(intervalMinutes || process.env.CHALLENGE_REMINDER_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
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
    let sentCount = 0;

    try {
      const db = getDB();
      const members = db.prepare(`
        SELECT cm.user_id, cm.challenge_id, c.title, u.timezone
        FROM challenge_members cm
        JOIN challenges c ON c.id = cm.challenge_id
        JOIN users u ON u.id = cm.user_id
        WHERE c.status = 'active'
          AND u.email_verified_at IS NOT NULL
      `).all() as Array<{
        user_id: number;
        challenge_id: number;
        title: string;
        timezone: string | null;
      }>;

      for (const member of members) {
        const timezone = isValidTimeZone(String(member.timezone || '')) ? String(member.timezone) : 'UTC';
        const todayLocal = localDayForTimezone(new Date(), timezone);

        if (this.lastRunDay === todayLocal) continue;

        const yesterday = yesterdayForTimezone(timezone);

        const challenge = db.prepare(`
          SELECT start_date, end_date FROM challenges WHERE id = ? AND status = 'active'
        `).get(member.challenge_id) as { start_date: string; end_date: string } | undefined;
        if (!challenge) continue;
        if (yesterday < challenge.start_date || yesterday > challenge.end_date) continue;

        const completion = db.prepare(`
          SELECT 1 FROM challenge_completions
          WHERE challenge_id = ? AND user_id = ? AND local_day = ?
          LIMIT 1
        `).get(member.challenge_id, member.user_id, yesterday);

        if (!completion) {
          try {
            await PushNotificationService.sendChallengeReminderNotification({
              recipientUserId: member.user_id,
              challengeId: member.challenge_id,
              challengeTitle: member.title,
            });
            sentCount++;
          } catch (err) {
            logger.warn(`[challenge-reminder] push failed for user=${member.user_id} challenge=${member.challenge_id}`, err);
          }
        }
      }

      this.lastRunDay = localDayForTimezone(new Date(), 'UTC');
      const elapsed = Date.now() - startedAt;
      logger.info(`[challenge-reminder] checked ${members.length} memberships, sent ${sentCount} reminders in ${elapsed}ms (${formatProcessMemoryUsage()})`);
    } catch (error: any) {
      logger.error('[challenge-reminder] run failed:', error?.message || error);
    } finally {
      this.running = false;
    }
  }
}
