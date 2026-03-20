import { EventEmitter } from 'events';
import { getRealtimeRedisChannel, getRedisUrl, resolveRealtimeBusProvider } from '../config/infrastructure.js';
import { logger } from '../utils/logger.js';
import type { RealtimeEvent } from './realtime-events.js';

type RealtimeEventHandler = (event: RealtimeEvent) => void;

interface RealtimeEventBus {
  readonly provider: 'local' | 'redis';
  initialize(): Promise<void>;
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(handler: RealtimeEventHandler): Promise<() => void>;
  close(): Promise<void>;
}

const localEmitter = new EventEmitter();

class LocalRealtimeEventBus implements RealtimeEventBus {
  readonly provider = 'local' as const;

  async initialize(): Promise<void> {}

  async publish(event: RealtimeEvent): Promise<void> {
    queueMicrotask(() => {
      localEmitter.emit('event', event);
    });
  }

  async subscribe(handler: RealtimeEventHandler): Promise<() => void> {
    localEmitter.on('event', handler);
    return () => {
      localEmitter.off('event', handler);
    };
  }

  async close(): Promise<void> {}
}

class RedisRealtimeEventBus implements RealtimeEventBus {
  readonly provider = 'redis' as const;

  private publisher: any;
  private subscriber: any;
  private started = false;
  private readonly handlers = new Set<RealtimeEventHandler>();

  constructor(
    private readonly redisUrl: string,
    private readonly channel: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.started) return;

    const redisModule = await import('ioredis');
    const Redis = (redisModule as any).default ?? redisModule;
    this.publisher = new Redis(this.redisUrl);
    this.subscriber = new Redis(this.redisUrl);
    this.subscriber.on('message', (channel: string, payload: string) => {
      if (channel !== this.channel) return;
      try {
        const event = JSON.parse(payload) as RealtimeEvent;
        for (const handler of this.handlers) {
          try {
            handler(event);
          } catch (error) {
            logger.error('[realtime] event handler failed', error);
          }
        }
      } catch (error) {
        logger.error('[realtime] failed to parse redis event', error);
      }
    });
    await this.subscriber.subscribe(this.channel);
    this.started = true;
  }

  async publish(event: RealtimeEvent): Promise<void> {
    await this.initialize();
    await this.publisher.publish(this.channel, JSON.stringify(event));
  }

  async subscribe(handler: RealtimeEventHandler): Promise<() => void> {
    await this.initialize();
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async close(): Promise<void> {
    this.handlers.clear();
    const publisher = this.publisher;
    const subscriber = this.subscriber;
    this.publisher = undefined;
    this.subscriber = undefined;
    this.started = false;

    await Promise.all([
      publisher?.quit?.().catch?.(() => publisher?.disconnect?.()),
      subscriber?.quit?.().catch?.(() => subscriber?.disconnect?.()),
    ]);
  }
}

let busPromise: Promise<RealtimeEventBus> | null = null;

async function createRealtimeEventBus(): Promise<RealtimeEventBus> {
  const provider = resolveRealtimeBusProvider();
  const redisUrl = getRedisUrl();

  if (provider === 'redis') {
    if (!redisUrl) {
      throw new Error('REALTIME_BUS_PROVIDER=redis requires REDIS_URL');
    }

    try {
      const bus = new RedisRealtimeEventBus(redisUrl, getRealtimeRedisChannel());
      await bus.initialize();
      logger.info(`[realtime] using redis event bus on ${getRealtimeRedisChannel()}`);
      return bus;
    } catch (error) {
      if (String(process.env.REALTIME_BUS_PROVIDER || '').trim().toLowerCase() === 'redis') {
        throw error;
      }
      logger.warn('[realtime] redis bus unavailable, falling back to local bus', error);
    }
  }

  const bus = new LocalRealtimeEventBus();
  await bus.initialize();
  logger.info('[realtime] using local event bus');
  return bus;
}

export async function initializeRealtimeEventBus(): Promise<void> {
  if (!busPromise) {
    busPromise = createRealtimeEventBus();
  }
  await busPromise;
}

async function getRealtimeEventBus(): Promise<RealtimeEventBus> {
  if (!busPromise) {
    busPromise = createRealtimeEventBus();
  }
  return busPromise;
}

export async function publishRealtimeEvent(event: RealtimeEvent): Promise<void> {
  const bus = await getRealtimeEventBus();
  await bus.publish(event);
}

export async function subscribeToRealtimeEvents(handler: RealtimeEventHandler): Promise<() => void> {
  const bus = await getRealtimeEventBus();
  return bus.subscribe(handler);
}

export async function shutdownRealtimeEventBus(): Promise<void> {
  if (!busPromise) return;
  const bus = await busPromise;
  busPromise = null;
  await bus.close();
}
