import crypto from 'crypto';
import { getRedisUrl, resolveRateLimitProvider } from '../config/infrastructure.js';
import { logger } from '../utils/logger.js';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  provider: 'local' | 'redis';
}

interface RateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
  close(): Promise<void>;
}

const REDIS_SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

local count = redis.call('ZCARD', key)
if count >= max_requests then
  local ttl = redis.call('PTTL', key)
  if ttl < 0 then
    redis.call('PEXPIRE', key, window)
    ttl = window
  end
  return {0, count, ttl}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)

count = redis.call('ZCARD', key)
local ttl = redis.call('PTTL', key)
return {1, count, ttl}
`;

class LocalRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private requestCount = 0;
  private cleanupEvery = 500;

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const now = Date.now();
    const recent = (this.buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    this.requestCount += 1;
    if (this.requestCount % this.cleanupEvery === 0 || this.buckets.size > 20_000) {
      this.cleanup(now, windowMs);
    }

    if (recent.length >= limit) {
      this.buckets.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)),
        provider: 'local',
      };
    }

    recent.push(now);
    this.buckets.set(key, recent);
    return {
      allowed: true,
      remaining: Math.max(0, limit - recent.length),
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)),
      provider: 'local',
    };
  }

  async close(): Promise<void> {
    this.buckets.clear();
  }

  private cleanup(nowMs: number, windowMs: number): void {
    for (const [key, timestamps] of this.buckets.entries()) {
      const recent = timestamps.filter((timestamp) => nowMs - timestamp < windowMs);
      if (recent.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, recent);
      }
    }
  }
}

class RedisRateLimiter implements RateLimiter {
  private redis: any;

  constructor(
    private readonly redisUrl: string,
    private readonly prefix: string,
  ) {}

  private async getRedisClient() {
    if (this.redis) {
      return this.redis;
    }

    const redisModule = await import('ioredis');
    const Redis = (redisModule as any).default ?? redisModule;
    this.redis = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    return this.redis;
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const client = await this.getRedisClient();
    const result = await client.eval(
      REDIS_SLIDING_WINDOW_SCRIPT,
      1,
      `${this.prefix}:${key}`,
      String(Date.now()),
      String(windowMs),
      String(limit),
      crypto.randomUUID(),
    ) as [number, number, number];

    const allowed = Number(result?.[0] || 0) === 1;
    const count = Number(result?.[1] || 0);
    const ttlMs = Number(result?.[2] || windowMs);

    return {
      allowed,
      remaining: allowed ? Math.max(0, limit - count) : 0,
      retryAfterSeconds: Math.max(1, Math.ceil(Math.max(ttlMs, 1) / 1000)),
      provider: 'redis',
    };
  }

  async close(): Promise<void> {
    if (!this.redis) return;
    const redis = this.redis;
    this.redis = undefined;
    await redis.quit?.().catch?.(() => redis.disconnect?.());
  }
}

let rateLimiterPromise: Promise<RateLimiter> | null = null;

async function createRateLimiter(): Promise<RateLimiter> {
  const provider = resolveRateLimitProvider();
  const configuredProvider = String(process.env.RATE_LIMIT_PROVIDER || 'auto').trim().toLowerCase();
  const redisUrl = getRedisUrl();
  const prefix = String(process.env.RATE_LIMIT_REDIS_PREFIX || 'zym:rate-limit').trim() || 'zym:rate-limit';

  if (provider === 'redis') {
    if (!redisUrl) {
      throw new Error('RATE_LIMIT_PROVIDER=redis requires REDIS_URL');
    }

    try {
      const limiter = new RedisRateLimiter(redisUrl, prefix);
      await limiter.consume('__boot_probe__', 1, 1_000);
      logger.info(`[rate-limit] using redis sliding-window provider with prefix ${prefix}`);
      return limiter;
    } catch (error) {
      if (configuredProvider === 'redis') {
        throw error;
      }
      logger.warn('[rate-limit] redis unavailable, falling back to local provider', error);
    }
  }

  logger.info('[rate-limit] using local sliding-window provider');
  return new LocalRateLimiter();
}

export async function getRateLimiter(): Promise<RateLimiter> {
  if (!rateLimiterPromise) {
    rateLimiterPromise = createRateLimiter();
  }
  return rateLimiterPromise;
}

export async function shutdownRateLimiter(): Promise<void> {
  if (!rateLimiterPromise) return;
  const limiter = await rateLimiterPromise;
  rateLimiterPromise = null;
  await limiter.close();
}
