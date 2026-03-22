import dotenv from 'dotenv';
import { initDB } from './database/runtime-db.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';
import { logger } from './utils/logger.js';
import { ensureAppDataDirs } from './config/app-paths.js';

dotenv.config();

ensureAppDataDirs();

const mediaCleanup = new MediaCleanupScheduler();
const sessionCleanup = new SessionCleanupScheduler();
let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[scheduler] received ${signal}, shutting down`);
  mediaCleanup.stop();
  sessionCleanup.stop();
  process.exit(0);
}

async function main() {
  await initDB();
  mediaCleanup.start();
  sessionCleanup.start();
  logger.info('[scheduler] background cleanup schedulers started');

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

void main().catch((error) => {
  logger.error('[scheduler] startup failed', error);
  process.exit(1);
});
