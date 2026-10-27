import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type OutboxStatus, Prisma } from '@prisma/client';
import type { EventType, OperationEvent } from '@lms/shared';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { redactString } from '../audit/redaction';
import type { EventContracts } from './event-contracts';
import { EVENT_CONTRACTS, EVENTS_OPTIONS, type EventsOptions } from './events.options';

export type OperationsScope =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'global' }
  | { readonly kind: 'platform' };

export type ReplayScope =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'platform'; readonly workspaceId?: string };

export const operationsListFiltersSchema = z.strictObject({
  status: z.enum(['PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD']).optional(),
  type: z.string().min(1).max(100).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type OperationsListFilters = z.input<typeof operationsListFiltersSchema>;

export const replayEventRequestSchema = z.strictObject({
  actorId: z.uuid(),
  reason: z.string().trim().min(3).max(1000),
  requestId: z.string().min(1).max(100),
  ip: z.string().max(100).nullable().optional(),
});

export interface ReplayEventRequest {
  readonly actorId: string;
  readonly scope: ReplayScope;
  readonly reason: string;
  readonly requestId: string;
  readonly ip?: string | null;
}

export interface ReplayEventResult {
  readonly operationId: string;
  readonly status: 'PENDING';
  readonly eventId: string;
  readonly preservedConsumers: readonly string[];
}

export interface OperationEventRecordView {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly type: string;
  readonly schemaVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly sequence: string;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly errorCode: string | null;
  readonly lastError: string | null;
  readonly receiptConsumers: readonly string[];
}

export interface OperationsCursorMeta {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly limit: number;
}

export interface OperationsEventsPage {
  readonly items: OperationEventRecordView[];
  readonly nextCursor: string | null;
  readonly meta: OperationsCursorMeta;
}

export interface OperationsEventsProjectedPage {
  readonly data: OperationEvent[];
  readonly meta: OperationsCursorMeta;
}

interface CursorKey {
  readonly createdAt: Date;
  readonly id: string;
}

export function encodeOperationsCursor(key: CursorKey): string {
  return Buffer.from(`${key.createdAt.toISOString()}|${key.id}`, 'utf8').toString('base64url');
}

export function decodeOperationsCursor(cursor: string): CursorKey {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = iso ? new Date(iso) : new Date(Number.NaN);
  if (!id || !z.uuid().safeParse(id).success || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid cursor' });
  }
  return { createdAt, id };
}

export function deriveOperationErrorCode(status: OutboxStatus, lastError: string | null): string | null {
  if (!lastError) return status === 'DEAD' ? 'EVENT_DEAD' : null;
  if (lastError.startsWith('Envelope validation failed:')) return 'CONTRACT_VIOLATION';
  if (lastError.startsWith('Dispatch failed:')) return 'DISPATCH_FAILED';
  const consumerMatch = /^\[([a-z0-9.-]+)\]/i.exec(lastError);
  if (consumerMatch?.[1]) {
    return `CONSUMER_FAILED:${consumerMatch[1]}`.slice(0, 100);
  }
  return 'EVENT_PROCESSING_FAILED';
}

/**
 * Operational outbox inspection and audited dead-letter replay (ARCHITECTURE §3, §7; API §11).
 *
 * - Never exposes `OutboxEvent.payload` in projections.
 * - Workspace admins may only inspect/replay allowlisted business events belonging to their workspace;
 *   another tenant's event or a global identity/security event returns 404.
 * - Replay preserves existing `EventReceipt` rows so consumers that already succeeded are not re-run,
 *   resets the event to `PENDING`, and writes an `AuditLog` in the same transaction.
 */
@Injectable()
export class EventReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(EVENT_CONTRACTS) private readonly contracts: EventContracts,
    @Inject(EVENTS_OPTIONS) private readonly options: EventsOptions,
  ) {}

  isWorkspaceReplayable(type: string): boolean {
    if (!this.contracts.isKnownType(type)) return false;
    if (this.contracts.isGlobalScope(type)) return false;
    if (this.options.workspaceReplayableTypes === 'all-business') return true;
    return this.options.workspaceReplayableTypes.includes(type);
  }

  async list(scope: OperationsScope, input: OperationsListFilters = {}): Promise<OperationsEventsPage> {
    const filters = operationsListFiltersSchema.parse(input);
    if (filters.type && !this.contracts.isKnownType(filters.type)) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: `Unknown event type ${filters.type}` });
    }
    const and: Prisma.OutboxEventWhereInput[] = [];
    if (scope.kind === 'workspace') and.push({ workspaceId: scope.workspaceId });
    if (scope.kind === 'global') and.push({ workspaceId: null });
    if (filters.status) and.push({ status: filters.status });
    if (filters.type) and.push({ type: filters.type });
    if (filters.cursor) {
      const key = decodeOperationsCursor(filters.cursor);
      and.push({
        OR: [{ createdAt: { lt: key.createdAt } }, { createdAt: key.createdAt, id: { lt: key.id } }],
      });
    }

    const rows = await this.prisma.outboxEvent.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      select: {
        id: true,
        workspaceId: true,
        type: true,
        schemaVersion: true,
        aggregateType: true,
        aggregateId: true,
        sequence: true,
        status: true,
        attempts: true,
        availableAt: true,
        createdAt: true,
        publishedAt: true,
        lastError: true,
        receipts: {
          select: { consumer: true },
          orderBy: { consumer: 'asc' },
        },
      },
    });

    const page = rows.slice(0, filters.limit);
    const hasMore = rows.length > filters.limit;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeOperationsCursor(last) : null;

    return {
      items: page.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        type: row.type,
        schemaVersion: row.schemaVersion,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        sequence: row.sequence.toString(),
        status: row.status,
        attempts: row.attempts,
        availableAt: row.availableAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        errorCode: deriveOperationErrorCode(row.status, row.lastError),
        lastError: row.lastError ? redactString(row.lastError, 500) : null,
        receiptConsumers: row.receipts.map((r) => r.consumer),
      })),
      nextCursor,
      meta: {
        nextCursor,
        hasMore,
        limit: filters.limit,
      },
    };
  }

  /** Returns the shared API contract projection (`@lms/shared` `operationsEventsResponseSchema`). */
  async listProjected(
    scope: OperationsScope,
    input: OperationsListFilters = {},
  ): Promise<OperationsEventsProjectedPage> {
    const page = await this.list(scope, input);
    return {
      data: page.items.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        type: item.type as EventType,
        schemaVersion: 1 as const,
        aggregateType: item.aggregateType,
        aggregateId: item.aggregateId,
        sequence: item.sequence,
        status: item.status,
        attempts: item.attempts,
        availableAt: item.availableAt,
        createdAt: item.createdAt,
        publishedAt: item.publishedAt,
        errorCode: item.errorCode,
      })),
      meta: page.meta,
    };
  }

  /**
   * Replays a `DEAD` outbox event, preserving existing `EventReceipt` rows so already-succeeded consumers
   * are not re-executed, and writes an `AuditLog` entry atomically in the same transaction.
   */
  async replay(eventId: string, request: ReplayEventRequest): Promise<ReplayEventResult> {
    if (!z.uuid().safeParse(eventId).success) {
      throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid eventId' });
    }
    const parsed = replayEventRequestSchema.parse({
      actorId: request.actorId,
      reason: request.reason,
      requestId: request.requestId,
      ip: request.ip,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "OutboxEvent" WHERE "id" = ${eventId}::uuid FOR UPDATE`,
      );

      const event = await tx.outboxEvent.findUnique({
        where: { id: eventId },
        select: {
          id: true,
          workspaceId: true,
          type: true,
          status: true,
          attempts: true,
          receipts: {
            select: { consumer: true },
            orderBy: { consumer: 'asc' },
          },
        },
      });

      if (!event) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      if (request.scope.kind === 'workspace') {
        if (!event.workspaceId || event.workspaceId !== request.scope.workspaceId) {
          throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        if (!this.isWorkspaceReplayable(event.type)) {
          throw new ForbiddenException({
            code: 'FORBIDDEN',
            message: `Event type ${event.type} is not allowlisted for workspace replay`,
          });
        }
      } else if (
        request.scope.workspaceId !== undefined &&
        event.workspaceId !== request.scope.workspaceId
      ) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Event not found' });
      }

      if (event.status !== 'DEAD') {
        throw new ConflictException({
          code: 'EVENT_NOT_REPLAYABLE',
          message: `Only DEAD events can be replayed (current status: ${event.status})`,
        });
      }

      const preservedConsumers = event.receipts.map((r) => r.consumer);

      await tx.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PENDING',
          availableAt: new Date(),
          lockedUntil: null,
          lastError: null,
        },
      });

      await this.audit.append(tx, {
        action: 'events.replay',
        resourceType: 'OutboxEvent',
        resourceId: event.id,
        actorId: parsed.actorId,
        workspaceId: event.workspaceId,
        requestId: parsed.requestId,
        ip: parsed.ip,
        changes: {
          eventType: event.type,
          previousStatus: event.status,
          previousAttempts: event.attempts,
          preservedConsumers,
          reason: parsed.reason,
        },
      });

      return {
        operationId: event.id,
        status: 'PENDING' as const,
        eventId: event.id,
        preservedConsumers,
      };
    });
  }
}

export { EventReplayService as EventsOperationsService };
