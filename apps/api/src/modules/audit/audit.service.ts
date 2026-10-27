import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHmac, createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { redact } from './redaction';
import { AUDIT_OPTIONS, type AuditModuleOptions } from './audit.options';

const uuid = z.uuid();

/** Validated input for one append-only audit record. */
export const auditEntrySchema = z.strictObject({
  /** Dotted verb, e.g. `events.replay`, `enrollment.grant.manual`, `auth.refresh.reuse_detected`. */
  action: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
  resourceType: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
  resourceId: z.string().min(1).max(128),
  /** `null` only for automated/system actions; never fabricate an actor. */
  actorId: uuid.nullable(),
  /** `null` is the explicit platform/security scope; business actions must pass their workspace. */
  workspaceId: uuid.nullable(),
  requestId: z.string().min(1).max(100),
  changes: z.unknown().optional(),
  /** Raw client IP; only an HMAC is stored. */
  ip: z.string().max(100).nullable().optional(),
});
export type AuditEntry = z.input<typeof auditEntrySchema>;

/** Any Prisma client or interactive-transaction client. Prefer the caller's transaction client. */
export type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AppendedAudit {
  readonly id: string;
  readonly createdAt: Date;
}

/**
 * Append-only audit writer. Call `append(tx, entry)` inside the same transaction as the audited change so
 * the audit record commits (or rolls back) atomically with it. `changes` is deep-redacted before storage.
 */
@Injectable()
export class AuditService {
  private readonly ipKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(AUDIT_OPTIONS) options?: AuditModuleOptions,
  ) {
    const secret = options?.ipHashSecret ?? process.env.AUDIT_IP_HASH_SECRET ?? null;
    if (!secret && (options?.nodeEnv ?? process.env.NODE_ENV) === 'production') {
      throw new Error(
        'AUDIT_IP_HASH_SECRET is required in production to pseudonymize audit IP addresses',
      );
    }
    this.ipKey = secret && secret.length > 0 ? secret : null;
  }

  /** Appends within the caller's transaction (or any Prisma client when there is no surrounding change). */
  async append(tx: AuditWriter, entry: AuditEntry): Promise<AppendedAudit> {
    const parsed = auditEntrySchema.parse(entry);
    const created = await tx.auditLog.create({
      data: {
        action: parsed.action,
        resourceType: parsed.resourceType,
        resourceId: parsed.resourceId,
        actorId: parsed.actorId,
        workspaceId: parsed.workspaceId,
        requestId: parsed.requestId,
        changes: parsed.changes === undefined ? {} : redact(parsed.changes),
        ipHash: parsed.ip ? this.hashIp(parsed.ip) : null,
      },
      select: { id: true, createdAt: true },
    });
    return created;
  }

  /** Records a standalone audit fact (e.g. a sensitive read) outside any business transaction. */
  async record(entry: AuditEntry): Promise<AppendedAudit> {
    return this.append(this.prisma, entry);
  }

  /** 64-hex pseudonymous IP digest (HMAC when a secret is configured). */
  hashIp(ip: string): string {
    const normalized = ip.trim().toLowerCase();
    return this.ipKey
      ? createHmac('sha256', this.ipKey).update(normalized).digest('hex')
      : createHash('sha256').update(`lms-audit-ip:${normalized}`).digest('hex');
  }
}
