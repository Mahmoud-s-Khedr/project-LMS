import type { ConnectionOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';

export type EventsRedisConnection = RedisOptions & ConnectionOptions;

/**
 * Builds ioredis options from a redis:// or rediss:// URL. `role` selects BullMQ-appropriate behaviour:
 * - `producer`: fail fast while Redis is unavailable (no offline queue) so leases are released, not hung.
 * - `worker`: blocking connection with unlimited per-request retries, as BullMQ workers require.
 */
export function redisConnectionFromUrl(
  redisUrl: string,
  role: 'producer' | 'worker',
): EventsRedisConnection {
  const url = new URL(redisUrl);
  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('Events Redis URL must use redis:// or rediss://');
  }
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0) throw new Error('Events Redis URL has an invalid database index');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    connectTimeout: 5_000,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    enableOfflineQueue: role === 'worker',
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
  } as EventsRedisConnection;
}

export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
}

/** Rejects when `promise` does not settle within `ms` (the underlying operation is not cancelled). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Exponential backoff with full jitter in [base/2, base] * 2^(attempt-1), capped. */
export function jitteredBackoff(attempt: number, baseMs: number, maxMs: number, random: () => number = Math.random): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 30);
  const ceiling = Math.min(maxMs, baseMs * 2 ** exponent);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
