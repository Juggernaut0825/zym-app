import {
  getCoachQueueConcurrency,
  getCoachQueueName,
  getRedisUrl,
  isCoachQueueWorkerEnabled,
  resolveCoachQueueProvider,
} from '../config/infrastructure.js';
import { logger } from '../utils/logger.js';

export interface CoachReplyJobPayload {
  userId: number;
  topic: string;
  prompt: string;
  mediaUrls: string[];
  mediaIds: string[];
  platform: string;
  coachOverride?: 'zj' | 'lc';
  conversationScope: 'coach_dm' | 'group';
  allowWriteTools: boolean;
  participantUserIds: number[];
}

export type CoachReplyJobHandler = (job: CoachReplyJobPayload) => Promise<void>;

interface CoachReplyQueue {
  readonly provider: 'local' | 'bullmq';
  initialize(): Promise<void>;
  start(handler: CoachReplyJobHandler): Promise<void>;
  enqueue(job: CoachReplyJobPayload): Promise<void>;
  close(): Promise<void>;
}

class LocalCoachReplyQueue implements CoachReplyQueue {
  readonly provider = 'local' as const;

  private handler: CoachReplyJobHandler | null = null;

  async initialize(): Promise<void> {}

  async start(handler: CoachReplyJobHandler): Promise<void> {
    this.handler = handler;
  }

  async enqueue(job: CoachReplyJobPayload): Promise<void> {
    if (!this.handler) {
      throw new Error('Local coach queue worker is not started');
    }

    queueMicrotask(async () => {
      try {
        await this.handler?.(job);
      } catch (error) {
        logger.error('[jobs] local coach job failed', error);
      }
    });
  }

  async close(): Promise<void> {
    this.handler = null;
  }
}

class BullMQCoachReplyQueue implements CoachReplyQueue {
  readonly provider = 'bullmq' as const;

  private queue: any;
  private worker: any;
  private queueConnection: any;
  private workerConnection: any;
  private initialized = false;
  private started = false;

  constructor(
    private readonly redisUrl: string,
    private readonly queueName: string,
  ) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const [bullmqModule, redisModule] = await Promise.all([
      import('bullmq'),
      import('ioredis'),
    ]);
    const Queue = (bullmqModule as any).Queue;
    const Redis = (redisModule as any).default ?? redisModule;

    this.queueConnection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(this.queueName, {
      connection: this.queueConnection,
      defaultJobOptions: {
        attempts: 2,
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    });
    this.initialized = true;
  }

  async start(handler: CoachReplyJobHandler): Promise<void> {
    await this.initialize();
    if (this.started) return;

    const bullmqModule = await import('bullmq');
    const redisModule = await import('ioredis');
    const Worker = (bullmqModule as any).Worker;
    const Redis = (redisModule as any).default ?? redisModule;

    this.workerConnection = new Redis(this.redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      this.queueName,
      async (job: any) => {
        await handler(job.data as CoachReplyJobPayload);
      },
      {
        connection: this.workerConnection,
        concurrency: getCoachQueueConcurrency(),
      },
    );
    this.started = true;
  }

  async enqueue(job: CoachReplyJobPayload): Promise<void> {
    await this.initialize();
    await this.queue.add('coach-reply', job);
  }

  async close(): Promise<void> {
    this.started = false;
    this.initialized = false;

    await Promise.all([
      this.worker?.close?.(),
      this.queue?.close?.(),
      this.workerConnection?.quit?.().catch?.(() => this.workerConnection?.disconnect?.()),
      this.queueConnection?.quit?.().catch?.(() => this.queueConnection?.disconnect?.()),
    ]);

    this.worker = undefined;
    this.queue = undefined;
    this.workerConnection = undefined;
    this.queueConnection = undefined;
  }
}

let queuePromise: Promise<CoachReplyQueue> | null = null;

async function createCoachReplyQueue(): Promise<CoachReplyQueue> {
  const provider = resolveCoachQueueProvider();
  const redisUrl = getRedisUrl();

  if (provider === 'bullmq') {
    if (!redisUrl) {
      throw new Error('COACH_QUEUE_PROVIDER=bullmq requires REDIS_URL');
    }

    try {
      const queue = new BullMQCoachReplyQueue(redisUrl, getCoachQueueName());
      await queue.initialize();
      logger.info(`[jobs] using BullMQ coach queue ${getCoachQueueName()}`);
      return queue;
    } catch (error) {
      if (String(process.env.COACH_QUEUE_PROVIDER || '').trim().toLowerCase() === 'bullmq') {
        throw error;
      }
      logger.warn('[jobs] BullMQ unavailable, falling back to local coach queue', error);
    }
  }

  const queue = new LocalCoachReplyQueue();
  await queue.initialize();
  logger.info('[jobs] using local coach queue');
  return queue;
}

export async function initializeCoachReplyQueue(): Promise<CoachReplyQueue> {
  if (!queuePromise) {
    queuePromise = createCoachReplyQueue();
  }
  return queuePromise;
}

export async function enqueueCoachReplyJob(job: CoachReplyJobPayload): Promise<void> {
  const queue = await initializeCoachReplyQueue();
  await queue.enqueue(job);
}

export async function startCoachReplyQueueWorker(handler: CoachReplyJobHandler): Promise<void> {
  const queue = await initializeCoachReplyQueue();
  if (queue.provider !== 'local' && !isCoachQueueWorkerEnabled()) {
    logger.info('[jobs] coach queue worker disabled on this instance');
    return;
  }
  await queue.start(handler);
}

export async function shutdownCoachReplyQueue(): Promise<void> {
  if (!queuePromise) return;
  const queue = await queuePromise;
  queuePromise = null;
  await queue.close();
}
