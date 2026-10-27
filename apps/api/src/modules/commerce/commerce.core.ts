import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { cursorPayloadSchema, idempotencyKeySchema } from '@lms/shared';
import { z } from 'zod';
export type Tx = Prisma.TransactionClient;
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
export const hash = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');
export function invalid(message: string): never {
  throw new BadRequestException(message);
}
export function conflict(message: string): never {
  throw new ConflictException(message);
}
export async function lock(tx: Tx, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}
export async function idempotent(
  tx: Tx,
  workspaceId: string,
  userId: string,
  route: string,
  key: string | undefined,
  input: unknown,
  status: number,
  run: () => Promise<unknown>,
): Promise<unknown> {
  if (!idempotencyKeySchema.safeParse(key).success)
    invalid('Idempotency-Key required (16..128 characters)');
  const scope = { workspaceId, userId, route, key: key! };
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
  const requestHash = hash(input);
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Key already used for a different request',
      });
    if (existing.status !== 'COMPLETED')
      throw new ConflictException({
        code: 'OPERATION_IN_PROGRESS',
        message: 'Operation in progress',
      });
    return existing.response;
  }
  const response = await run();
  await tx.idempotencyRecord.create({
    data: {
      ...scope,
      requestHash,
      status: 'COMPLETED',
      responseStatus: status,
      response: json(response),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  return response;
}
/** Integer largest-remainder allocation; stable input order breaks ties. Never uses floating point money. */
export function allocate(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (!sum) return weights.map(() => 0);
  const parts = weights.map((w, i) => ({
    i,
    amount: Number((BigInt(total) * BigInt(w)) / sum),
    remainder: (BigInt(total) * BigInt(w)) % sum,
  }));
  let left = total - parts.reduce((a, b) => a + b.amount, 0);
  for (const p of [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1,
  )) {
    if (left-- > 0) p.amount++;
  }
  return parts.map((p) => p.amount);
}
export const selectionSchema = z.array(
  z.object({
    courseId: z.uuid(),
    cohortId: z.uuid().nullable(),
    accessDurationDays: z.number().int().positive().nullable().default(null),
  }),
);
export type Selection = z.infer<typeof selectionSchema>;
export const COHORT_RESERVATIONS = Symbol('commerce.cohort-reservations');
/** Content must lock cohorts in sorted order and count active grants + unexpired order reservations, excluding this order. */
export interface CohortReservations {
  assertAvailable(
    tx: Tx,
    input: {
      workspaceId: string;
      courseId: string;
      cohortId: string;
      at?: Date;
      seats?: number;
      excludeOrderId?: string;
    },
  ): Promise<unknown>;
}

export function pageArgs(query: { cursor?: string; limit: number }, scope: unknown) {
  if (!query.cursor)
    return {
      take: query.limit + 1,
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    };
  let decoded: z.infer<typeof cursorPayloadSchema>;
  try {
    decoded = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(query.cursor, 'base64url').toString()),
    );
  } catch {
    return invalid('Invalid cursor');
  }
  if (
    decoded.filterHash !== hash(scope) ||
    decoded.sort !== 'createdAt' ||
    !z.iso.datetime().safeParse(decoded.value).success
  )
    invalid('Cursor scope mismatch');
  return {
    take: query.limit + 1,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    where: {
      OR: [
        { createdAt: { lt: new Date(decoded.value) } },
        { createdAt: new Date(decoded.value), id: { lt: decoded.id } },
      ],
    },
  };
}
export function page<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
  scope: unknown,
  present: (row: T) => unknown,
) {
  const more = rows.length > limit;
  const data = rows.slice(0, limit);
  const last = data.at(-1);
  return {
    data: data.map(present),
    meta: {
      limit,
      hasMore: more,
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({
                revision: 1,
                sort: 'createdAt',
                value: last.createdAt.toISOString(),
                id: last.id,
                filterHash: hash(scope),
              }),
            ).toString('base64url')
          : null,
    },
  };
}
