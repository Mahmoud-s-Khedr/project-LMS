import { ServiceUnavailableException } from '@nestjs/common';
import { healthLiveResponseSchema, healthResponseSchema } from '@lms/shared';
import type { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { RedisService } from '../infrastructure/queue/redis.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns canonical liveness and readiness envelopes when dependencies are healthy', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );

    expect(healthLiveResponseSchema.parse(controller.live())).toEqual({
      data: { status: 'ok' },
    });
    expect(healthResponseSchema.parse(await controller.check())).toEqual({
      data: { status: 'ok', database: 'ok', redis: 'ok' },
    });
  });

  it('throws 503 when PostgreSQL or Redis fails readiness', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('db down')) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const controller = new HealthController(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
