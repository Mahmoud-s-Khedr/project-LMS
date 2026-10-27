import type { Prisma } from '@prisma/client';
import type { DomainEvent, EventType } from '@lms/shared';

/** The validated envelope delivered to a consumer, narrowed to the consumer's subscribed types. */
export type DeliveredEvent<T extends EventType = EventType> = Extract<DomainEvent, { type: T }>;

export interface EventDeliveryContext {
  /** Stable consumer name (EventReceipt.consumer). */
  readonly consumer: string;
  /** 1-based delivery attempt for this consumer job. */
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly jobId: string;
  /** Correlation ID suitable for AuditLog.requestId (≤100 chars). */
  readonly requestId: string;
}

/**
 * A durable event consumer. Processors live with their owning module and are registered explicitly in the
 * worker bootstrap (`WorkerAppModule.forRoot({ consumers: [...] })`); there is no runtime scanning.
 *
 * Delivery is at-least-once. The bus inserts `EventReceipt(eventId, name)` inside the SAME transaction that
 * runs `handle`; a duplicate delivery finds the receipt and skips `handle`, so every domain side effect written
 * through `tx` happens exactly once per receipt. Side effects outside `tx` (HTTP, SMTP, Stripe) are NOT covered:
 * write an outbox row / delivery record in `tx` and perform the external call from a separate idempotent job.
 */
export interface EventConsumer<T extends EventType = EventType> {
  /** Stable, unique, lowercase dotted name, e.g. `fulfillment.order-paid`. Never rename once deployed. */
  readonly name: string;
  readonly eventTypes: readonly T[];
  /** Bounded attempts before the event is dead-lettered (defaults to EVENTS_CONSUMER_ATTEMPTS). */
  readonly maxAttempts?: number;
  /** Interactive transaction timeout for `handle` (defaults to EVENTS_CONSUMER_TX_TIMEOUT_MS). */
  readonly transactionTimeoutMs?: number;
  /**
   * Apply the side effect using `tx`. Throw to roll back (receipt included) and retry with backoff; throw
   * `PermanentEventError` for a non-retryable failure (dead-letters immediately). Re-check current state:
   * the event may be stale or redelivered after replay.
   */
  handle(event: DeliveredEvent<T>, tx: Prisma.TransactionClient, context: EventDeliveryContext): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEventConsumer = EventConsumer<any>;

/** Non-retryable failure: the event is dead-lettered without further attempts. */
export class PermanentEventError extends Error {
  override readonly name = 'PermanentEventError';
}

export type ConsumerOutcome = 'processed' | 'duplicate';
