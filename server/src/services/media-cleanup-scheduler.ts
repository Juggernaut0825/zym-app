import { MediaStore } from '../context/media-store.js';
import path from 'path';
import { MediaAssetService } from './media-asset-service.js';

const DEFAULT_INTERVAL_MINUTES = 6 * 60;

export class MediaCleanupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly mediaStore: MediaStore;
  private readonly mediaAssetService: MediaAssetService;
  private readonly intervalMs: number;

  constructor(mediaStore?: MediaStore, intervalMinutes?: number) {
    this.mediaStore = mediaStore || new MediaStore();
    this.mediaAssetService = MediaAssetService.createFromEnvironment({
      uploadsDir: path.join(process.cwd(), 'data', 'uploads'),
    });
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
      const [legacyResult, assetResult] = await Promise.all([
        this.mediaStore.cleanupExpiredForAllUsers(),
        this.mediaAssetService.cleanupExpiredAssets(),
      ]);
      const elapsed = Date.now() - startedAt;
      const totalRemoved = legacyResult.removedCount + assetResult.removedCount + assetResult.orphanedUploadCount;
      if (totalRemoved > 0) {
        console.log(
          `[media-cleanup] removed ${legacyResult.removedCount} legacy items across ${legacyResult.userCount} users, `
          + `${assetResult.removedCount} media assets (${assetResult.purgedPendingCount} pending, `
          + `${assetResult.purgedExpiredCount} expired, ${assetResult.purgedDeletedCount} deleted), `
          + `and ${assetResult.orphanedUploadCount} orphan uploads in ${elapsed}ms`,
        );
      } else {
        console.log(
          `[media-cleanup] no expired media found across ${legacyResult.userCount} legacy users `
          + `(${assetResult.scannedUploadCount} upload files scanned, ${elapsed}ms)`,
        );
      }
    } catch (error: any) {
      console.error('[media-cleanup] background cleanup failed:', error?.message || error);
    } finally {
      this.running = false;
    }
  }
}
