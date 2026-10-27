import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Workspace } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  adminWorkspaceSchema,
  adminWorkspacesResponseSchema,
  webhooksResponseSchema,
  type AdminWorkspacesQuery,
  type AdminWorkspaceUpdate,
  type AuditLogsQuery,
  type OperationsEventsQuery,
  type WebhooksQuery,
} from '@lms/shared';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PolicyService } from '../../common/authz/policy.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditQueryService } from '../audit/audit-query.service';
import { EventReplayService } from '../events/event-replay.service';

export const workspaceEtag = (row: Pick<Workspace, 'id' | 'updatedAt'>) =>
  `"${row.id}:${row.updatedAt.getTime()}"`;
export const workspaceProjection = (row: Workspace) =>
  adminWorkspaceSchema.parse({
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    timezone: row.timezone,
    status: row.status,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
const meta = (q: { page: number; pageSize: number }, total: number) => ({
  ...q,
  total,
  totalPages: Math.ceil(total / q.pageSize),
});

// Bind the infrastructure cursors to the tenant and normalized filters without changing their services.
function cursorScope(kind: string, workspaceId: string, query: object) {
  const filters = Object.entries(query)
    .filter(([key, value]) => key !== 'cursor' && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash('sha256')
    .update(JSON.stringify([kind, workspaceId, filters]))
    .digest('hex');
}
export function unwrapCursor(cursor: string | undefined, scope: string): string | undefined {
  if (!cursor) return undefined;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      typeof value === 'object' &&
      value !== null &&
      'scope' in value &&
      value.scope === scope &&
      'cursor' in value &&
      typeof value.cursor === 'string' &&
      value.cursor.length <= 200
    )
      return value.cursor;
  } catch {
    /* Invalid cursors are client errors. */
  }
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Cursor does not match query',
  });
}
function wrapPage<T extends { meta: { nextCursor: string | null } }>(page: T, scope: string): T {
  return {
    ...page,
    meta: {
      ...page.meta,
      nextCursor: page.meta.nextCursor
        ? Buffer.from(JSON.stringify({ scope, cursor: page.meta.nextCursor })).toString('base64url')
        : null,
    },
  };
}

@Injectable()
export class AdministrationService {
  constructor(
    private readonly db: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly auditQuery: AuditQueryService,
    private readonly events: EventReplayService,
  ) {}

  private async platform(
    actor: AuthenticatedUser,
    tx: Pick<Prisma.TransactionClient, 'user'> = this.db,
  ) {
    this.policy.assertPlatformAdmin(actor);
    if (
      !(await tx.user.findFirst({
        where: { id: actor.id, platformRole: 'SUPER_ADMIN', status: 'ACTIVE', deletedAt: null },
        select: { id: true },
      }))
    )
      throw new ForbiddenException();
  }

