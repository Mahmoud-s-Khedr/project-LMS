import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { cursorPayloadSchema, type CursorQuery } from '@lms/shared';
import { createHash } from 'node:crypto';

export const tenancyEtag = (row: { id: string; updatedAt: Date }): string =>
  `"${row.id}:${row.updatedAt.getTime()}"`;
export function checkEtag(row: { id: string; updatedAt: Date }, supplied?: string): void {
  if (!supplied)
    throw new HttpException(
      { code: 'PRECONDITION_REQUIRED', message: 'If-Match is required' },
      428,
    );
  if (supplied !== tenancyEtag(row))
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource changed; reload before editing',
    });
}
export const nextUpdatedAt = (row: { updatedAt: Date }): Date =>
  new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
export function cursorWindow(query: CursorQuery, filters: Record<string, unknown>) {
  const filterHash = createHash('sha256').update(JSON.stringify(filters)).digest('hex');
  let boundary:
    | { OR: Array<{ createdAt: { lt: Date } } | { createdAt: Date; id: { lt: string } }> }
    | undefined;
  if (query.cursor) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
    const parsed = cursorPayloadSchema.safeParse(decoded);
    if (
      !parsed.success ||
      parsed.data.sort !== 'createdAt' ||
      parsed.data.filterHash !== filterHash ||
      !Number.isFinite(Date.parse(parsed.data.value))
    )
      throw new BadRequestException('Cursor does not match this list');
    const createdAt = new Date(parsed.data.value);
    boundary = {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: parsed.data.id } }],
    };
  }
  return {
    boundary,
    take: query.limit + 1,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    page<T extends { id: string; createdAt: Date }>(rows: T[]) {
      const hasMore = rows.length > query.limit;
      const data = rows.slice(0, query.limit);
      const last = data.at(-1);
      const nextCursor =
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                revision: 1,
                sort: 'createdAt',
                value: last.createdAt.toISOString(),
                id: last.id,
                filterHash,
              }),
            ).toString('base64url')
          : null;
      return { data, meta: { nextCursor, hasMore, limit: query.limit } };
    },
  };
}
