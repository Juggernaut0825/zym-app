import dotenv from 'dotenv';
import { initDB } from './database/runtime-db.js';
import { knowledgeService } from './services/knowledge-service.js';
import { initializeRealtimeEventBus, shutdownRealtimeEventBus } from './realtime/realtime-event-bus.js';
import { shutdownCoachReplyWorker, startCoachReplyWorker } from './jobs/coach-reply-worker.js';
import { logger } from './utils/logger.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';
import { isBackgroundCleanupEnabled } from './config/runtime-flags.js';
import { ensureAppDataDirs } from './config/app-paths.js';
import { shutdownRateLimiter } from './security/rate-limiter.js';

dotenv.config();

ensureAppDataDirs();

knowledgeService.init();

let shuttingDown = false;
const mediaCleanup = new MediaCleanupScheduler();
const sessionCleanup = new SessionCleanupScheduler();

async function shutdown(signal: 'SIGINT' | 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[worker] received ${signal}, shutting down`);

  await Promise.allSettled([
    shutdownCoachReplyWorker(),
    shutdownRealtimeEventBus(),
    shutdownRateLimiter(),
  ]);
  mediaCleanup.stop();
  sessionCleanup.stop();

  process.exit(0);
}

async function main() {
  await initDB();
  await initializeRealtimeEventBus();
  await startCoachReplyWorker();
  logger.info('[worker] coach reply worker started');

  if (isBackgroundCleanupEnabled()) {
    mediaCleanup.start();
    sessionCleanup.start();
    logger.info('[worker] background cleanup schedulers enabled');
  } else {
    logger.info('[worker] background cleanup schedulers disabled by ENABLE_BACKGROUND_CLEANUP');
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

void main().catch((error) => {
  logger.error('[worker] startup failed', error);
  process.exit(1);
});
