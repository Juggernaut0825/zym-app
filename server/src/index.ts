import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { WSServer } from './websocket/ws-server.js';
import { startAPI } from './api/server.js';
import { initDB } from './database/sqlite-db.js';
import { knowledgeService } from './services/knowledge-service.js';
import { MediaCleanupScheduler } from './services/media-cleanup-scheduler.js';
import { SessionCleanupScheduler } from './services/session-cleanup-scheduler.js';

dotenv.config();

const dataDir = path.join(process.cwd(), 'data');
const uploadDir = path.join(dataDir, 'uploads');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

initDB();
knowledgeService.init();

const wsPort = parseInt(process.env.WEBSOCKET_PORT || '8080', 10);
const apiPort = parseInt(process.env.API_PORT || '3001', 10);

new WSServer(wsPort);
startAPI(apiPort);

const mediaCleanup = new MediaCleanupScheduler();
mediaCleanup.start();
const sessionCleanup = new SessionCleanupScheduler();
sessionCleanup.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    mediaCleanup.stop();
    sessionCleanup.stop();
  });
}
