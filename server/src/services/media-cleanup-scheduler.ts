import { MediaStore } from '../context/media-store.js';

const DEFAULT_INTERVAL_MINUTES = 6 * 60;

export class MediaCleanupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly mediaStore: MediaStore;
  private readonly intervalMs: number;

  constructor(mediaStore?: MediaStore, intervalMinutes?: number) {
    this.mediaStore = mediaStore || new MediaStore();
    const minutes = Number(intervalMinutes || process.env.MEDIA_CLEANUP_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES);
    const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_INTERVAL_MINUTES;
    this.intervalMs = Math.max(60_000, normalizedMinutes * 60_000);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    // Fire one background pass on boot without blocking startup.
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
      const result = await this.mediaStore.cleanupExpiredForAllUsers();
      const elapsed = Date.now() - startedAt;
      if (result.removedCount > 0) {
        console.log(`[media-cleanup] removed ${result.removedCount} expired media items across ${result.userCount} users in ${elapsed}ms`);
      } else {
        console.log(`[media-cleanup] no expired media found across ${result.userCount} users (${elapsed}ms)`);
      }
    } catch (error: any) {
      console.error('[media-cleanup] background cleanup failed:', error?.message || error);
    } finally {
      this.running = false;
    }
  }
}
