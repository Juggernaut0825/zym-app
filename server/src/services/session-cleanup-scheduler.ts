import { AuthService } from './auth-service.js';
import { formatProcessMemoryUsage } from '../utils/process-metrics.js';

const DEFAULT_INTERVAL_MINUTES = 30;

export class SessionCleanupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly intervalMs: number;

  constructor(intervalMinutes?: number) {
    const minutes = Number(intervalMinutes || process.env.SESSION_CLEANUP_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
    const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES;
    this.intervalMs = Math.max(60_000, normalizedMinutes * 60_000);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    // One non-blocking pass at startup.
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
    try {
      const startedAt = Date.now();
      const removed = AuthService.cleanupSessions(true);
      const elapsed = Date.now() - startedAt;
      if (removed > 0) {
        console.log(`[session-cleanup] removed ${removed} expired/revoked sessions in ${elapsed}ms (${formatProcessMemoryUsage()})`);
      } else {
        console.log(`[session-cleanup] no stale sessions found (${elapsed}ms, ${formatProcessMemoryUsage()})`);
      }
    } catch (error: any) {
      console.error('[session-cleanup] background cleanup failed:', error?.message || error);
    } finally {
      this.running = false;
    }
  }
}
