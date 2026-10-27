import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/authz';
export type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
export type Scope = { workspaceId: string; courseId: string };
export type RangeInput = { from?: string; to?: string };
export const DAY = 86400000;
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return new ZodValidationPipe(schema).transform(value);
}
/** RFC3339 half-open interval [from,to), defaulting to the last 30 UTC days. */
export function range(input: RangeInput, now = new Date()) {
  const end = input.to
    ? new Date(input.to)
    : new Date(Date.parse(now.toISOString().slice(0, 10)) + DAY);
  const start = input.from ? new Date(input.from) : new Date(end.getTime() - 30 * DAY);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    throw new BadRequestException('Invalid date range');
  const dayStart = Date.parse(start.toISOString().slice(0, 10));
  const dayEnd = Date.parse(new Date(end.getTime() - 1).toISOString().slice(0, 10));
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    (dayEnd - dayStart) / DAY >= 366
  )
    throw new BadRequestException('Date range must intersect 1–366 UTC days');
  return { start, end };
}
export function dateFilter(column: Prisma.Sql, input: RangeInput) {
  const r = range(input);
  return Prisma.sql`${column} >= ${r.start} AND ${column} < ${r.end}`;
}
export function filterHash(value: unknown) {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v !== null && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, item]) => [k, canonical(item)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function safeMoney(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new BadRequestException('Report total exceeds supported integer precision');
  return n;
}
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  // Prevent spreadsheet formula execution, including whitespace-prefixed formulas.
  if (/^[\s]*[=+\-@\t\r]/u.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function csvRow(row: Record<string, unknown>, columns: readonly string[]) {
  return columns.map((key) => csvCell(row[key])).join(',') + '\r\n';
}
