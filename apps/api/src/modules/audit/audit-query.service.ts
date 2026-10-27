import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditLog as SharedAuditLog } from '@lms/shared';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { isSensitiveKey, redact, redactString, TRUNCATED } from './redaction';

/**
 * Authorization is the caller's responsibility (administration module): a workspace admin may only pass
 * `{ kind: 'workspace', workspaceId }` for a workspace they administer; only a platform super-admin may use
 * `{ kind: 'platform' }` (all scopes) or `{ kind: 'global' }` (null-scope security records).
 */
export type AuditScope =
  | { readonly kind: 'workspace'; readonly workspaceId: string }
  | { readonly kind: 'global' }
  | { readonly kind: 'platform' };

export const auditListFiltersSchema = z.strictObject({
  actorId: z.uuid().optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().max(128).optional(),
  action: z.string().max(120).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditListFilters = z.input<typeof auditListFiltersSchema>;

export interface AuditRecordView {
  readonly id: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly actorId: string | null;
  readonly workspaceId: string | null;
  readonly requestId: string;
  readonly changes: Prisma.JsonValue;
  readonly createdAt: string;
}

export interface AuditCursorMeta {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly limit: number;
}

export interface AuditPage {
  readonly items: AuditRecordView[];
  readonly nextCursor: string | null;
  readonly meta: AuditCursorMeta;
}

export interface AuditProjectedPage {
  readonly data: SharedAuditLog[];
  readonly meta: AuditCursorMeta;
}

interface CursorKey {
  readonly createdAt: Date;
  readonly id: string;
}

export function encodeAuditCursor(key: CursorKey): string {
  return Buffer.from(`${key.createdAt.toISOString()}|${key.id}`, 'utf8').toString('base64url');
}

export function decodeAuditCursor(cursor: string): CursorKey {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const createdAt = iso ? new Date(iso) : new Date(Number.NaN);
  if (!id || !z.uuid().safeParse(id).success || Number.isNaN(createdAt.getTime())) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Invalid cursor' });
  }
  return { createdAt, id };
}

/**
 * Projects an arbitrary audit `changes` bag into the `@lms/shared` wire shape `{ fields, reason? }`
 * while stripping sensitive field names and redacting any reason text.
 */
export function summarizeAuditChanges(changes: unknown): SharedAuditLog['changes'] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return { fields: [] };
  }
  const record = changes as Record<string, unknown>;
  const fieldSet = new Set<string>();
  const addField = (candidate: unknown) => {
    if (typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (trimmed.length === 0 || trimmed.length > 100 || trimmed === TRUNCATED) return;
    if (isSensitiveKey(trimmed)) return;
    if (fieldSet.size < 100) fieldSet.add(trimmed);
  };
  if (Array.isArray(record.fields)) {
    for (const item of record.fields) addField(item);
  }
  for (const key of Object.keys(record)) {
    if (key === 'fields' || key === 'reason') continue;
    addField(key);
  }
  let reason: string | undefined;
  if (typeof record.reason === 'string') {
    const cleaned = redactString(record.reason, 1000).trim();
    if (cleaned.length >= 3 && cleaned.length <= 1000) {
      reason = cleaned;
    }
  }
  return reason !== undefined ? { fields: [...fieldSet], reason } : { fields: [...fieldSet] };
}

/** Read-side projection of the append-only audit log, newest first, cursor paginated, re-redacted. */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: AuditScope, input: AuditListFilters): Promise<AuditPage> {
    const filters = auditListFiltersSchema.parse(input);
    const and: Prisma.AuditLogWhereInput[] = [];
    if (scope.kind === 'workspace') and.push({ workspaceId: scope.workspaceId });
    if (scope.kind === 'global') and.push({ workspaceId: null });
    if (filters.actorId) and.push({ actorId: filters.actorId });
    if (filters.resourceType) and.push({ resourceType: filters.resourceType });
    if (filters.resourceId) and.push({ resourceId: filters.resourceId });
    if (filters.action) and.push({ action: filters.action });
    if (filters.from) and.push({ createdAt: { gte: filters.from } });
    if (filters.to) and.push({ createdAt: { lt: filters.to } });
    if (filters.cursor) {
      const key = decodeAuditCursor(filters.cursor);
      and.push({
        OR: [{ createdAt: { lt: key.createdAt } }, { createdAt: key.createdAt, id: { lt: key.id } }],
      });
    }
    const rows = await this.prisma.auditLog.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        actorId: true,
        workspaceId: true,
        requestId: true,
        changes: true,
        createdAt: true,
      },
    });
    const page = rows.slice(0, filters.limit);
    const hasMore = rows.length > filters.limit;
    const last = page.at(-1);
    const nextCursor = hasMore && last ? encodeAuditCursor(last) : null;
    return {
      items: page.map((row) => ({
        ...row,
        changes: redact(row.changes) as Prisma.JsonValue,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor,
      meta: {
        nextCursor,
        hasMore,
        limit: filters.limit,
      },
    };
  }

  /** Returns the shared API contract projection (`@lms/shared` `auditLogsResponseSchema`). */
  async listProjected(scope: AuditScope, input: AuditListFilters): Promise<AuditProjectedPage> {
    const page = await this.list(scope, input);
    return {
      data: page.items.map((item) => ({
        id: item.id,
        workspaceId: item.workspaceId,
        actorId: item.actorId,
        action: item.action,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        requestId: item.requestId,
        changes: summarizeAuditChanges(item.changes),
        createdAt: item.createdAt,
      })),
      meta: page.meta,
    };
  }
}
