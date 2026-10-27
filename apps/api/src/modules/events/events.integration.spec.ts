import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { z } from 'zod';
import { operationsEventsResponseSchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { createWorkerContext } from '../../workers/bootstrap';
import { WorkerAppModule } from '../../workers/worker-app.module';
import { AuditQueryService, AuditService, REDACTED } from '../audit';
import {
  type AnyEventConsumer,
  BackgroundTaskSchedulerService,
  buildEventJobId,
  EventConsumerRunnerService,
  type EventConsumer,
  EventQueueService,
  EventReplayService,
  EventWorkerService,
  OutboxDispatcherService,
  OutboxReconcilerService,
  OutboxService,
  PermanentEventError,
  SimulatedDispatcherCrashError,
} from './index';

jest.setTimeout(60_000);

const BASE_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://lms:lms_dev_password@localhost:55432/lms?schema=public';
const BASE_REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:56379';

function buildDatabaseUrl(baseUrl: string, dbName: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function buildRedisDbUrl(baseUrl: string, dbIndex: number): string {
  const url = new URL(baseUrl);
  url.pathname = `/${dbIndex}`;
  return url.toString();
}

async function waitFor(
  predicate: () => Promise<boolean>,
  timeoutMs = 8_000,
  intervalMs = 40,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

describe('P1-E Durable Event Bus & Audit Integration (Real PostgreSQL + Real Redis)', () => {
  const testDbName = `lms_test_p1e_${process.pid}`;
  const adminDbUrl = buildDatabaseUrl(BASE_DB_URL, 'postgres');
  const testDbUrl = buildDatabaseUrl(BASE_DB_URL, testDbName);
  const testRedisUrl = buildRedisDbUrl(BASE_REDIS_URL, 11);

  let prisma: PrismaService;
  let redisCleanup: Redis;
  let userAId: string;
  let workspaceAId: string;
  let workspaceBId: string;

  beforeAll(async () => {
    const adminClient = new Client({ connectionString: adminDbUrl });
    await adminClient.connect();
    try {
      await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`);
      await adminClient.query(`CREATE DATABASE "${testDbName}"`);
    } finally {
      await adminClient.end();
    }

    const migrationPath = resolve(
      __dirname,
      '../../../prisma/migrations/20261026000000_initial/migration.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf8');

    const schemaClient = new Client({ connectionString: testDbUrl });
    await schemaClient.connect();
    try {
      await schemaClient.query(migrationSql);
      await schemaClient.query(`
        CREATE TABLE "_TestDomainEffect" (
          "id" SERIAL PRIMARY KEY,
          "eventId" UUID NOT NULL,
          "consumer" VARCHAR(100) NOT NULL,
          "workspaceId" UUID,
          "detail" JSONB NOT NULL DEFAULT '{}',
          "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } finally {
      await schemaClient.end();
    }

    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: testDbUrl,
        max: 10,
        connectionTimeoutMillis: 5_000,
      }),
    });
    await client.$connect();
    prisma = client as unknown as PrismaService;

    redisCleanup = new Redis(testRedisUrl);
    await redisCleanup.flushdb();

    // Seed baseline user and two tenant workspaces for foreign-key integrity
    const userA = await prisma.user.create({
      data: {
        email: 'owner.p1e@example.test',
        name: 'P1E Owner',
        platformRole: 'STUDENT',
        status: 'ACTIVE',
      },
    });
    userAId = userA.id;

    const wsA = await prisma.workspace.create({
      data: {
        kind: 'ACADEMY',
        slug: 'p1e-academy-a',
        name: 'P1E Academy A',
        ownerId: userAId,
      },
    });
    workspaceAId = wsA.id;

    const wsB = await prisma.workspace.create({
      data: {
        kind: 'PERSONAL',
        slug: 'p1e-personal-b',
        name: 'P1E Personal B',
        ownerId: userAId,
      },
    });
    workspaceBId = wsB.id;
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "_TestDomainEffect", "EventReceipt", "OutboxEvent", "AuditLog" RESTART IDENTITY CASCADE`);
    await redisCleanup.flushdb();
  });

  afterAll(async () => {
    if (redisCleanup) {
      await redisCleanup.flushdb().catch(() => undefined);
      await redisCleanup.quit().catch(() => undefined);
    }
    if (prisma) {
      await prisma.$disconnect().catch(() => undefined);
    }
    const adminClient = new Client({ connectionString: adminDbUrl });
    await adminClient.connect();
    try {
      await adminClient.query(`DROP DATABASE IF EXISTS "${testDbName}" WITH (FORCE)`);
    } finally {
      await adminClient.end();
    }
  });

  async function countEffects(eventId: string, consumer?: string): Promise<number> {
    const rows = consumer
      ? await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count"
          FROM "_TestDomainEffect"
          WHERE "eventId" = ${eventId}::uuid AND "consumer" = ${consumer}
        `)
      : await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS "count"
          FROM "_TestDomainEffect"
          WHERE "eventId" = ${eventId}::uuid
        `);
    return Number(rows[0]?.count ?? 0n);
  }

  function createModule(
    consumers: readonly AnyEventConsumer[],
    prefixSuffix: string,
    extraOptions: Record<string, unknown> = {},
  ) {
    return Test.createTestingModule({
      imports: [
        WorkerAppModule.forRoot({
          includeInfrastructure: false,
          consumers,
          options: {
            redisUrl: testRedisUrl,
            queuePrefix: `lms_p1e_${process.pid}_${prefixSuffix}`,
            autoStart: false,
            leaseMs: 1_000,
            publishTimeoutMs: 2_000,
            dispatchBackoffMs: 40,
            dispatchBackoffMaxMs: 200,
            consumerAttempts: 3,
            consumerBackoffMs: 40,
            reconcileGraceMs: 200,
            ...extraOptions,
          },
          auditOptions: {
            ipHashSecret: 'p1e-integration-test-ip-hmac-secret',
            nodeEnv: 'test',
          },
        }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
  }

  it('commits or rolls back outbox and redacted audit records atomically, including global identity events before workspace creation and capability scrubbing', async () => {
    const preWorkspaceUserId = randomUUID();
    const consumer: EventConsumer<'identity.registered.v1'> = {
      name: 'notifications.identity-registered',
      eventTypes: ['identity.registered.v1'],
      handle: async (event, tx) => {
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'notifications.identity-registered', ${event.workspaceId}::uuid, ${JSON.stringify({ userId: event.payload.userId })}::jsonb)
        `;
      },
    };

    const mod = await createModule([consumer], 'atomic_global');
    const outbox = mod.get(OutboxService);
    const audit = mod.get(AuditService);
    const auditQuery = mod.get(AuditQueryService);
    const dispatcher = mod.get(OutboxDispatcherService);
    const runner = mod.get(EventConsumerRunnerService);

    // 1. Rolled-back transaction writes neither OutboxEvent nor AuditLog
    await expect(
      prisma.$transaction(async (tx) => {
        await outbox.append(tx, {
          type: 'identity.registered.v1',
          workspaceId: null,
          aggregateType: 'User',
          aggregateId: preWorkspaceUserId,
          payload: { userId: preWorkspaceUserId },
        });
        await audit.append(tx, {
          action: 'auth.register.failed',
          resourceType: 'User',
          resourceId: preWorkspaceUserId,
          actorId: null,
          workspaceId: null,
          requestId: 'req-rollback',
          changes: { password: 'plaintext-password' },
        });
        throw new Error('Abort domain transaction');
      }),
    ).rejects.toThrow('Abort domain transaction');

    expect(await prisma.outboxEvent.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);

    // 2. Committed transaction writes global event (workspaceId: null) + envelope-encrypted mailCapability + redacted AuditLog
    const appended = await prisma.$transaction(async (tx) => {
      const evt = await outbox.append(tx, {
        type: 'identity.registered.v1',
        workspaceId: null,
        aggregateType: 'User',
        aggregateId: preWorkspaceUserId,
        payload: {
          userId: preWorkspaceUserId,
          mailCapability: {
            keyId: 'v1',
            ciphertext: 'encrypted-verification-token',
            expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          },
        },
      });
      await audit.append(tx, {
        action: 'auth.registered',
        resourceType: 'User',
        resourceId: preWorkspaceUserId,
        actorId: null,
        workspaceId: null,
        requestId: 'req-commit-global',
        ip: '198.51.100.42',
        changes: {
          onboardingMode: 'STUDENT',
          passwordHash: 'argon2-secret-hash',
          signedLink: 'https://lms.local/verify?token=one-time-token',
        },
      });
      return evt;
    });

    const cycle = await dispatcher.dispatchOnce();
    expect(cycle.leased).toBe(1);
    expect(cycle.published).toBe(1);
    expect(cycle.jobIds).toEqual([buildEventJobId(appended.id, consumer.name)]);

    const outcome = await runner.deliver({
      eventId: appended.id,
      consumer: consumer.name,
    });
    expect(outcome).toBe('processed');

    // Receipt must copy exact null workspace scope
    const receipt = await prisma.eventReceipt.findUnique({
      where: {
        eventId_consumer: {
          eventId: appended.id,
          consumer: consumer.name,
        },
      },
    });
    expect(receipt).not.toBeNull();
    expect(receipt?.workspaceId).toBeNull();
    expect(await countEffects(appended.id, consumer.name)).toBe(1);

    // Scrub mail capability inside a transaction and verify it is removed while envelope still validates
    const scrubbed = await prisma.$transaction((tx) =>
      outbox.scrubMailCapability(tx, appended.id),
    );
    expect(scrubbed).toBe(true);
    const updatedEvent = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: appended.id },
    });
    expect(updatedEvent.payload).toEqual({ userId: preWorkspaceUserId });

    // Verify AuditLog persisted with redacted secrets/links and queryable under global scope
    const globalAudits = await auditQuery.list({ kind: 'global' }, { limit: 10 });
    expect(globalAudits.items).toHaveLength(1);
    expect(globalAudits.items[0]?.changes).toEqual({
      onboardingMode: 'STUDENT',
      passwordHash: REDACTED,
      signedLink: `https://lms.local/verify?${REDACTED}`,
    });

    await mod.close();
  });

  it('survives crash-between-publish-and-mark with at-least-once delivery and exactly one domain side effect per receipt', async () => {
    const orderId = randomUUID();
    const consumer: EventConsumer<'order.paid.v1'> = {
      name: 'fulfillment.order-paid',
      eventTypes: ['order.paid.v1'],
      handle: async (event, tx) => {
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'fulfillment.order-paid', ${event.workspaceId}::uuid, ${JSON.stringify(event.payload)}::jsonb)
        `;
      },
    };

    const mod = await createModule([consumer], 'crash_between', { leaseMs: 300 });
    const outbox = mod.get(OutboxService);
    const dispatcher = mod.get(OutboxDispatcherService);
    const worker = mod.get(EventWorkerService);

    await worker.start();

    const appended = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'order.paid.v1',
        workspaceId: workspaceAId,
        aggregateType: 'Order',
        aggregateId: orderId,
        payload: { orderId },
      }),
    );

    // Inject crash AFTER BullMQ job is published to Redis but BEFORE OutboxEvent is marked PUBLISHED
    let crashedOnce = false;
    dispatcher.setBeforeMarkPublishedHook(() => {
      if (!crashedOnce) {
        crashedOnce = true;
        throw new SimulatedDispatcherCrashError('Process killed right after BullMQ publish');
      }
    });

    await expect(dispatcher.dispatchOnce()).rejects.toThrow(SimulatedDispatcherCrashError);

    // Outbox row is still PROCESSING (never marked PUBLISHED), yet the BullMQ job IS in Redis
    const afterCrash = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: appended.id } });
    expect(afterCrash.status).toBe('PROCESSING');
    expect(afterCrash.publishedAt).toBeNull();

    // Worker processes the published job from Redis and commits the receipt + domain side effect
    await waitFor(async () => (await countEffects(appended.id, consumer.name)) === 1);

    // Now the lease expires; a subsequent dispatcher run re-leases the stuck PROCESSING row and marks PUBLISHED
    dispatcher.setBeforeMarkPublishedHook(null);
    const futureNow = new Date(Date.now() + 1_000);
    const recoveryCycle = await dispatcher.dispatchOnce(futureNow);
    expect(recoveryCycle.leased).toBe(1);
    expect(recoveryCycle.published).toBe(1);

    const finalEvent = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: appended.id } });
    expect(finalEvent.status).toBe('PUBLISHED');
    expect(finalEvent.publishedAt).not.toBeNull();
    expect(finalEvent.lockedUntil).toBeNull();

    // Even if the worker receives a duplicate delivery after recovery, the receipt guarantees one effect
    const duplicateOutcome = await mod.get(EventConsumerRunnerService).deliver({
      eventId: appended.id,
      consumer: consumer.name,
    });
    expect(duplicateOutcome).toBe('duplicate');
    expect(await countEffects(appended.id, consumer.name)).toBe(1);
    expect(
      await prisma.eventReceipt.count({
        where: { eventId: appended.id, consumer: consumer.name },
      }),
    ).toBe(1);

    await mod.close();
  });

  it('prevents duplicate side effects under concurrent duplicate deliveries, competing workers and SKIP LOCKED dispatchers', async () => {
    const consumer: EventConsumer<'course.published.v1'> = {
      name: 'catalog.course-published',
      eventTypes: ['course.published.v1'],
      handle: async (event, tx) => {
        // Small delay inside transaction to maximize overlap between racing workers
        await new Promise((r) => setTimeout(r, 30));
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'catalog.course-published', ${event.workspaceId}::uuid, ${JSON.stringify(event.payload)}::jsonb)
        `;
      },
    };

    const mod = await createModule([consumer], 'competing_workers', {
      dispatchBatchSize: 5,
    });
    const outbox = mod.get(OutboxService);
    const dispatcher = mod.get(OutboxDispatcherService);
    const runner = mod.get(EventConsumerRunnerService);
    const workerService = mod.get(EventWorkerService);

    // 1. Race 6 concurrent deliveries of the SAME (eventId, consumer) directly against PostgreSQL
    const singleCourseId = randomUUID();
    const singleEvent = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'course.published.v1',
        workspaceId: workspaceAId,
        aggregateType: 'Course',
        aggregateId: singleCourseId,
        payload: { courseId: singleCourseId },
      }),
    );

    const raceOutcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        runner.deliver({
          eventId: singleEvent.id,
          consumer: consumer.name,
          attempt: 1,
          jobId: `race-${i}`,
        }),
      ),
    );

    expect(raceOutcomes.filter((o) => o === 'processed')).toHaveLength(1);
    expect(raceOutcomes.filter((o) => o === 'duplicate')).toHaveLength(5);
    expect(await countEffects(singleEvent.id, consumer.name)).toBe(1);

    // 2. Append 12 more events and race 3 concurrent dispatchOnce calls (FOR UPDATE SKIP LOCKED) + 3 competing BullMQ workers
    await workerService.spawnWorker(4);
    await workerService.spawnWorker(4);
    await workerService.spawnWorker(4);

    const batchEvents = await prisma.$transaction((tx) =>
      outbox.appendMany(
        tx,
        Array.from({ length: 12 }, () => {
          const courseId = randomUUID();
          return {
            type: 'course.published.v1' as const,
            workspaceId: workspaceAId,
            aggregateType: 'Course',
            aggregateId: courseId,
            payload: { courseId },
          };
        }),
      ),
    );

    const [d1, d2, d3] = await Promise.all([
      dispatcher.dispatchOnce(),
      dispatcher.dispatchOnce(),
      dispatcher.dispatchOnce(),
    ]);

    // Total leased across the 3 concurrent dispatchers must equal 13 (1 earlier + 12 new) with zero double-leasing
    expect(d1.leased + d2.leased + d3.leased).toBe(13);

    await waitFor(async () => {
      const counts = await Promise.all(
        batchEvents.map((e) => countEffects(e.id, consumer.name)),
      );
      return counts.every((c) => c === 1);
    });

    for (const evt of batchEvents) {
      expect(await countEffects(evt.id, consumer.name)).toBe(1);
      const receipt = await prisma.eventReceipt.findUnique({
        where: { eventId_consumer: { eventId: evt.id, consumer: consumer.name } },
      });
      expect(receipt?.workspaceId).toBe(workspaceAId);
    }

    await mod.close();
  });

  it('recovers lost leases, retries transient failures, isolates independent consumers on dead-letter and replays with receipts respected and audited', async () => {
    let flakyShouldFail = true;
    let flakyAttempts = 0;

    // Consumer 1 always succeeds immediately
    const healthyConsumer: EventConsumer<'enrollment.granted.v1'> = {
      name: 'learning.enrollment-granted-audit',
      eventTypes: ['enrollment.granted.v1'],
      handle: async (event, tx) => {
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'learning.enrollment-granted-audit', ${event.workspaceId}::uuid, ${JSON.stringify(event.payload)}::jsonb)
        `;
      },
    };

    // Consumer 2 writes inside tx and then throws while flakyShouldFail=true (proving tx rollback of both effect and receipt!)
    const flakyConsumer: EventConsumer<'enrollment.granted.v1'> = {
      name: 'notifications.enrollment-welcome',
      eventTypes: ['enrollment.granted.v1'],
      maxAttempts: 2,
      handle: async (event, tx) => {
        flakyAttempts += 1;
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'notifications.enrollment-welcome', ${event.workspaceId}::uuid, ${JSON.stringify(event.payload)}::jsonb)
        `;
        if (flakyShouldFail) {
          throw new Error(
            'SMTP downstream unavailable with https://mail.local/send?signature=secret123',
          );
        }
      },
    };

    const mod = await createModule([healthyConsumer, flakyConsumer], 'retry_dead_replay', {
      consumerAttempts: 2,
      consumerBackoffMs: 30,
      leaseMs: 250,
    });
    const outbox = mod.get(OutboxService);
    const dispatcher = mod.get(OutboxDispatcherService);
    const worker = mod.get(EventWorkerService);
    const replayService = mod.get(EventReplayService);
    const auditQuery = mod.get(AuditQueryService);

    const enrollmentId = randomUUID();
    const grantId = randomUUID();
    const appended = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'enrollment.granted.v1',
        workspaceId: workspaceAId,
        aggregateType: 'Enrollment',
        aggregateId: enrollmentId,
        payload: { enrollmentId, grantId },
      }),
    );

    // 1. Simulate a lost lease: row is leased by a dead dispatcher whose lockedUntil is now in the past
    const pastLease = new Date(Date.now() - 5_000);
    await prisma.outboxEvent.update({
      where: { id: appended.id },
      data: { status: 'PROCESSING', lockedUntil: pastLease, attempts: 1 },
    });

    await worker.start();
    const leasedAfterExpiry = await dispatcher.dispatchOnce();
    expect(leasedAfterExpiry.leased).toBe(1);
    expect(leasedAfterExpiry.published).toBe(1);

    // Wait for healthyConsumer to succeed and flakyConsumer to exhaust its 2 attempts and dead-letter the event
    await waitFor(async () => {
      const row = await prisma.outboxEvent.findUnique({ where: { id: appended.id } });
      const healthyCount = await countEffects(appended.id, healthyConsumer.name);
      return row?.status === 'DEAD' && healthyCount === 1;
    });

    expect(flakyAttempts).toBe(2);
    // Because flakyConsumer threw after inserting into _TestDomainEffect inside tx, its effect & receipt were rolled back!
    expect(await countEffects(appended.id, flakyConsumer.name)).toBe(0);
    // Meanwhile healthyConsumer's independent receipt & effect succeeded!
    expect(await countEffects(appended.id, healthyConsumer.name)).toBe(1);

    const deadRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: appended.id } });
    expect(deadRow.status).toBe('DEAD');
    expect(deadRow.lastError).toContain('[notifications.enrollment-welcome]');
    // Signed link inside error message must be redacted
    expect(deadRow.lastError).not.toContain('secret123');
    expect(deadRow.lastError).toContain(REDACTED);

    // 2. Operations projection omits payload and validates against @lms/shared operationsEventsResponseSchema
    const opsProjected = await replayService.listProjected(
      { kind: 'workspace', workspaceId: workspaceAId },
      { status: 'DEAD' },
    );
    const parsedOps = operationsEventsResponseSchema.parse(opsProjected);
    expect(parsedOps.data).toHaveLength(1);
    expect(parsedOps.data[0]?.id).toBe(appended.id);
    expect(parsedOps.data[0]?.errorCode).toBe(
      'CONSUMER_FAILED:notifications.enrollment-welcome',
    );
    expect('payload' in (parsedOps.data[0] ?? {})).toBe(false);

    // 3. Cross-tenant replay attempt returns 404 NotFoundException
    await expect(
      replayService.replay(appended.id, {
        actorId: userAId,
        scope: { kind: 'workspace', workspaceId: workspaceBId },
        reason: 'Cross-tenant replay attempt',
        requestId: 'req-cross-tenant',
      }),
    ).rejects.toThrow(NotFoundException);

    // 4. Fix downstream and replay as Workspace A admin
    flakyShouldFail = false;
    const replayResult = await replayService.replay(appended.id, {
      actorId: userAId,
      scope: { kind: 'workspace', workspaceId: workspaceAId },
      reason: 'SMTP restored; replaying dead event',
      requestId: 'req-replay-1',
      ip: '192.0.2.55',
    });

    expect(replayResult).toEqual({
      operationId: appended.id,
      status: 'PENDING',
      eventId: appended.id,
      preservedConsumers: ['learning.enrollment-granted-audit'],
    });

    // Replaying an already PENDING event returns 409 ConflictException
    await expect(
      replayService.replay(appended.id, {
        actorId: userAId,
        scope: { kind: 'workspace', workspaceId: workspaceAId },
        reason: 'Duplicate replay while pending',
        requestId: 'req-replay-dup',
      }),
    ).rejects.toThrow(ConflictException);

    // Dispatch the replayed event: only the missing consumer (flakyConsumer) is enqueued and executed
    const replayDispatch = await dispatcher.dispatchOnce();
    expect(replayDispatch.leased).toBe(1);
    expect(replayDispatch.published).toBe(1);
    expect(replayDispatch.jobIds).toEqual([buildEventJobId(appended.id, flakyConsumer.name)]);

    await waitFor(async () => (await countEffects(appended.id, flakyConsumer.name)) === 1);

    // healthyConsumer was NOT re-executed (still 1 effect), and flakyConsumer now has 1 committed effect
    expect(await countEffects(appended.id, healthyConsumer.name)).toBe(1);
    expect(await countEffects(appended.id, flakyConsumer.name)).toBe(1);

    // Verify AuditLog was written for the replay action
    const auditPage = await auditQuery.list(
      { kind: 'workspace', workspaceId: workspaceAId },
      { action: 'events.replay' },
    );
    expect(auditPage.items).toHaveLength(1);
    expect(auditPage.items[0]?.resourceId).toBe(appended.id);
    expect(auditPage.items[0]?.actorId).toBe(userAId);

    // Global events cannot be replayed by a workspace admin (returns 404)
    const globalDead = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'identity.email-verified.v1',
        workspaceId: null,
        aggregateType: 'User',
        aggregateId: userAId,
        payload: { userId: userAId },
      }),
    );
    await prisma.outboxEvent.update({
      where: { id: globalDead.id },
      data: { status: 'DEAD', lastError: 'failed' },
    });
    await expect(
      replayService.replay(globalDead.id, {
        actorId: userAId,
        scope: { kind: 'workspace', workspaceId: workspaceAId },
        reason: 'Workspace admin trying global replay',
        requestId: 'req-global-forbidden',
      }),
    ).rejects.toThrow(NotFoundException);

    // Non-allowlisted business event type returns 403 ForbiddenException for workspace admin
    const restrictedMod = await createModule([], 'restricted_replay', {
      workspaceReplayableTypes: ['course.published.v1'],
    });
    const restrictedReplay = restrictedMod.get(EventReplayService);
    await prisma.outboxEvent.update({
      where: { id: appended.id },
      data: { status: 'DEAD', lastError: 'failed again' },
    });
    await expect(
      restrictedReplay.replay(appended.id, {
        actorId: userAId,
        scope: { kind: 'workspace', workspaceId: workspaceAId },
        reason: 'Disallowed type for workspace admin',
        requestId: 'req-type-forbidden',
      }),
    ).rejects.toThrow(ForbiddenException);

    await restrictedMod.close();
    await mod.close();
  });

  it('recovers from Redis publish failures AND from Redis queue loss after PUBLISHED via OutboxReconcilerService', async () => {
    const consumer: EventConsumer<'certificate.issued.v1'> = {
      name: 'certificates.render-pdf',
      eventTypes: ['certificate.issued.v1'],
      handle: async (event, tx) => {
        await tx.$executeRaw`
          INSERT INTO "_TestDomainEffect" ("eventId", "consumer", "workspaceId", "detail")
          VALUES (${event.id}::uuid, 'certificates.render-pdf', ${event.workspaceId}::uuid, ${JSON.stringify(event.payload)}::jsonb)
        `;
      },
    };

    const mod = await createModule([consumer], 'redis_recovery', {
      reconcileGraceMs: 100,
      dispatchBackoffMs: 20,
      dispatchBackoffMaxMs: 50,
    });
    const outbox = mod.get(OutboxService);
    const queue = mod.get(EventQueueService);
    const dispatcher = mod.get(OutboxDispatcherService);
    const reconciler = mod.get(OutboxReconcilerService);
    const worker = mod.get(EventWorkerService);

    const certId1 = randomUUID();
    const event1 = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'certificate.issued.v1',
        workspaceId: workspaceAId,
        aggregateType: 'Certificate',
        aggregateId: certId1,
        payload: { certificateId: certId1 },
      }),
    );

    // Part A: Redis is down during publish -> dispatcher releases lease to PENDING with backoff
    queue.setPublishFaultHook(() => {
      throw new Error('ECONNREFUSED 127.0.0.1:56379');
    });

    const failedCycle = await dispatcher.dispatchOnce();
    expect(failedCycle.leased).toBe(1);
    expect(failedCycle.published).toBe(0);
    expect(failedCycle.retried).toBe(1);

    const afterOutage = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event1.id } });
    expect(afterOutage.status).toBe('PENDING');
    expect(afterOutage.lockedUntil).toBeNull();
    expect(afterOutage.attempts).toBe(1);
    expect(afterOutage.lastError).toContain('ECONNREFUSED');

    // Redis recovers; dispatch after backoff publishes and worker processes
    queue.setPublishFaultHook(null);
    await worker.start();
    const afterBackoff = new Date(Date.now() + 500);
    const recoveredCycle = await dispatcher.dispatchOnce(afterBackoff);
    expect(recoveredCycle.leased).toBe(1);
    expect(recoveredCycle.published).toBe(1);

    await waitFor(async () => (await countEffects(event1.id, consumer.name)) === 1);

    // Part B: Event is published to Redis and marked PUBLISHED in DB, then Redis loses ALL keys before worker runs!
    await worker.stop();
    const certId2 = randomUUID();
    const event2 = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'certificate.issued.v1',
        workspaceId: workspaceAId,
        aggregateType: 'Certificate',
        aggregateId: certId2,
        payload: { certificateId: certId2 },
      }),
    );

    await dispatcher.dispatchOnce();
    const publishedRow = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event2.id } });
    expect(publishedRow.status).toBe('PUBLISHED');

    // Simulate total Redis memory loss (FLUSHDB) while worker was stopped
    await redisCleanup.flushdb();

    // OutboxReconcilerService detects that event2 is PUBLISHED > reconcileGraceMs ago with no EventReceipt
    const reconcileTime = new Date(Date.now() + 500);
    const reconcileResult = await reconciler.reconcileOnce(reconcileTime);
    expect(reconcileResult.incompletePublishedRequeued).toBe(1);
    expect(reconcileResult.requeuedEventIds).toEqual([event2.id]);

    // Dispatcher re-publishes the missing job and worker processes it once
    await worker.start();
    const redispCycle = await dispatcher.dispatchOnce(reconcileTime);
    expect(redispCycle.leased).toBe(1);
    expect(redispCycle.published).toBe(1);

    await waitFor(async () => (await countEffects(event2.id, consumer.name)) === 1);
    expect(await countEffects(event1.id, consumer.name)).toBe(1);
    expect(await countEffects(event2.id, consumer.name)).toBe(1);

    await mod.close();
  });

  it('handles permanent consumer errors without retry, schedules business-keyed tasks and boots standalone worker context', async () => {
    let permanentCalls = 0;
    const permanentConsumer: EventConsumer<'assessment.submitted.v1'> = {
      name: 'assessments.permanent-failure-test',
      eventTypes: ['assessment.submitted.v1'],
      maxAttempts: 5,
      handle: async () => {
        permanentCalls += 1;
        throw new PermanentEventError('Immutable version invariant violated');
      },
    };

    const executedTasks: string[] = [];
    const deadlinePayloadSchema = z.strictObject({ attemptId: z.uuid() });

    const prevDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDbUrl;
    process.env.S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID ?? 'lms_minio';
    process.env.S3_SECRET_ACCESS_KEY =
      process.env.S3_SECRET_ACCESS_KEY ?? 'lms_minio_dev_password';
    process.env.JWT_ACCESS_SECRET =
      process.env.JWT_ACCESS_SECRET ??
      'test-jwt-access-secret-at-least-32-characters-long';
    process.env.JWT_REFRESH_SECRET =
      process.env.JWT_REFRESH_SECRET ??
      'test-jwt-refresh-secret-at-least-32-characters-long';

    let workerCtx;
    try {
      workerCtx = await createWorkerContext({
        consumers: [permanentConsumer],
        tasks: [
          {
            name: 'assessments.attempt-deadline',
            payloadSchema: deadlinePayloadSchema,
            everyMs: 60_000,
            handle: async (payload, context) => {
              executedTasks.push(`${context.taskName}:${context.businessKey}:${payload.attemptId}`);
            },
          },
        ],
        options: {
          redisUrl: testRedisUrl,
          queuePrefix: `lms_p1e_${process.pid}_standalone`,
          autoStart: false,
          consumerAttempts: 5,
          consumerBackoffMs: 30,
        },
        auditOptions: {
          ipHashSecret: 'standalone-worker-hmac-secret',
          nodeEnv: 'test',
        },
      });
    } finally {
      if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
    }

    const outbox = workerCtx.get(OutboxService);
    const dispatcher = workerCtx.get(OutboxDispatcherService);
    const eventWorker = workerCtx.get(EventWorkerService);
    const taskScheduler = workerCtx.get(BackgroundTaskSchedulerService);

    await eventWorker.start();
    await taskScheduler.start();

    const attemptId = randomUUID();
    const evt = await prisma.$transaction((tx) =>
      outbox.append(tx, {
        type: 'assessment.submitted.v1',
        workspaceId: workspaceAId,
        aggregateType: 'AssessmentAttempt',
        aggregateId: attemptId,
        payload: { attemptId },
      }),
    );

    await dispatcher.dispatchOnce();
    await waitFor(async () => {
      const row = await prisma.outboxEvent.findUnique({ where: { id: evt.id } });
      return row?.status === 'DEAD';
    });

    // PermanentEventError dead-letters on attempt 1 without running attempts 2..5
    expect(permanentCalls).toBe(1);

    // Schedule a background task with a stable business key and verify execution
    const scheduled = await taskScheduler.schedule({
      taskName: 'assessments.attempt-deadline',
      businessKey: `attempt:${attemptId}`,
      payload: { attemptId },
    });
    expect(scheduled.jobId).toBe(`task__assessments.attempt-deadline__attempt_c_${attemptId}`);

    await waitFor(async () => executedTasks.length === 1);
    expect(executedTasks[0]).toBe(
      `assessments.attempt-deadline:attempt:${attemptId}:${attemptId}`,
    );

    await workerCtx.close();
  });
});
