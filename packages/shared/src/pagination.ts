import { z } from 'zod';

const queryInteger = (max: number) =>
  z
    .union([
      z.number().int(),
      z
        .string()
        .regex(/^[1-9]\d*$/)
        .transform(Number),
    ])
    .pipe(z.number().int().min(1).max(max));
export const pageQuerySchema = z.strictObject({
  page: queryInteger(100000).default(1),
  pageSize: queryInteger(100).default(20),
});
export const cursorSchema = z
  .string()
  .min(1)
  .max(2048)
  .regex(/^[A-Za-z0-9_-]+$/);
export const cursorQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
  limit: queryInteger(100).default(20),
});
export const pageMetaSchema = z
  .strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalPages: z.number().int().nonnegative(),
  })
  .refine((v) => v.totalPages === Math.ceil(v.total / v.pageSize), 'Inconsistent totalPages');
export const cursorMetaSchema = z
  .strictObject({
    nextCursor: cursorSchema.nullable(),
    hasMore: z.boolean(),
    limit: z.number().int().min(1).max(100),
  })
  .refine((v) => v.hasMore === (v.nextCursor !== null), 'Cursor and hasMore disagree');
export const paginatedResponseSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({ data: z.array(item), meta: pageMetaSchema });
export const cursorResponseSchema = <T extends z.ZodType>(item: T) =>
  z.strictObject({ data: z.array(item), meta: cursorMetaSchema });
/** Decoded by the server only; filterHash binds the cursor to normalized filters/scope. */
export const cursorPayloadSchema = z.strictObject({
  revision: z.literal(1),
  sort: z.enum(['createdAt', 'publishedAt', 'title']),
  value: z.string().min(1).max(240),
  id: z.uuid(),
  filterHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;
export type CursorQuery = z.infer<typeof cursorQuerySchema>;
export type PageMeta = z.infer<typeof pageMetaSchema>;
export interface PaginatedResponse<T> {
  data: T[];
  meta: PageMeta;
}
export interface CursorResponse<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}
