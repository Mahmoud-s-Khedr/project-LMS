import { randomUUID } from 'node:crypto';
import { checkEtag, cursorWindow, nextUpdatedAt, tenancyEtag } from './tenancy.util';

describe('Tenancy pagination and preconditions', () => {
  const row = {
    id: randomUUID(),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  it('binds cursors to the workspace and normalized filters with deterministic tie ordering', () => {
    const page = cursorWindow({ limit: 1 }, { workspaceId: 'a', role: 'ADMIN' });
    const first = page.page([row, { ...row, id: randomUUID() }]);
    expect(first.data).toHaveLength(1);
    expect(first.meta.hasMore).toBe(true);
    const next = cursorWindow(
      { limit: 1, cursor: first.meta.nextCursor! },
      { workspaceId: 'a', role: 'ADMIN' },
    );
    expect(next.boundary).toEqual({
      OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }],
    });
    expect(() =>
      cursorWindow(
        { limit: 1, cursor: first.meta.nextCursor! },
        { workspaceId: 'b', role: 'ADMIN' },
      ),
    ).toThrow('Cursor does not match');
    expect(() =>
      cursorWindow(
        { limit: 1, cursor: first.meta.nextCursor! },
        { workspaceId: 'a', role: 'STUDENT' },
      ),
    ).toThrow('Cursor does not match');
  });
  it.each([
    'abc',
    Buffer.from('{}').toString('base64url'),
    Buffer.from('{"revision":1}').toString('base64url'),
  ])('rejects malformed cursors %s', (cursor) => {
    expect(() => cursorWindow({ limit: 1, cursor }, {})).toThrow();
  });
  it('represents empty/last pages without an additional cursor', () => {
    expect(cursorWindow({ limit: 20 }, {}).page([])).toEqual({
      data: [],
      meta: { limit: 20, hasMore: false, nextCursor: null },
    });
    expect(cursorWindow({ limit: 20 }, {}).page([row]).meta.nextCursor).toBeNull();
  });
  it('requires the exact current ETag and changes timestamps even within the same millisecond', () => {
    expect(() => checkEtag(row)).toThrow('If-Match is required');
    expect(() => checkEtag(row, '"wrong"')).toThrow('Resource changed');
    expect(() => checkEtag(row, tenancyEtag(row))).not.toThrow();
    const future = { updatedAt: new Date(Date.now() + 10000) };
    expect(nextUpdatedAt(future).getTime()).toBe(future.updatedAt.getTime() + 1);
  });
});
