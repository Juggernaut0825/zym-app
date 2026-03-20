function envFlag(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type RealtimeBusProvider = 'local' | 'redis';
export type CoachQueueProvider = 'local' | 'bullmq';

export function getRedisUrl(): string | null {
  const value = String(process.env.REDIS_URL || '').trim();
  return value || null;
}

export function resolveRealtimeBusProvider(): RealtimeBusProvider {
  const configured = String(process.env.REALTIME_BUS_PROVIDER || 'auto').trim().toLowerCase();
  if (configured === 'local' || configured === 'redis') {
    return configured;
  }
  return getRedisUrl() ? 'redis' : 'local';
}

export function getRealtimeRedisChannel(): string {
  return String(process.env.REALTIME_REDIS_CHANNEL || 'zym:realtime').trim() || 'zym:realtime';
}

export function resolveCoachQueueProvider(): CoachQueueProvider {
  const configured = String(process.env.COACH_QUEUE_PROVIDER || 'auto').trim().toLowerCase();
  if (configured === 'local' || configured === 'bullmq') {
    return configured;
  }
  return getRedisUrl() ? 'bullmq' : 'local';
}

export function getCoachQueueName(): string {
  return String(process.env.COACH_QUEUE_NAME || 'coach-replies').trim() || 'coach-replies';
}

export function getCoachQueueConcurrency(): number {
  return envInt('COACH_QUEUE_CONCURRENCY', 2);
}

export function isCoachQueueWorkerEnabled(): boolean {
  return envFlag('COACH_QUEUE_WORKER_ENABLED', true);
}
