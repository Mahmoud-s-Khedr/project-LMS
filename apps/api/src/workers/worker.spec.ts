import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import {
  BackgroundTaskSchedulerService,
  type BackgroundTaskContext,
  type BackgroundTaskHandler,
  type DeliveredEvent,
  EventConsumerRegistry,
  type EventConsumer,
} from '../modules/events';
import { WorkerAppModule } from './worker-app.module';
import { DEFAULT_WORKER_BOOTSTRAP_OPTIONS } from './main';

@Injectable()
class SampleOrderPaidConsumer implements EventConsumer<'order.paid.v1'> {
  readonly name = 'sample.order-paid';
  readonly eventTypes = ['order.paid.v1'] as const;

  async handle(
    _event: DeliveredEvent<'order.paid.v1'>,
    _tx: Prisma.TransactionClient,
  ): Promise<void> {
    // no-op unit stub
  }
}

@Injectable()
class SampleDeadlineTask implements BackgroundTaskHandler<{ attemptId: string }> {
  readonly name = 'sample.attempt-deadline';
  readonly everyMs = 60_000;

  async handle(_payload: { attemptId: string }, _context: BackgroundTaskContext): Promise<void> {
    // no-op unit stub
  }
}

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (key: string) => {
          const map: Record<string, unknown> = {
            DATABASE_URL: 'postgresql://stub/stub',
            SMTP_HOST: 'localhost',
            SMTP_PORT: 51025,
            SMTP_SECURE: false,
            SMTP_FROM: 'LMS <noreply@lms.local>',
            S3_REGION: 'us-east-1',
            S3_ENDPOINT: 'http://localhost:59000',
            S3_ACCESS_KEY_ID: 'stub',
            S3_SECRET_ACCESS_KEY: 'stub-secret',
            S3_FORCE_PATH_STYLE: true,
            S3_PRIVATE_BUCKET: 'lms-private',
            JWT_ACCESS_SECRET: 'worker-unit-spec-jwt-secret-at-least-32-chars',
            WEB_ORIGIN: 'http://localhost:3100',
            TENANCY_MAIL_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
            TENANCY_MAIL_KEY_ID: 'v1',
          };
          return map[key];
        },
        getOrThrow: (key: string) => {
          const map: Record<string, unknown> = {
            DATABASE_URL: 'postgresql://stub/stub',
            SMTP_HOST: 'localhost',
            SMTP_PORT: 51025,
            SMTP_SECURE: false,
            SMTP_FROM: 'LMS <noreply@lms.local>',
            S3_REGION: 'us-east-1',
            S3_ENDPOINT: 'http://localhost:59000',
            S3_ACCESS_KEY_ID: 'stub',
            S3_SECRET_ACCESS_KEY: 'stub-secret',
            S3_FORCE_PATH_STYLE: true,
            S3_PRIVATE_BUCKET: 'lms-private',
            JWT_ACCESS_SECRET: 'worker-unit-spec-jwt-secret-at-least-32-chars',
            WEB_ORIGIN: 'http://localhost:3100',
            TENANCY_MAIL_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
            TENANCY_MAIL_KEY_ID: 'v1',
          };
          return map[key];
        },
      },
    },
    {
      provide: PrismaService,
      useValue: { onModuleInit: async () => undefined, onModuleDestroy: async () => undefined },
    },
  ],
  exports: [ConfigService, PrismaService],
})
class StubInfrastructureModule {}

describe('WorkerAppModule bootstrap', () => {
  it('registers explicitly supplied consumer and background-task provider classes without importing unfinished feature modules', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        WorkerAppModule.forRoot({
          includeInfrastructure: false,
          imports: [StubInfrastructureModule],
          consumers: [SampleOrderPaidConsumer],
          tasks: [SampleDeadlineTask],
          options: {
            autoStart: false,
            queuePrefix: 'lms_worker_unit_spec',
          },
          auditOptions: {
            ipHashSecret: 'worker-unit-spec-hmac-secret',
            nodeEnv: 'test',
          },
        }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => undefined, onModuleDestroy: async () => undefined })
      .compile();

    const registry = moduleRef.get(EventConsumerRegistry);
    expect(registry.all().map((c) => c.name)).toEqual(['sample.order-paid']);
    expect(registry.forType('order.paid.v1')).toHaveLength(1);

    const scheduler = moduleRef.get(BackgroundTaskSchedulerService);
    expect(scheduler.registeredTasks()).toEqual(['sample.attempt-deadline']);

    await moduleRef.close();
  });

  it('registers tenancy invitation mail consumer and cleanup task in DEFAULT_WORKER_BOOTSTRAP_OPTIONS', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        WorkerAppModule.forRoot({
          ...DEFAULT_WORKER_BOOTSTRAP_OPTIONS,
          includeInfrastructure: false,
          imports: [StubInfrastructureModule, ...(DEFAULT_WORKER_BOOTSTRAP_OPTIONS.imports ?? [])],
          options: {
            autoStart: false,
            queuePrefix: 'lms_worker_default_spec',
          },
          auditOptions: {
            ipHashSecret: 'worker-unit-spec-hmac-secret',
            nodeEnv: 'test',
          },
        }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ onModuleInit: async () => undefined, onModuleDestroy: async () => undefined })
      .compile();

    const registry = moduleRef.get(EventConsumerRegistry);
    expect(registry.all().map((c) => c.name)).toEqual([
      'tenancy.invitation-mail',
      'learning.completion',
      'certificates.completion',
      'notifications.domain',
      'analytics.export-requested',
      'fulfillment.billing',
    ]);
    expect(registry.forType('workspace.invitation.created.v1')).toHaveLength(1);

    const scheduler = moduleRef.get(BackgroundTaskSchedulerService);
    expect(scheduler.registeredTasks()).toEqual(
      expect.arrayContaining([
        'tenancy.invitation-capability-cleanup',
        'media.process',
        'media.publish-covers',
        'assessments.attempt-deadline',
        'commerce.reconcile',
        'learning.completion-backstop',
        'certificates.render',
        'notifications.delivery',
        'notifications.reminders',
        'notifications.releases',
        'analytics.exports',
        'analytics.daily-metrics',
        'fulfillment.reconcile',
      ]),
    );

    await moduleRef.close();
  });
});
