import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, type OutboxStatus } from '@prisma/client';
import type { DomainEvent } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { redactString } from '../audit/redaction';
import { EventConsumerRegistry } from './consumer-registry';
import type { EventContracts } from './event-contracts';
import { EventQueueService } from './event-queue.service';
import {
  EVENT_CONTRACTS,
  EVENTS_OPTIONS,
  MAX_LAST_ERROR_LENGTH,
  type EventsOptions,
} from './events.options';
import { jitteredBackoff } from './redis-connection';

export interface LeasedOutboxRow {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly type: string;
  readonly schemaVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: Prisma.JsonValue;
  readonly status: OutboxStatus;
  readonly sequence: bigint;
  readonly availableAt: Date;
  readonly attempts: number;
  readonly lockedUntil: Date | null;
  readonly publishedAt: Date | null;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DispatchCycleResult {
  readonly leased: number;
  readonly published: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly jobIds: readonly string[];
}

export type BeforeMarkPublishedHook = (
  event: DomainEvent,
  jobIds: readonly string[],
) => Promise<void> | void;

/**
 * Thrown by test hooks in `beforeMarkPublished` to simulate an abrupt process crash after BullMQ jobs
 * were enqueued but before the outbox row was marked `PUBLISHED`. Unlike a publish error, a simulated
 * crash leaves the row in `PROCESSING` until its lease expires.
 */
export class SimulatedDispatcherCrashError extends Error {
  override readonly name = 'SimulatedDispatcherCrashError';
}

/**
 * Polls `"OutboxEvent"` with `FOR UPDATE SKIP LOCKED`, publishes deterministic per-consumer BullMQ jobs,
 * and marks rows `PUBLISHED`. Safe under multiple competing dispatcher instances.
 */
@Injectable()
export class OutboxDispatcherService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<DispatchCycleResult> | null = null;
  private running = false;
  private beforeMarkPublishedHook: BeforeMarkPublishedHook | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_CONTRACTS) private readonly contracts: EventContracts,
    private readonly registry: EventConsumerRegistry,
    private readonly queue: EventQueueService,
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.autoStart) {
      this.start();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  /** Test hook invoked after BullMQ publish succeeds and right before the DB row is marked PUBLISHED. */
  setBeforeMarkPublishedHook(hook: BeforeMarkPublishedHook | null): void {
    this.beforeMarkPublishedHook = hook;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.options.dispatchIntervalMs);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight.catch(() => undefined);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private async tick(): Promise<DispatchCycleResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.dispatchOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /**
   * Atomically leases up to `batchSize` eligible outbox rows using `FOR UPDATE SKIP LOCKED`.
   * Eligible rows are either:
   * - `PENDING` with `availableAt <= now`, or
   * - `PROCESSING` whose lease (`lockedUntil`) has expired (`lockedUntil <= now`).
   */
  async leaseBatch(
    now: Date = new Date(),
    batchSize: number = this.options.dispatchBatchSize,
  ): Promise<LeasedOutboxRow[]> {
    const lockedUntil = new Date(now.getTime() + this.options.leaseMs);
    const rows = await this.prisma.$queryRaw<LeasedOutboxRow[]>(Prisma.sql`
      WITH "candidates" AS (
        SELECT "id"
        FROM "OutboxEvent"
        WHERE (
          ("status" = 'PENDING'::"OutboxStatus" AND "availableAt" <= ${now})
          OR ("status" = 'PROCESSING'::"OutboxStatus" AND "lockedUntil" IS NOT NULL AND "lockedUntil" <= ${now})
        )
        ORDER BY "sequence" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent" AS e
      SET
        "status" = 'PROCESSING'::"OutboxStatus",
        "lockedUntil" = ${lockedUntil},
        "attempts" = e."attempts" + 1,
        "updatedAt" = ${now}
      FROM "candidates"
      WHERE e."id" = "candidates"."id"
      RETURNING
        e."id",
        e."workspaceId",
        e."type",
        e."schemaVersion",
        e."aggregateType",
        e."aggregateId",
        e."payload",
        e."status",
        e."sequence",
        e."availableAt",
        e."attempts",
        e."lockedUntil",
        e."publishedAt",
        e."lastError",
        e."createdAt",
        e."updatedAt"
    `);

    return [...rows].sort((a, b) => {
      const seqA = BigInt(a.sequence);
      const seqB = BigInt(b.sequence);
      return seqA < seqB ? -1 : seqA > seqB ? 1 : 0;
    });
  }

  /** Leases one batch and publishes BullMQ jobs for all subscribed consumers without receipts. */
  async dispatchOnce(now: Date = new Date()): Promise<DispatchCycleResult> {
    const leasedRows = await this.leaseBatch(now, this.options.dispatchBatchSize);
    let published = 0;
    let retried = 0;
    let deadLettered = 0;
    const jobIds: string[] = [];

    for (const row of leasedRows) {
      const validation = this.contracts.validateEnvelope({
        id: row.id,
        workspaceId: row.workspaceId,
        type: row.type,
        schemaVersion: row.schemaVersion,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        sequence: row.sequence.toString(),
        timestamp: row.createdAt.toISOString(),
        payload: row.payload,
      });

      if (!validation.ok) {
        const reason = redactString(
          `Envelope validation failed: ${validation.issues.join('; ')}`,
          MAX_LAST_ERROR_LENGTH,
        );
        await this.prisma.outboxEvent.update({
          where: { id: row.id },
          data: {
            status: 'DEAD',
            lockedUntil: null,
            lastError: reason,
          },
        });
        deadLettered += 1;
        continue;
      }

      const consumers = this.registry.forType(row.type);
      const existingReceipts =
        consumers.length > 0
          ? await this.prisma.eventReceipt.findMany({
              where: { eventId: row.id },
              select: { consumer: true },
            })
          : [];
      const receiptSet = new Set(existingReceipts.map((r) => r.consumer));
      const pendingConsumers = consumers.filter((c) => !receiptSet.has(c.name));

      try {
        const rowJobIds: string[] = [];
        for (const consumer of pendingConsumers) {
          const jobId = await this.queue.publishConsumerJob(
            {
              eventId: row.id,
              consumer: consumer.name,
              type: validation.event.type,
              workspaceId: row.workspaceId,
              sequence: row.sequence.toString(),
            },
            { maxAttempts: consumer.maxAttempts ?? this.options.consumerAttempts },
          );
          rowJobIds.push(jobId);
        }

        if (this.beforeMarkPublishedHook) {
          await this.beforeMarkPublishedHook(validation.event, rowJobIds);
        }

        await this.prisma.outboxEvent.updateMany({
          where: {
            id: row.id,
            status: { in: ['PROCESSING', 'PENDING'] },
          },
          data: {
            status: 'PUBLISHED',
            publishedAt: row.publishedAt ?? now,
            lockedUntil: null,
            lastError: null,
          },
        });

        jobIds.push(...rowJobIds);
        published += 1;
      } catch (error) {
        if (error instanceof SimulatedDispatcherCrashError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        const delayMs = jitteredBackoff(
          row.attempts,
          this.options.dispatchBackoffMs,
          this.options.dispatchBackoffMaxMs,
        );
        const nextAvailableAt = new Date(now.getTime() + delayMs);
        await this.prisma.outboxEvent.updateMany({
          where: {
            id: row.id,
            status: 'PROCESSING',
          },
          data: {
            status: 'PENDING',
            lockedUntil: null,
            availableAt: nextAvailableAt,
            lastError: redactString(`Dispatch failed: ${message}`, MAX_LAST_ERROR_LENGTH),
          },
        });
        retried += 1;
      }
    }

    return {
      leased: leasedRows.length,
      published,
      retried,
      deadLettered,
      jobIds,
    };
  }

  /** Runs dispatch cycles until no more eligible rows are leased or `maxCycles` is reached. */
  async drain(maxCycles = 25, now?: Date): Promise<DispatchCycleResult> {
    let leased = 0;
    let published = 0;
    let retried = 0;
    let deadLettered = 0;
    const jobIds: string[] = [];

    for (let i = 0; i < maxCycles; i += 1) {
      const cycle = await this.dispatchOnce(now ?? new Date());
      leased += cycle.leased;
      published += cycle.published;
      retried += cycle.retried;
      deadLettered += cycle.deadLettered;
      jobIds.push(...cycle.jobIds);
      if (cycle.leased === 0 || cycle.retried > 0) break;
    }

    return { leased, published, retried, deadLettered, jobIds };
  }
}
