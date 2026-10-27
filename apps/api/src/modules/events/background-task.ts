import type { z } from 'zod';
import { CONSUMER_NAME_MAX, TASK_NAME_PATTERN } from './events.options';

export interface BackgroundTaskContext {
  readonly taskName: string;
  readonly businessKey: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly maxAttempts: number;
}

/**
 * Handler for a delayed job (keyed by a stable business key, e.g. exam deadline or live session reminder)
 * or a periodic backstop database scan (`everyMs`).
 *
 * Per ARCHITECTURE §7, handlers MUST verify current authoritative database state when executing because a
 * delayed job may be stale by the time it runs (for example, the learner already submitted the attempt).
 */
export interface BackgroundTaskHandler<TPayload = Record<string, unknown>> {
  /** Stable lowercase dotted identifier, e.g. `assessments.attempt-deadline` or `fulfillment.reconcile`. */
  readonly name: string;
  /** Optional Zod schema used to validate the task payload before enqueueing and before executing. */
  readonly payloadSchema?: z.ZodType<TPayload>;
  /**
   * When set, registers this handler as a periodic backstop database scan executed every `everyMs`
   * milliseconds in the worker process.
   */
  readonly everyMs?: number;
  /** Bounded retry attempts (defaults to EVENTS_CONSUMER_ATTEMPTS). */
  readonly maxAttempts?: number;
  handle(payload: TPayload, context: BackgroundTaskContext): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBackgroundTaskHandler = BackgroundTaskHandler<any>;

export interface ScheduleTaskInput<TPayload = Record<string, unknown>> {
  readonly taskName: string;
  /**
   * Stable business key identifying the target entity/window (e.g. `<attemptId>` or `<sessionId>:24h`).
   * Re-scheduling with the same `(taskName, businessKey)` deduplicates in-flight delayed jobs.
   */
  readonly businessKey: string;
  readonly payload: TPayload;
  /** Target execution timestamp; mutually compatible with `delayMs` (if in the past, runs immediately). */
  readonly runAt?: Date;
  /** Explicit delay in milliseconds before the task becomes eligible to run. */
  readonly delayMs?: number;
  /** If true, replaces an existing waiting/delayed job with the same business key (e.g. deadline extended). */
  readonly replaceExisting?: boolean;
  readonly maxAttempts?: number;
}

export interface ScheduledTaskReceipt {
  readonly jobId: string;
  readonly taskName: string;
  readonly businessKey: string;
  readonly delayMs: number;
}

export interface BackgroundTaskJobData {
  readonly taskName: string;
  readonly businessKey: string;
  readonly payload: unknown;
}

const BUSINESS_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

/**
 * Builds a deterministic BullMQ job ID from `(taskName, businessKey)`.
 * BullMQ custom job IDs cannot contain `:`, so `:` is encoded as `_c_`.
 */
export function buildTaskJobId(taskName: string, businessKey: string): string {
  if (!TASK_NAME_PATTERN.test(taskName) || taskName.length > CONSUMER_NAME_MAX) {
    throw new Error(`Invalid background task name "${taskName}"`);
  }
  const trimmedKey = businessKey.trim();
  if (!BUSINESS_KEY_PATTERN.test(trimmedKey)) {
    throw new Error(`Invalid businessKey for task "${taskName}"`);
  }
  const safeKey = trimmedKey.replace(/:/g, '_c_');
  return `task__${taskName}__${safeKey}`;
}
