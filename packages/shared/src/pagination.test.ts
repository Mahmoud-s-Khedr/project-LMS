import { describe, expect, it } from 'vitest';
import { cursorQuerySchema, pageQuerySchema } from './pagination';

describe('pagination queries', () => {
  it('coerces valid query strings and rejects unbounded page sizes', () => {
    expect(pageQuerySchema.parse({ page: '2' })).toEqual({ page: 2, pageSize: 20 });
    expect(pageQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(cursorQuerySchema.safeParse({ limit: -1 }).success).toBe(false);
  });
});
