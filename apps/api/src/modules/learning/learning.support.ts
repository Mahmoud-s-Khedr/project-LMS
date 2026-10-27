import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { idempotencyKeySchema, type EffectiveAccess } from '@lms/shared';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type Tx = Prisma.TransactionClient;
/** Anything that can run Prisma queries: the root client or an interactive transaction. */
export type Db = Tx | PrismaService;

/** Injectable time source so boundary behaviour (grant expiry, drip, cohort end) is testable with a fake clock. */
export const LEARNING_CLOCK = Symbol.for('lms.learning.Clock');
export interface LearningClock {
  now(): Date;
}
export const systemClock: LearningClock = { now: () => new Date() };

/** Token for the assessments-side effective-result reader (AssessmentAttemptsService implements it). */
export const LEARNING_ASSESSMENT_RESULTS = Symbol.for('lms.learning.AssessmentResultReader');
/** Public token that ContentModule/MediaModule/AssessmentsModule resolve for lesson access decisions. */
export const LEARNING_ACCESS_POLICY = Symbol.for('lms.learning.AccessPolicy');

export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const hashOf = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');

export function notFound(): never {
  throw new NotFoundException();
}
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new NotFoundException();
  return value;
}
export function conflict(code: string, message: string): never {
  throw new ConflictException({ code, message });
}
export function semantic(code: string, message: string): never {
  throw new UnprocessableEntityException({ code, message });
}
export function invalid(message: string): never {
  throw new BadRequestException(message);
}

/** Stable lock-failure error (403) carrying the safe reason and unlockAt, never other learners' data. */
export function accessDenied(access: Extract<EffectiveAccess, { allowed: false }>): never {
  throw new ForbiddenException({
    code: access.reason === 'AVAILABLE_UNTIL_PASSED' ? 'CONTENT_LOCKED' : lockCode(access.reason),
    message: 'This content is not currently available',
    details: { reason: access.reason, unlockAt: access.unlockAt },
  });
}
function lockCode(reason: Extract<EffectiveAccess, { allowed: false }>['reason']): string {
  switch (reason) {
    case 'NOT_RELEASED':
    case 'CONTENT_LOCKED':
      return 'CONTENT_LOCKED';
    case 'USER_SUSPENDED':
    case 'WORKSPACE_SUSPENDED':
    case 'ENROLLMENT_SUSPENDED':
      return 'FORBIDDEN';
    default:
      return reason;
  }
}

export const etagOf = (updatedAt: Date | string) => `"${new Date(updatedAt).getTime()}"`;
export function requireIfMatch(header: string | undefined): string {
  if (typeof header !== 'string' || !/^"[0-9]+"$/.test(header))
    throw new HttpException({ code: 'PRECONDITION_REQUIRED', message: 'If-Match required' }, 428);
  return header;
}

/** Serialize every writer of one learner/course enrollment (create, grant, move, reactivate). */
export async function lockEnrollmentKey(
  tx: Tx,
  workspaceId: string,
  courseId: string,
  userId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`learning:enrollment:${workspaceId}:${courseId}:${userId}`},0))`;
}
export async function lockEnrollmentRow(tx: Tx, workspaceId: string, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Enrollment" WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${id}::uuid FOR UPDATE`;
}

export interface IdempotentOutcome<T> {
  status: number;
  body: T;
  replayed: boolean;
}
/**
 * Tenant-scoped request idempotency (API.md §1): same key + body replays the stored response, a different
 * body is IDEMPOTENCY_CONFLICT, a concurrent duplicate is OPERATION_IN_PROGRESS. The business effect and the
 * record commit in one transaction, so a failure never leaves a completed key behind.
 */
export async function runIdempotent<T>(
  prisma: PrismaService,
  input: {
    workspaceId: string;
    userId: string;
    route: string;
    key: string | undefined;
    body: unknown;
    status: number;
    timeoutMs?: number;
  },
  run: (tx: Tx) => Promise<T>,
): Promise<IdempotentOutcome<T>> {
  const parsedKey = idempotencyKeySchema.safeParse(input.key);
  if (!parsedKey.success) invalid('Idempotency-Key required (16..128 characters)');
  const scope = {
    workspaceId: input.workspaceId,
    userId: input.userId,
    route: input.route,
    key: parsedKey.data!,
  };
  const requestHash = hashOf(input.body);
  return prisma.$transaction(
    async (tx) => {
      const acquired = await tx.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(hashtextextended(${`idempotency:${canonical(scope)}`},0)) AS locked`;
      if (!acquired[0]?.locked)
        throw new ConflictException({
          code: 'OPERATION_IN_PROGRESS',
          message: 'Operation in progress',
        });
      const existing = await tx.idempotencyRecord.findUnique({
        where: { workspaceId_userId_route_key: scope },
      });
      if (existing && existing.expiresAt > new Date()) {
        if (existing.requestHash !== requestHash)
          conflict('IDEMPOTENCY_CONFLICT', 'Key already used for a different request');
        if (existing.status !== 'COMPLETED')
          conflict('OPERATION_IN_PROGRESS', 'Operation in progress');
        return {
          status: existing.responseStatus ?? input.status,
          body: existing.response as T,
          replayed: true,
        };
      }
      if (existing) await tx.idempotencyRecord.delete({ where: { id: existing.id } });
      const body = await run(tx);
      await tx.idempotencyRecord.create({
        data: {
          ...scope,
          requestHash,
          status: 'COMPLETED',
          responseStatus: input.status,
          response: json(body),
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
      return { status: input.status, body, replayed: false };
    },
    { timeout: input.timeoutMs ?? 20000 },
  );
}

export const newRequestId = () => randomUUID();
