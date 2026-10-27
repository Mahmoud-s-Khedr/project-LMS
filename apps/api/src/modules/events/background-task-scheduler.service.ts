import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { findSensitiveContent } from '../audit/redaction';
import {
  type AnyBackgroundTaskHandler,
  type BackgroundTaskContext,
  type BackgroundTaskJobData,
  buildTaskJobId,
  type ScheduledTaskReceipt,
  type ScheduleTaskInput,
} from './background-task';
import { PermanentEventError } from './event-consumer';
import {
  BACKGROUND_TASKS,
  BACKGROUND_TASKS_QUEUE,
  CONSUMER_NAME_MAX,
  EVENTS_OPTIONS,
  type EventsOptions,
  MAX_EVENT_PAYLOAD_BYTES,
  TASK_NAME_PATTERN,
} from './events.options';
import { EventContractViolation } from './outbox.service';
import { jitteredBackoff, redisConnectionFromUrl, withTimeout } from './redis-connection';

/**
 * Schedules delayed business-keyed jobs (expiry/reminders) and runs periodic backstop database scans on
 * `BACKGROUND_TASKS_QUEUE` (ARCHITECTURE §7).
 */
@Injectable()
export class BackgroundTaskSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly handlers = new Map<string, AnyBackgroundTaskHandler>();
  private queueInstance: Queue<BackgroundTaskJobData> | null = null;
  private workerInstance: Worker<BackgroundTaskJobData, void, string> | null = null;
  private readonly periodicTimers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(BACKGROUND_TASKS) tasks: readonly AnyBackgroundTaskHandler[],
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
  ) {
    for (const task of tasks) {
      if (!TASK_NAME_PATTERN.test(task.name) || task.name.length > CONSUMER_NAME_MAX) {
        throw new Error(`Invalid background task name "${task.name}"`);
      }
      if (this.handlers.has(task.name)) {
        throw new Error(`Duplicate background task name "${task.name}"`);
      }
      if (task.everyMs !== undefined && (!Number.isInteger(task.everyMs) || task.everyMs < 50)) {
        throw new Error(`Background task "${task.name}" has invalid everyMs`);
      }
      if (
        task.maxAttempts !== undefined &&
        (!Number.isInteger(task.maxAttempts) || task.maxAttempts < 1)
      ) {
        throw new Error(`Background task "${task.name}" has invalid maxAttempts`);
      }
      this.handlers.set(task.name, task);
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.options.autoStart && this.handlers.size > 0) {
      await this.start();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
    if (this.queueInstance) {
      const q = this.queueInstance;
      this.queueInstance = null;
      await q.close().catch(() => undefined);
    }
  }

  getQueue(): Queue<BackgroundTaskJobData> {
    if (!this.queueInstance) {
      const queue = new Queue<BackgroundTaskJobData>(BACKGROUND_TASKS_QUEUE, {
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

  registeredTasks(): readonly string[] {
    return [...this.handlers.keys()];
  }

  /**
   * Enqueues a delayed or immediate job keyed by `(taskName, businessKey)`.
   * Never accepts secrets, answer keys or signed capability URLs in the payload.
   */
  async schedule<TPayload = Record<string, unknown>>(
    input: ScheduleTaskInput<TPayload>,
    now: Date = new Date(),
  ): Promise<ScheduledTaskReceipt> {
    const jobId = buildTaskJobId(input.taskName, input.businessKey);
    const handler = this.handlers.get(input.taskName);

    let validatedPayload: unknown = input.payload ?? {};
    if (handler?.payloadSchema) {
      const parsed = handler.payloadSchema.safeParse(validatedPayload);
      if (!parsed.success) {
        throw new EventContractViolation(
          `Background task ${input.taskName} payload failed validation`,
          parsed.error.issues.map((i) => `${i.path.join('.') || '$'}: ${i.message}`),
        );
      }
      validatedPayload = parsed.data;
    }

    const serialized = JSON.stringify(validatedPayload);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
      throw new EventContractViolation(
        `Background task payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`,
      );
    }
    const findings = findSensitiveContent(validatedPayload);
    if (findings.length > 0) {
      throw new EventContractViolation(
        'Background task payload contains sensitive material',
        findings.map((f) => `${f.path} (${f.reason})`),
      );
    }

    let delayMs = 0;
    if (input.delayMs !== undefined) {
      delayMs = Math.max(0, Math.trunc(input.delayMs));
    } else if (input.runAt !== undefined) {
      delayMs = Math.max(0, input.runAt.getTime() - now.getTime());
    }

    const maxAttempts = input.maxAttempts ?? handler?.maxAttempts ?? this.options.consumerAttempts;
    const queue = this.getQueue();

    await withTimeout(
      (async () => {
        const existing = await queue.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed' || input.replaceExisting) {
            await existing.remove().catch(() => undefined);
          } else {
            return;
          }
        }
        await queue.add(
          input.taskName,
          {
            taskName: input.taskName,
            businessKey: input.businessKey.trim(),
            payload: validatedPayload,
          },
          {
            jobId,
            delay: delayMs,
            attempts: maxAttempts,
            backoff: {
              type: 'events-jitter',
              delay: this.options.consumerBackoffMs,
            },
          },
        );
      })(),
      this.options.publishTimeoutMs,
      `Schedule background task ${jobId}`,
    );

    return {
      jobId,
      taskName: input.taskName,
      businessKey: input.businessKey.trim(),
      delayMs,
    };
  }

  /** Cancels a pending or delayed scheduled task by its `(taskName, businessKey)` if not yet active. */
  async cancel(taskName: string, businessKey: string): Promise<boolean> {
    const jobId = buildTaskJobId(taskName, businessKey);
    const queue = this.getQueue();
    const existing = await queue.getJob(jobId);
    if (!existing) return false;
    const state = await existing.getState();
    if (state === 'active') return false;
    await existing.remove();
    return true;
  }

  /** Executes a registered task directly (also used by the BullMQ worker). */
  async executeTask(
    data: BackgroundTaskJobData,
    attempt = 1,
    maxAttempts = this.options.consumerAttempts,
    jobId = buildTaskJobId(data.taskName, data.businessKey),
  ): Promise<void> {
    const handler = this.handlers.get(data.taskName);
    if (!handler) {
      throw new PermanentEventError(`Unregistered background task "${data.taskName}"`);
    }
    let payload: unknown = data.payload ?? {};
    if (handler.payloadSchema) {
      const parsed = handler.payloadSchema.safeParse(payload);
      if (!parsed.success) {
        throw new PermanentEventError(
          `Background task ${data.taskName} payload failed validation: ${parsed.error.message}`,
        );
      }
      payload = parsed.data;
    }
    const context: BackgroundTaskContext = {
      taskName: handler.name,
      businessKey: data.businessKey,
      jobId,
      attempt,
      maxAttempts,
    };
    await handler.handle(payload, context);
  }

  /** Triggers one immediate execution pass of all registered periodic (`everyMs`) backstop tasks. */
  async runPeriodicBackstopsOnce(): Promise<number> {
    let executed = 0;
    for (const handler of this.handlers.values()) {
      if (handler.everyMs === undefined) continue;
      await this.executeTask(
        {
          taskName: handler.name,
          businessKey: 'periodic-backstop',
          payload: {},
        },
        1,
        handler.maxAttempts ?? this.options.consumerAttempts,
      );
      executed += 1;
    }
    return executed;
  }

  async start(): Promise<void> {
    if (this.workerInstance) return;
    this.workerInstance = new Worker<BackgroundTaskJobData, void, string>(
      BACKGROUND_TASKS_QUEUE,
      async (job) => this.processJob(job),
      {
        prefix: this.options.queuePrefix,
        connection: redisConnectionFromUrl(this.options.redisUrl, 'worker'),
        concurrency: this.options.workerConcurrency,
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
    this.workerInstance.on('error', () => undefined);
    await this.workerInstance.waitUntilReady();

    for (const handler of this.handlers.values()) {
      if (handler.everyMs === undefined) continue;
      const timer = setInterval(() => {
        void this.schedule({
          taskName: handler.name,
          businessKey: 'periodic-backstop',
          payload: {},
        }).catch(() => undefined);
      }, handler.everyMs);
      timer.unref?.();
      this.periodicTimers.push(timer);
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.periodicTimers.splice(0, this.periodicTimers.length)) {
      clearInterval(timer);
    }
    if (this.workerInstance) {
      const w = this.workerInstance;
      this.workerInstance = null;
      await w.close().catch(() => undefined);
    }
  }

  private async processJob(job: Job<BackgroundTaskJobData, void, string>): Promise<void> {
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? this.options.consumerAttempts;
    const jobId = String(job.id ?? '');
    try {
      await this.executeTask(job.data, attempt, maxAttempts, jobId);
    } catch (error) {
      if (error instanceof PermanentEventError) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
