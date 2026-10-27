import { z } from 'zod';

/** DI tokens. */
export const EVENTS_OPTIONS = Symbol('EVENTS_OPTIONS');
export const EVENT_CONTRACTS = Symbol('EVENT_CONTRACTS');
export const EVENT_CONSUMERS = Symbol('EVENT_CONSUMERS');
export const BACKGROUND_TASKS = Symbol('BACKGROUND_TASKS');

/** BullMQ queue names (no `:` allowed). Keys live under `<prefix>:<queue>`. */
export const DOMAIN_EVENTS_QUEUE = 'domain-events';
export const BACKGROUND_TASKS_QUEUE = 'background-tasks';

/** Consumer names are stable identifiers stored in EventReceipt.consumer and embedded in job IDs. */
export const CONSUMER_NAME_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*$/;
export const CONSUMER_NAME_MAX = 64;
export const TASK_NAME_PATTERN = CONSUMER_NAME_PATTERN;

/** Maximum serialized outbox payload. Events carry identifiers; consumers load trusted state. */
export const MAX_EVENT_PAYLOAD_BYTES = 32 * 1024;
/** Maximum persisted lastError text. */
export const MAX_LAST_ERROR_LENGTH = 4000;

/**
 * Top-level payload key that may hold an envelope-encrypted mail capability (ARCHITECTURE §5). It is exempt
 * from the plaintext-secret guard and is purged by the capability scrubber after delivery/expiry.
 */
export const MAIL_CAPABILITY_KEY = 'mailCapability';

const positiveInt = (fallback: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().positive().max(max).default(fallback);

/** Environment-derived defaults; every field can be overridden programmatically. */
export const eventsEnvSchema = z.object({
  REDIS_URL: z.url().default('redis://localhost:56379'),
  EVENTS_REDIS_URL: z.url().optional(),
  EVENTS_QUEUE_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,40}$/)
    .default('lms'),
  EVENTS_DISPATCH_BATCH_SIZE: positiveInt(100, 1000),
  EVENTS_DISPATCH_INTERVAL_MS: positiveInt(500, 60_000),
  EVENTS_LEASE_MS: positiveInt(30_000, 3_600_000),
  EVENTS_PUBLISH_TIMEOUT_MS: positiveInt(5_000, 60_000),
  EVENTS_DISPATCH_BACKOFF_MS: positiveInt(1_000, 60_000),
  EVENTS_DISPATCH_BACKOFF_MAX_MS: positiveInt(300_000, 3_600_000),
  EVENTS_CONSUMER_ATTEMPTS: positiveInt(8, 100),
  EVENTS_CONSUMER_BACKOFF_MS: positiveInt(2_000, 3_600_000),
  EVENTS_CONSUMER_TX_TIMEOUT_MS: positiveInt(15_000, 120_000),
  EVENTS_WORKER_CONCURRENCY: positiveInt(10, 200),
  EVENTS_RECONCILE_INTERVAL_MS: positiveInt(60_000, 86_400_000),
  EVENTS_RECONCILE_GRACE_MS: positiveInt(120_000, 86_400_000),
  EVENTS_RECONCILE_LOOKBACK_MS: positiveInt(7 * 86_400_000),
  EVENTS_RECONCILE_BATCH_SIZE: positiveInt(500, 10_000),
});

export interface EventsOptions {
  /** Redis URL for event/task queues (db index in the path selects the logical database). */
  readonly redisUrl: string;
  /** BullMQ key prefix; use a distinct prefix per environment/test run. */
  readonly queuePrefix: string;
  readonly dispatchBatchSize: number;
  readonly dispatchIntervalMs: number;
  /** Outbox lease duration; an expired PROCESSING lease is re-leased by another dispatcher. */
  readonly leaseMs: number;
  /** Bound on a single Redis publish so a Redis outage releases leases instead of hanging. */
  readonly publishTimeoutMs: number;
  readonly dispatchBackoffMs: number;
  readonly dispatchBackoffMaxMs: number;
  /** Default bounded delivery attempts per consumer before the event is dead-lettered. */
  readonly consumerAttempts: number;
  /** Base exponential backoff (with jitter) between consumer attempts. */
  readonly consumerBackoffMs: number;
  readonly consumerTransactionTimeoutMs: number;
  readonly workerConcurrency: number;
  readonly reconcileIntervalMs: number;
  /** Published events younger than this are not considered lost. */
  readonly reconcileGraceMs: number;
  readonly reconcileLookbackMs: number;
  readonly reconcileBatchSize: number;
  /** Start dispatcher/workers/schedulers on application bootstrap (default true; tests drive manually). */
  readonly autoStart: boolean;
  /**
   * Event types a workspace admin may replay for their own workspace. Default: every non-global type
   * (replay is receipt-safe). Global identity/security events are platform-only.
   */
  readonly workspaceReplayableTypes: readonly string[] | 'all-business';
}

export type EventsOptionsInput = Partial<EventsOptions>;

export function resolveEventsOptions(
  overrides: EventsOptionsInput = {},
  env: Record<string, string | undefined> = process.env,
): EventsOptions {
  const parsed = eventsEnvSchema.parse(env);
  const resolved: EventsOptions = {
    redisUrl: parsed.EVENTS_REDIS_URL ?? parsed.REDIS_URL,
    queuePrefix: parsed.EVENTS_QUEUE_PREFIX,
    dispatchBatchSize: parsed.EVENTS_DISPATCH_BATCH_SIZE,
    dispatchIntervalMs: parsed.EVENTS_DISPATCH_INTERVAL_MS,
    leaseMs: parsed.EVENTS_LEASE_MS,
    publishTimeoutMs: parsed.EVENTS_PUBLISH_TIMEOUT_MS,
    dispatchBackoffMs: parsed.EVENTS_DISPATCH_BACKOFF_MS,
    dispatchBackoffMaxMs: parsed.EVENTS_DISPATCH_BACKOFF_MAX_MS,
    consumerAttempts: parsed.EVENTS_CONSUMER_ATTEMPTS,
    consumerBackoffMs: parsed.EVENTS_CONSUMER_BACKOFF_MS,
    consumerTransactionTimeoutMs: parsed.EVENTS_CONSUMER_TX_TIMEOUT_MS,
    workerConcurrency: parsed.EVENTS_WORKER_CONCURRENCY,
    reconcileIntervalMs: parsed.EVENTS_RECONCILE_INTERVAL_MS,
    reconcileGraceMs: parsed.EVENTS_RECONCILE_GRACE_MS,
    reconcileLookbackMs: parsed.EVENTS_RECONCILE_LOOKBACK_MS,
    reconcileBatchSize: parsed.EVENTS_RECONCILE_BATCH_SIZE,
    autoStart: true,
    workspaceReplayableTypes: 'all-business',
    ...overrides,
  };
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(resolved.queuePrefix)) {
    throw new Error('Invalid events queue prefix');
  }
  return resolved;
}
