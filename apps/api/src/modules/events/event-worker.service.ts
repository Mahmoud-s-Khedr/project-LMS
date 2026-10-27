import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { EventConsumerRunnerService } from './event-consumer-runner.service';
import { type ConsumerOutcome, PermanentEventError } from './event-consumer';
import type { DomainEventJobData } from './event-queue.service';
import { DOMAIN_EVENTS_QUEUE, EVENTS_OPTIONS, type EventsOptions } from './events.options';
import { jitteredBackoff, redisConnectionFromUrl } from './redis-connection';

/**
 * BullMQ worker host for `DOMAIN_EVENTS_QUEUE`. Delegates every job to `EventConsumerRunnerService` so
 * transactional receipt insertion, retry tracking and dead-lettering are identical whether invoked from
 * BullMQ or directly in tests.
 */
@Injectable()
export class EventWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly workers: Array<Worker<DomainEventJobData, ConsumerOutcome, string>> = [];

  constructor(
    private readonly runner: EventConsumerRunnerService,
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.options.autoStart) {
      await this.start();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.workers.length > 0) return;
    await this.spawnWorker();
  }

  /**
   * Spawns a BullMQ worker connected to `DOMAIN_EVENTS_QUEUE`. Tests can call this more than once to run
   * multiple competing workers in parallel against the same queue.
   */
  async spawnWorker(
    concurrency = this.options.workerConcurrency,
  ): Promise<Worker<DomainEventJobData, ConsumerOutcome, string>> {
    const worker = new Worker<DomainEventJobData, ConsumerOutcome, string>(
      DOMAIN_EVENTS_QUEUE,
      async (job) => this.processJob(job),
      {
        prefix: this.options.queuePrefix,
        connection: redisConnectionFromUrl(this.options.redisUrl, 'worker'),
        concurrency,
        settings: {
          backoffStrategy: (attemptsMade: number) =>
            jitteredBackoff(
              attemptsMade,
              this.options.consumerBackoffMs,
              this.options.dispatchBackoffMaxMs,
            ),
        },
      },
    );
    worker.on('error', () => undefined);
    this.workers.push(worker);
    await worker.waitUntilReady();
    return worker;
  }

  async stop(): Promise<void> {
    const active = this.workers.splice(0, this.workers.length);
    await Promise.all(active.map((w) => w.close().catch(() => undefined)));
  }

  isRunning(): boolean {
    return this.workers.length > 0;
  }

  private async processJob(
    job: Job<DomainEventJobData, ConsumerOutcome, string>,
  ): Promise<ConsumerOutcome> {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? this.options.consumerAttempts;
    const jobId = String(job.id ?? '');
    try {
      return await this.runner.deliver({
        eventId: job.data.eventId,
        consumer: job.data.consumer,
        attempt,
        maxAttempts,
        jobId,
        requestId: `evt:${job.data.eventId}:${job.data.consumer}:${attempt}`.slice(0, 100),
      });
    } catch (error) {
      if (error instanceof PermanentEventError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
