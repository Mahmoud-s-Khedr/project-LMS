import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  healthLiveResponseSchema,
  healthResponseSchema,
  type HealthLiveResponse,
  type HealthResponse,
} from '@lms/shared';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import { RedisService } from '../infrastructure/queue/redis.service';
import { Public } from '../common/authz/decorators';
import { SchemaResponse } from '../modules/auth/schema.decorator';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness without dependency checks' })
  @SchemaResponse(healthLiveResponseSchema)
  live(): HealthLiveResponse {
    return { data: { status: 'ok' } };
  }

  @Get()
  @ApiOperation({ summary: 'Readiness of the API, PostgreSQL, and Redis' })
  @SchemaResponse(healthResponseSchema)
  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.ping(),
    ]);
    const dbStatus = database.status === 'fulfilled' ? ('ok' as const) : ('unavailable' as const);
    const redisStatus =
      redis.status === 'fulfilled' && redis.value === 'PONG'
        ? ('ok' as const)
        : ('unavailable' as const);
    if (dbStatus !== 'ok' || redisStatus !== 'ok') {
      throw new ServiceUnavailableException({
        code: 'SERVICE_UNAVAILABLE',
        message: 'A required service is unavailable',
      });
    }
    return {
      data: {
        status: 'ok',
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }
}
