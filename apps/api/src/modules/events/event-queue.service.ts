import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { EventType } from '@lms/shared';
import {
  CONSUMER_NAME_MAX,
  CONSUMER_NAME_PATTERN,
  DOMAIN_EVENTS_QUEUE,
  EVENTS_OPTIONS,
  type EventsOptions,
} from './events.options';
import { redisConnectionFromUrl, withTimeout } from './redis-connection';

export interface DomainEventJobData {
  readonly eventId: string;
  readonly consumer: string;
  readonly type: EventType;
  readonly workspaceId: string | null;
  readonly sequence: string;
}

export interface PublishConsumerJobOptions {
  readonly maxAttempts?: number;
}

export type PublishFaultHook = (job: DomainEventJobData, jobId: string) => Promise<void> | void;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deterministic BullMQ job ID for an `(eventId, consumer)` pair.
 * BullMQ custom IDs cannot contain `:`, so `__` separates components.
 */
export function buildEventJobId(eventId: string, consumer: string): string {
  if (!UUID_PATTERN.test(eventId)) {
    throw new Error(`Invalid eventId for job ID: ${eventId}`);
  }
  if (!CONSUMER_NAME_PATTERN.test(consumer) || consumer.length > CONSUMER_NAME_MAX) {
    throw new Error(`Invalid consumer name for job ID: ${consumer}`);
  }
  return `event__${eventId.toLowerCase()}__${consumer}`;
}

/**
 * BullMQ producer queue for durable domain events. Lazily connects when first publishing so HTTP-only
 * modules that never dispatch do not open unnecessary Redis connections.
 */
@Injectable()
export class EventQueueService implements OnModuleDestroy {
  private queueInstance: Queue<DomainEventJobData> | null = null;
  private faultHook: PublishFaultHook | null = null;

  constructor(@Inject(EVENTS_OPTIONS) private readonly options: EventsOptions) {}

  /** Test hook to simulate Redis failures or timeouts during publish. */
  setPublishFaultHook(hook: PublishFaultHook | null): void {
    this.faultHook = hook;
  }

  getQueue(): Queue<DomainEventJobData> {
    if (!this.queueInstance) {
      const queue = new Queue<DomainEventJobData>(DOMAIN_EVENTS_QUEUE, {
        prefix: this.options.queuePrefix,
        connection: redisConnectionFromUrl(this.options.redisUrl, 'producer'),
        defaultJobOptions: {
          attempts: this.options.consumerAttempts,
          backoff: {
            type: 'events-jitter',
            delay: this.options.consumerBackoffMs,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      });
      queue.on('error', () => undefined);
      this.queueInstance = queue;
    }
    return this.queueInstance;
  }

  async publishConsumerJob(
    job: DomainEventJobData,
    jobOptions: PublishConsumerJobOptions = {},
  ): Promise<string> {
    const jobId = buildEventJobId(job.eventId, job.consumer);
    if (this.faultHook) {
      await this.faultHook(job, jobId);
    }
    const maxAttempts = jobOptions.maxAttempts ?? this.options.consumerAttempts;
    const queue = this.getQueue();

    await withTimeout(
      (async () => {
        const existing = await queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          // If a previous job with this deterministic ID already finished (completed or failed) and the
          // dispatcher/reconciler/replay is re-publishing because no EventReceipt exists, remove the
          // terminal record first so BullMQ enqueues a fresh execution under the same stable jobId.
          if (state === 'completed' || state === 'failed') {
            await existing.remove().catch(() => undefined);
          } else {
            return;
          }
        }
        await queue.add(job.type, job, {
          jobId,
          attempts: maxAttempts,
          backoff: {
            type: 'events-jitter',
            delay: this.options.consumerBackoffMs,
          },
        });
      })(),
      this.options.publishTimeoutMs,
      `BullMQ publish ${jobId}`,
    );

    return jobId;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.queueInstance) {
      const q = this.queueInstance;
      this.queueInstance = null;
      await q.close().catch(() => undefined);
    }
  }
}
