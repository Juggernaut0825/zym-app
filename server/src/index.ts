import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { WSServer } from './websocket/ws-server.js';
import { startAPI } from './api/server.js';
import { initDB } from './database/sqlite-db.js';
import { knowledgeService } from './services/knowledge-service.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';
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

const wsPort = parseInt(process.env.WEBSOCKET_PORT || '8080', 10);
const apiPort = parseInt(process.env.API_PORT || '3001', 10);

const mediaCleanup = new MediaCleanupScheduler();
const sessionCleanup = new SessionCleanupScheduler();
let wsServer: WSServer | null = null;
let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[bootstrap] received ${signal}, shutting down`);

  mediaCleanup.stop();
  sessionCleanup.stop();
  await Promise.allSettled([
    wsServer?.close() ?? Promise.resolve(),
    shutdownCoachReplyWorker(),
    shutdownRealtimeEventBus(),
  ]);

  process.exit(0);
}

async function main() {
  await initializeRealtimeEventBus();
  await startCoachReplyWorker();

  wsServer = new WSServer(wsPort);
  startAPI(apiPort);

  mediaCleanup.start();
  sessionCleanup.start();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }
}

void main().catch((error) => {
  logger.error('[bootstrap] startup failed', error);
  process.exit(1);
});
