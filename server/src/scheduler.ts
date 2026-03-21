import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initDB } from './database/sqlite-db.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';
import { logger } from './utils/logger.js';

dotenv.config();

const dataDir = path.join(process.cwd(), 'data');
const uploadDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

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
