import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { initDB } from './database/sqlite-db.js';
import { knowledgeService } from './services/knowledge-service.js';
import { initializeRealtimeEventBus, shutdownRealtimeEventBus } from './realtime/realtime-event-bus.js';
import { shutdownCoachReplyWorker, startCoachReplyWorker } from './jobs/coach-reply-worker.js';
import { logger } from './utils/logger.js';

dotenv.config();

const dataDir = path.join(process.cwd(), 'data');
const uploadDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

initDB();
knowledgeService.init();

let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[worker] received ${signal}, shutting down`);

  await Promise.allSettled([
    shutdownCoachReplyWorker(),
    shutdownRealtimeEventBus(),
  ]);

  process.exit(0);
}

async function main() {
  await initializeRealtimeEventBus();
  await startCoachReplyWorker();
  logger.info('[worker] coach reply worker started');

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