  async authorizeWorkspace(actor: AuthenticatedUser, workspaceId: string) {
    if (this.policy.isPlatformAdmin(actor)) {
      await this.platform(actor);
      if (
        await this.db.workspace.findFirst({
          where: { id: workspaceId, deletedAt: null },
          select: { id: true },
        })
      )
        return;
    } else if (await this.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])) return;
    throw new NotFoundException();
  }

  async workspaces(actor: AuthenticatedUser, q: AdminWorkspacesQuery) {
    await this.platform(actor);
    const where: Prisma.WorkspaceWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { slug: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => {
        const total = await tx.workspace.count({ where });
        const rows = await tx.workspace.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        });
        return adminWorkspacesResponseSchema.parse({
          data: rows.map(workspaceProjection),
          meta: meta({ page: q.page, pageSize: q.pageSize }, total),
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async updateWorkspace(
    actor: AuthenticatedUser,
    id: string,
    input: AdminWorkspaceUpdate,
    expected: string | undefined,
    requestId: string,
  ) {
    await this.platform(actor);
    return this.db.$transaction(async (tx) => {
      // Same canonical row lock used by tenancy, commerce and learning commands.
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id}::uuid FOR SHARE`;
      await this.platform(actor, tx);
      const current = await tx.workspace.findFirst({ where: { id, deletedAt: null } });
      if (!current) throw new NotFoundException();
      if (!expected)
        throw new HttpException(
          { code: 'PRECONDITION_REQUIRED', message: 'If-Match required' },
          428,
        );
      if (expected !== workspaceEtag(current))
        throw new ConflictException({
          code: 'VERSION_CONFLICT',
          message: 'Workspace changed; refresh and retry',
        });
      if (current.status === 'ARCHIVED' && input.status !== 'ARCHIVED')
        throw new ConflictException('Archived workspaces cannot be reactivated');
      // The server owns the suspension time. The legacy input timestamp is validated but never trusted.
      const updated = await tx.workspace.update({
        where: { id },
        data: {
          status: input.status,
          suspendedAt: input.status === 'SUSPENDED' ? (current.suspendedAt ?? new Date()) : null,
          updatedAt: new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1)),
        },
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        workspaceId: id,
        requestId,
        action: 'administration.workspace.updated',
        resourceType: 'Workspace',
        resourceId: id,
        changes: { fields: ['status', 'suspendedAt'], reason: input.reason },
      });
      return { data: workspaceProjection(updated), etag: workspaceEtag(updated) };
    });
  }

  async auditLogs(actor: AuthenticatedUser, w: string, q: AuditLogsQuery, requestId: string) {
    await this.authorizeWorkspace(actor, w);
    const scope = cursorScope('audit', w, q);
    const page = wrapPage(
      await this.auditQuery.listProjected(
        { kind: 'workspace', workspaceId: w },
        { ...q, cursor: unwrapCursor(q.cursor, scope) },
      ),
      scope,
    );
    await this.audit.record({
      actorId: actor.id,
      workspaceId: w,
      requestId,
      action: 'administration.audit.read',
      resourceType: 'Workspace',
      resourceId: w,
      changes: { fields: [] },
    });
    return page;
  }

  async operations(
    actor: AuthenticatedUser,
    w: string,
    q: OperationsEventsQuery,
    requestId: string,
  ) {
    await this.authorizeWorkspace(actor, w);
    const scope = cursorScope('operations', w, q);
    const page = wrapPage(
      await this.events.listProjected(
        { kind: 'workspace', workspaceId: w },
        { ...q, cursor: unwrapCursor(q.cursor, scope) },
      ),
      scope,
    );
    await this.audit.record({
      actorId: actor.id,
      workspaceId: w,
      requestId,
      action: 'administration.operations.read',
      resourceType: 'Workspace',
      resourceId: w,
      changes: { fields: [] },
    });
    return page;
  }

  async replayEvent(
    actor: AuthenticatedUser,
    w: string,
    eventId: string,
    reason: string,
    requestId: string,
  ) {
    await this.authorizeWorkspace(actor, w);
    const result = await this.events.replay(eventId, {
      actorId: actor.id,
      reason,
      requestId,
      scope: this.policy.isPlatformAdmin(actor)
        ? { kind: 'platform', workspaceId: w }
        : { kind: 'workspace', workspaceId: w },
    });
    return { data: { operationId: result.operationId, status: result.status } };
  }

  async webhooks(actor: AuthenticatedUser, q: WebhooksQuery, requestId: string) {
    await this.platform(actor);
    const where: Prisma.StripeWebhookWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lt: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const page = await this.db.$transaction(
      async (tx) => {
        const total = await tx.stripeWebhook.count({ where });
        // The current shared webhook label is capped at 100 characters (DB permits 160).
        // Bound its display label; do not expose payloads to reconstruct provider metadata.
        const rows = await tx.stripeWebhook.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          select: {
            id: true,
            type: true,
            status: true,
            attempts: true,
            createdAt: true,
            processedAt: true,
          },
        });
        return webhooksResponseSchema.parse({
          data: rows.map((row) => ({
            id: row.id,
            workspaceId: null,
            type: row.type,
            status: row.status,
            attempts: row.attempts,
            receivedAt: row.createdAt.toISOString(),
            processedAt: row.processedAt?.toISOString() ?? null,
            errorCode: row.status === 'FAILED' ? 'WEBHOOK_PROCESSING_FAILED' : null,
          })),
          meta: meta({ page: q.page, pageSize: q.pageSize }, total),
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
    await this.audit.record({
      actorId: actor.id,
      workspaceId: null,
      requestId,
      action: 'administration.webhooks.read',
      resourceType: 'StripeWebhook',
      resourceId: 'inbox',
      changes: { fields: [] },
    });
    return page;
  }

  async replayWebhook(actor: AuthenticatedUser, id: string, reason: string, requestId: string) {
    await this.platform(actor);
    return this.db.$transaction(async (tx) => {
      // Match CommerceWorkerService.process lock; never race a verified inbox consumer.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`stripe-event:${id}`},0))`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${actor.id}::uuid FOR SHARE`;
      await this.platform(actor, tx);
      const row = await tx.stripeWebhook.findUnique({
        where: { id },
        select: { status: true, lockedUntil: true, attempts: true },
      });
      if (!row) throw new NotFoundException();
      if (row.status !== 'FAILED' || (row.lockedUntil && row.lockedUntil > new Date()))
        throw new ConflictException({
          code: 'WEBHOOK_NOT_REPLAYABLE',
          message: 'Only unlocked failed webhooks can be replayed',
        });
      // Durable scheduling only: commerce's existing reconciler processes RECEIVED inbox rows.
      // The signed payload, Stripe event ID and every business receipt remain immutable.
      await tx.stripeWebhook.update({
        where: { id },
        data: { status: 'RECEIVED', attempts: 0, lockedUntil: null, lastError: null },
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        workspaceId: null,
        requestId,
        action: 'administration.webhook.replay',
        resourceType: 'StripeWebhook',
        resourceId: id,
        changes: { fields: ['status', 'attempts'], previousAttempts: row.attempts, reason },
      });
      return { data: { operationId: id, status: 'PENDING' as const } };
    });
  }
}
