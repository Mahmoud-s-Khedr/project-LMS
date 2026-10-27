import Redis from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';

/** Fixed-window counters and blocks are updated atomically across API replicas. */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly redis: Redis;
  private closing?: Promise<void>;
  constructor(
    url: string,
    private readonly prefix = 'lms:throttle:',
  ) {
    this.redis = new Redis(url);
  }
  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    const result = (await this.redis.eval(
      `local blocked = redis.call('PTTL', KEYS[2])
       if blocked > 0 then return {tonumber(redis.call('GET', KEYS[1]) or '0'), redis.call('PTTL', KEYS[1]), 1, blocked} end
       local hits = redis.call('INCR', KEYS[1])
       if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
       local remaining = redis.call('PTTL', KEYS[1])
       if hits > tonumber(ARGV[2]) then
         redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
         return {hits, remaining, 1, tonumber(ARGV[3])}
       end
       return {hits, remaining, 0, 0}`,
      2,
      `${this.prefix}${name}:${key}`,
      `${this.prefix}${name}:${key}:block`,
      ttl,
      limit,
      blockDuration,
    )) as number[];
    return {
      totalHits: result[0]!,
      timeToExpire: Math.max(0, Math.ceil(result[1]! / 1000)),
      isBlocked: result[2] === 1,
      timeToBlockExpire: Math.ceil(result[3]! / 1000),
    };
  }
  onModuleDestroy(): Promise<void> {
    this.closing ??=
      this.redis.status === 'end' ? Promise.resolve() : this.redis.quit().then(() => undefined);
    return this.closing;
  }
}
