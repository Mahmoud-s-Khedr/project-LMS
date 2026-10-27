import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { EventPayload, EventType, globalScopeEventTypes } from '@lms/shared';
import { findSensitiveContent, normalizeKey } from '../audit/redaction';
import { EVENT_CONTRACTS, MAIL_CAPABILITY_KEY, MAX_EVENT_PAYLOAD_BYTES } from './events.options';
import type { EventContracts } from './event-contracts';

type GlobalEventType = (typeof globalScopeEventTypes)[number];

interface AppendBase {
  readonly aggregateType: string;
  readonly aggregateId: string;
  /** Delay dispatch until this instant (e.g. scheduled reminders). Defaults to commit-time now(). */
  readonly availableAt?: Date;
}

/**
 * Correlated append input: the type determines the payload schema and the scope. Global identity/security
 * types require `workspaceId: null`; every business type requires the tenant's workspace UUID.
 */
export type AppendEventInput = {
  [T in EventType]: AppendBase & {
    readonly type: T;
    readonly workspaceId: T extends GlobalEventType ? null : string;
    readonly payload: EventPayload<T>;
  };
}[EventType];

export interface AppendedEvent {
  readonly id: string;
  readonly type: EventType;
  readonly sequence: string;
}

/** Any Prisma client or interactive-transaction client; pass the caller's `tx`. */
export type OutboxWriter = Pick<Prisma.TransactionClient, 'outboxEvent' | '$executeRaw'>;

/** Programming error: an event does not satisfy the shared contract or scope rules. Never retried. */
export class EventContractViolation extends Error {
  override readonly name = 'EventContractViolation';
  constructor(
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(issues.length ? `${message}: ${issues.join('; ')}` : message);
  }
}

const ALLOWED_ENCRYPTED_KEYS: ReadonlySet<string> = new Set([normalizeKey(MAIL_CAPABILITY_KEY)]);

/**
 * Transaction-aware outbox writer. Call inside the same Prisma interactive transaction as the externally
 * observable state change; the row commits or rolls back with it, and the dispatcher publishes it later.
 */
@Injectable()
export class OutboxService {
  constructor(@Inject(EVENT_CONTRACTS) private readonly contracts: EventContracts) {}

  async append(tx: OutboxWriter, input: AppendEventInput): Promise<AppendedEvent> {
    const id = randomUUID();
    const payload = this.validate(id, input);
    const created = await tx.outboxEvent.create({
      data: {
        id,
        workspaceId: input.workspaceId,
        type: input.type,
        schemaVersion: this.contracts.schemaVersionOf(input.type),
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload,
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      },
      select: { id: true, sequence: true },
    });
    return { id: created.id, type: input.type, sequence: created.sequence.toString() };
  }

  async appendMany(
    tx: OutboxWriter,
    inputs: readonly AppendEventInput[],
  ): Promise<AppendedEvent[]> {
    const appended: AppendedEvent[] = [];
    for (const input of inputs) appended.push(await this.append(tx, input));
    return appended;
  }

  /**
   * Removes the envelope-encrypted mail capability from an event payload. The mail consumer calls this in its
   * receipt transaction after the message is handed to the delivery pipeline.
   */
  async scrubMailCapability(
    tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
    eventId: string,
  ): Promise<boolean> {
    const count = await tx.$executeRaw`
      UPDATE "OutboxEvent"
      SET "payload" = "payload" - ${MAIL_CAPABILITY_KEY}::text, "updatedAt" = now()
      WHERE "id" = ${eventId}::uuid AND ("payload" -> ${MAIL_CAPABILITY_KEY}::text) IS NOT NULL`;
    return count > 0;
  }

  /** Validates type, scope, size, plaintext-secret absence and the full shared envelope. */
  private validate(id: string, input: AppendEventInput): Prisma.InputJsonValue {
    const { type, workspaceId } = input as { type: string; workspaceId: string | null };
    if (!this.contracts.isKnownType(type))
      throw new EventContractViolation(`Unknown event type ${type}`);
    const global = this.contracts.isGlobalScope(type);
    if (global && workspaceId !== null) {
      throw new EventContractViolation(
        `Global identity/security event ${type} must not carry a workspace`,
      );
    }
    if (!global && workspaceId === null) {
      throw new EventContractViolation(`Business event ${type} requires a workspaceId`);
    }
    if (input.availableAt && Number.isNaN(input.availableAt.getTime())) {
      throw new EventContractViolation('availableAt is not a valid date');
    }
    const serialized = JSON.stringify(input.payload ?? null);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
      throw new EventContractViolation(`Event payload exceeds ${MAX_EVENT_PAYLOAD_BYTES} bytes`);
    }
    const findings = findSensitiveContent(input.payload, ALLOWED_ENCRYPTED_KEYS);
    if (findings.length > 0) {
      throw new EventContractViolation(
        'Event payload contains secret/answer/capability material',
        findings.map((finding) => `${finding.path} (${finding.reason})`),
      );
    }
    const result = this.contracts.validateEnvelope({
      id,
      workspaceId,
      type,
      schemaVersion: this.contracts.schemaVersionOf(type),
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      sequence: '0',
      timestamp: new Date().toISOString(),
      payload: input.payload,
    });
    if (!result.ok)
      throw new EventContractViolation(`Event ${type} violates its contract`, result.issues);
    return result.event.payload as Prisma.InputJsonValue;
  }
}
