import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('API client', () => {
  it('refreshes once for concurrent unauthorized requests and retries with the new token', async () => {
    let refreshCount = 0;
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/csrf')) return Response.json({ data: { csrfToken: 'csrf-1' } });
      if (url.endsWith('/auth/refresh')) {
        expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-1');
        refreshCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Response.json({ accessToken: 'new-token' });
      }
      expect(init.credentials).toBe('include');
      if (new Headers(init.headers).get('Authorization') !== 'Bearer new-token') {
        return Response.json({}, { status: 401 });
      }
      return Response.json({ id: 'student-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { api } = await import('./client');
    const results = await Promise.all([api.get('/users/me'), api.get('/users/me')]);
    expect(refreshCount).toBe(1);
    expect(results).toEqual([{ id: 'student-1' }, { id: 'student-1' }]);
  });

  it('preserves typed server error details and never refreshes auth endpoints', async () => {
    const envelope = {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid credentials',
        requestId: 'req-1',
        timestamp: new Date().toISOString(),
        path: '/auth/login',
      },
    };
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/csrf')
        ? Response.json({ data: { csrfToken: 'csrf-1' } })
        : Response.json(envelope, { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { api, ApiError } = await import('./client');
    const error: unknown = await api.post('/auth/login', {}).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED', requestId: 'req-1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves the same idempotency key when retrying a write', async () => {
    const keys: Array<string | null> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/auth/csrf')) return Response.json({ data: { csrfToken: 'csrf-1' } });
        if (url.endsWith('/auth/refresh'))
          return Response.json({ data: { accessToken: 'new-token' } });
        keys.push(new Headers(init.headers).get('Idempotency-Key'));
        return keys.length === 1
          ? Response.json({}, { status: 401 })
          : Response.json({ data: { id: 'order-1' } });
      }),
    );
    const { api } = await import('./client');
    await api.post('/checkout/sessions', { items: [] });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[0]).toBe(keys[1]);
  });
});
