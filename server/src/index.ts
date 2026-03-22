import dotenv from 'dotenv';
import { WSServer } from './websocket/ws-server.js';
import { startAPI } from './api/server.js';
import { initDB } from './database/runtime-db.js';
import { knowledgeService } from './services/knowledge-service.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';
import { initializeRealtimeEventBus, shutdownRealtimeEventBus } from './realtime/realtime-event-bus.js';
import { shutdownCoachReplyWorker, startCoachReplyWorker } from './jobs/coach-reply-worker.js';
import { logger } from './utils/logger.js';
import { ensureAppDataDirs } from './config/app-paths.js';
import { shutdownRateLimiter } from './security/rate-limiter.js';
import {
  isApiServerEnabled,
  isBackgroundCleanupEnabled,
  isWebSocketServerEnabled,
} from './config/runtime-flags.js';

dotenv.config();

ensureAppDataDirs();

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
    shutdownRateLimiter(),
  ]);

  process.exit(0);
}

async function main() {
  await initDB();
  await initializeRealtimeEventBus();
  await startCoachReplyWorker();

  const apiEnabled = isApiServerEnabled();
  const wsEnabled = isWebSocketServerEnabled();
  const cleanupEnabled = isBackgroundCleanupEnabled();

  if (!apiEnabled && !wsEnabled && !cleanupEnabled) {
    throw new Error('At least one of ENABLE_API_SERVER, ENABLE_WEBSOCKET_SERVER, or ENABLE_BACKGROUND_CLEANUP must be enabled');
  }

  if (wsEnabled) {
    wsServer = new WSServer(wsPort);
  } else {
    logger.info('[bootstrap] websocket server disabled by ENABLE_WEBSOCKET_SERVER');
  }

  if (apiEnabled) {
    startAPI(apiPort);
  } else {
    logger.info('[bootstrap] API server disabled by ENABLE_API_SERVER');
  }

  if (cleanupEnabled) {
    mediaCleanup.start();
    sessionCleanup.start();
    logger.info('[bootstrap] background cleanup schedulers enabled');
  } else {
    logger.info('[bootstrap] background cleanup schedulers disabled by ENABLE_BACKGROUND_CLEANUP');
  }

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
