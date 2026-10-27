import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { EventConsumerRegistry } from './consumer-registry';
import { EVENTS_OPTIONS, type EventsOptions } from './events.options';

export interface ReconcileResult {
  readonly expiredLeasesRecovered: number;
  readonly incompletePublishedRequeued: number;
  readonly requeuedEventIds: readonly string[];
}

/**
 * Backstop database reconciler for the durable outbox (ARCHITECTURE §2, §7).
 *
 * 1. Recovers expired `PROCESSING` dispatcher leases back to `PENDING`.
 * 2. Scans `PUBLISHED` events older than `reconcileGraceMs` (within `reconcileLookbackMs`) and checks
 *    that every registered consumer for the event's `type` has committed an `EventReceipt`. If Redis lost
 *    state after the row was marked `PUBLISHED`, any event with missing receipts is moved back to `PENDING`
 *    so the dispatcher re-enqueues only the missing consumer jobs.
 */
@Injectable()
export class OutboxReconcilerService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<ReconcileResult> | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: EventConsumerRegistry,
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

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      void this.tick().catch(() => undefined);
    }, this.options.reconcileIntervalMs);
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

  private async tick(): Promise<ReconcileResult> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.reconcileOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async reconcileOnce(now: Date = new Date()): Promise<ReconcileResult> {
    const expiredUpdate = await this.prisma.outboxEvent.updateMany({
      where: {
        status: 'PROCESSING',
        lockedUntil: { lte: now },
      },
      data: {
        status: 'PENDING',
        lockedUntil: null,
        availableAt: now,
      },
    });

    const subscribedTypes = this.registry.subscribedTypes();
    if (subscribedTypes.length === 0) {
      return {
        expiredLeasesRecovered: expiredUpdate.count,
        incompletePublishedRequeued: 0,
        requeuedEventIds: [],
      };
    }

    const publishedBefore = new Date(now.getTime() - this.options.reconcileGraceMs);
    const createdSince = new Date(now.getTime() - this.options.reconcileLookbackMs);

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: 'PUBLISHED',
        type: { in: [...subscribedTypes] },
        publishedAt: { lte: publishedBefore },
        createdAt: { gte: createdSince },
      },
      orderBy: { sequence: 'asc' },
      take: this.options.reconcileBatchSize,
      select: {
        id: true,
        type: true,
        receipts: {
          select: { consumer: true },
        },
      },
    });

    const requeuedEventIds: string[] = [];
    for (const candidate of candidates) {
      const consumers = this.registry.forType(candidate.type);
      if (consumers.length === 0) continue;
      const received = new Set(candidate.receipts.map((r) => r.consumer));
      const missing = consumers.some((c) => !received.has(c.name));
      if (!missing) continue;

      const updated = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: 'PUBLISHED',
        },
        data: {
          status: 'PENDING',
          availableAt: now,
          lockedUntil: null,
        },
      });
      if (updated.count > 0) {
        requeuedEventIds.push(candidate.id);
      }
    }

    return {
      expiredLeasesRecovered: expiredUpdate.count,
      incompletePublishedRequeued: requeuedEventIds.length,
      requeuedEventIds,
    };
  }
}
