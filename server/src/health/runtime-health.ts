import fs from 'fs/promises';
import { getCoachQueueName, getRedisUrl, resolveCoachQueueProvider, resolveRateLimitProvider, resolveRealtimeBusProvider } from '../config/infrastructure.js';
import { resolveAppDataRoot, resolveUploadsDir } from '../config/app-paths.js';
import { isApiServerEnabled, isBackgroundCleanupEnabled, isWebSocketServerEnabled } from '../config/runtime-flags.js';
import { getDatabaseProvider, getDB } from '../database/runtime-db.js';

export interface RuntimeHealthReport {
  ok: boolean;
  service: string;
  time: string;
  runtime: {
    roles: {
      api: boolean;
      websocket: boolean;
      backgroundCleanup: boolean;
    };
    providers: {
      database: string;
      realtimeBus: string;
      coachQueue: string;
      rateLimit: string;
    };
    queueName: string;
  };
  paths: {
    appDataRoot: string;
    uploadsDir: string;
  };
  dependencies: {
    database: { ok: boolean; error?: string };
    redis: { ok: boolean; configured: boolean; provider: string; error?: string };
    appData: { ok: boolean; path: string; error?: string };
    uploads: { ok: boolean; path: string; error?: string };
  };
}

async function probeDirectory(dirPath: string): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    await fs.access(dirPath);
    return { ok: true, path: dirPath };
  } catch (error) {
    return {
      ok: false,
      path: dirPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function probeDatabase(): { ok: boolean; error?: string } {
  try {
    const row = getDB().prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined;
    return { ok: Number(row?.ok || 0) === 1 };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeRedis(): Promise<{ ok: boolean; configured: boolean; error?: string }> {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return { ok: true, configured: false };
  }

  let client: any;
  try {
    const redisModule = await import('ioredis');
    const Redis = (redisModule as any).default ?? redisModule;
    client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    await client.connect();
    const pong = await client.ping();
    return { ok: pong === 'PONG', configured: true };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await client?.quit?.().catch?.(() => client?.disconnect?.());
  }
}

export async function getRuntimeHealthReport(): Promise<RuntimeHealthReport> {
  const database = probeDatabase();
  const redis = await probeRedis();
  const appData = await probeDirectory(resolveAppDataRoot());
  const uploads = await probeDirectory(resolveUploadsDir());
  const ok = database.ok && redis.ok && appData.ok && uploads.ok;

  return {
    ok,
    service: 'zym-server',
    time: new Date().toISOString(),
    runtime: {
      roles: {
        api: isApiServerEnabled(),
        websocket: isWebSocketServerEnabled(),
        backgroundCleanup: isBackgroundCleanupEnabled(),
      },
      providers: {
        database: getDatabaseProvider(),
        realtimeBus: resolveRealtimeBusProvider(),
        coachQueue: resolveCoachQueueProvider(),
        rateLimit: resolveRateLimitProvider(),
      },
      queueName: getCoachQueueName(),
    },
    paths: {
      appDataRoot: appData.path,
      uploadsDir: uploads.path,
    },
    dependencies: {
      database,
      redis: {
        ...redis,
        provider: getRedisUrl() ? 'redis' : 'disabled',
      },
      appData,
      uploads,
    },
  };
}
