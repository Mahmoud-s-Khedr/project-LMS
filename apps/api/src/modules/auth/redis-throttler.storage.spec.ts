import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { RedisThrottlerStorage } from './redis-throttler.storage';

describe('Redis throttle storage', () => {
  it('shares atomic counters and blocks between instances', async () => {
    const prefix = `lms:test:throttle:${randomUUID()}:`;
    const url = 'redis://localhost:56379';
    const a = new RedisThrottlerStorage(url, prefix);
    const b = new RedisThrottlerStorage(url, prefix);
    const redis = new Redis(url);
    try {
      const results = await Promise.all(
        Array.from({ length: 11 }, (_, i) =>
          (i % 2 ? a : b).increment('client', 60000, 10, 60000, 'default'),
        ),
      );
      expect(results.filter((result) => result.isBlocked)).toHaveLength(1);
      expect(Math.max(...results.map((result) => result.totalHits))).toBe(11);
      expect(
        (await a.increment('client', 60000, 10, 60000, 'default')).timeToBlockExpire,
      ).toBeGreaterThan(0);
    } finally {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
      await Promise.all([
        a.onModuleDestroy(),
        a.onModuleDestroy(),
        b.onModuleDestroy(),
        redis.quit(),
      ]);
    }
  });
});
