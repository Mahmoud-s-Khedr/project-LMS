import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { redactString } from '../audit/redaction';
import { EventConsumerRegistry } from './consumer-registry';
import {
  type ConsumerOutcome,
  type EventDeliveryContext,
  PermanentEventError,
} from './event-consumer';
import type { EventContracts } from './event-contracts';
import { buildEventJobId } from './event-queue.service';
import {
  EVENT_CONTRACTS,
  EVENTS_OPTIONS,
  MAX_LAST_ERROR_LENGTH,
  type EventsOptions,
} from './events.options';

export interface DeliverEventInput {
  readonly eventId: string;
  readonly consumer: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
  readonly jobId?: string;
  readonly requestId?: string;
}

/**
 * Executes a single `(eventId, consumer)` delivery inside a database transaction that atomically inserts
 * `EventReceipt(eventId, consumer)` (copying the event's exact nullable `workspaceId`) alongside the
 * consumer's domain side effects.
 *
 * - Duplicate or racing deliveries serialize on the `(eventId, consumer)` unique constraint via
 *   `INSERT ... ON CONFLICT DO NOTHING`; the second transaction sees `0` rows inserted and skips `handle`.
 * - If `handle` throws, the transaction rolls back (removing the uncommitted receipt) and the error is
 *   recorded on `OutboxEvent.lastError`. Once attempts are exhausted (or `PermanentEventError` is thrown),
 *   the event transitions to `DEAD` without preventing other independent consumers from recording receipts.
 */
@Injectable()
export class EventConsumerRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_CONTRACTS) private readonly contracts: EventContracts,
    private readonly registry: EventConsumerRegistry,
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
  ) {}

  async deliver(input: DeliverEventInput): Promise<ConsumerOutcome> {
    const consumer = this.registry.get(input.consumer);
    if (!consumer) {
      throw new PermanentEventError(`Unregistered event consumer "${input.consumer}"`);
    }

    const row = await this.prisma.outboxEvent.findUnique({
      where: { id: input.eventId },
    });
    if (!row) {
      throw new PermanentEventError(`OutboxEvent ${input.eventId} does not exist`);
    }

    if (!this.registry.subscribes(consumer.name, row.type)) {
      throw new PermanentEventError(
        `Event consumer "${consumer.name}" does not subscribe to event type ${row.type}`,
      );
    }

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
        data: { status: 'DEAD', lockedUntil: null, lastError: reason },
      });
      throw new PermanentEventError(reason);
    }

    const maxAttempts =
      input.maxAttempts ?? consumer.maxAttempts ?? this.options.consumerAttempts;
    const attempt = input.attempt ?? 1;
    const jobId = input.jobId ?? buildEventJobId(row.id, consumer.name);
    const requestId = (
      input.requestId ?? `evt:${row.id}:${consumer.name}:${attempt}`
    ).slice(0, 100);
    const context: EventDeliveryContext = {
      consumer: consumer.name,
      attempt,
      maxAttempts,
      jobId,
      requestId,
    };

    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const receiptId = randomUUID();
          const inserted = await tx.$executeRaw`
            INSERT INTO "EventReceipt" ("id", "workspaceId", "eventId", "consumer", "processedAt", "createdAt")
            VALUES (
              ${receiptId}::uuid,
              ${validation.event.workspaceId}::uuid,
              ${validation.event.id}::uuid,
              ${consumer.name},
              now(),
              now()
            )
            ON CONFLICT ("eventId", "consumer") DO NOTHING
          `;

          if (inserted === 0) {
            return 'duplicate' as const;
          }

          await consumer.handle(validation.event, tx, context);
          return 'processed' as const;
        },
        {
          timeout:
            consumer.transactionTimeoutMs ?? this.options.consumerTransactionTimeoutMs,
        },
      );
      return outcome;
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      const isPermanent =
        error instanceof PermanentEventError || attempt >= maxAttempts;
      const formattedError = redactString(
        isPermanent
          ? `[${consumer.name}] ${rawMessage}`
          : `[${consumer.name}] (attempt ${attempt}/${maxAttempts}) ${rawMessage}`,
        MAX_LAST_ERROR_LENGTH,
      );

      await this.prisma.outboxEvent
        .update({
          where: { id: row.id },
          data: isPermanent
            ? {
                status: 'DEAD',
                lockedUntil: null,
                lastError: formattedError,
              }
            : {
                lastError: formattedError,
              },
        })
        .catch(() => undefined);

      throw error;
    }
  }
}
