import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProtectedDashboardPath, middleware } from '@/middleware';

describe('Next.js navigation hint middleware', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['/student', '/student/courses', '/instructor', '/admin/users'])(
    'protects %s',
    (pathname) => expect(isProtectedDashboardPath(pathname)).toBe(true),
  );

  it.each(['/', '/courses', '/login', '/student-public', '/administrator'])(
    'passes through %s without a rewrite or API call',
    (pathname) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const response = middleware(new NextRequest(`http://localhost:3100${pathname}`));
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('x-middleware-rewrite')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('redirects missing hints to login, preserving the requested path and query', () => {
    const response = middleware(
      new NextRequest('http://localhost:3100/instructor/courses?page=2&sort=name'),
    );
    const location = new URL(response.headers.get('location')!);
    expect(response.status).toBe(307);
    expect(location.pathname).toBe('/login');
    expect([...location.searchParams.keys()]).toEqual(['redirect']);
    expect(location.searchParams.get('redirect')).toBe('/instructor/courses?page=2&sort=name');
  });

  it.each(['lms_refresh=secret', 'refresh_token=legacy', 'lms_access=jwt'])(
    'does not use a credential cookie (%s) as the navigation hint',
    (cookie) => {
      const response = middleware(
        new NextRequest('http://localhost:3100/student', { headers: { cookie } }),
      );
      expect(response.status).toBe(307);
    },
  );

  it.each(['/student', '/instructor/courses', '/admin/users'])(
    'allows a hint on %s without authenticating or rotating tokens',
    (pathname) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const response = middleware(
        new NextRequest(`http://localhost:3100${pathname}`, {
          headers: { cookie: 'lms_session=1' },
        }),
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it('attaches Content-Security-Policy with a fresh nonce to page responses', () => {
    const res1 = middleware(new NextRequest('http://localhost:3100/'));
    const res2 = middleware(new NextRequest('http://localhost:3100/courses'));

    const csp1 = res1.headers.get('content-security-policy');
    const csp2 = res2.headers.get('content-security-policy');

    expect(csp1).toBeDefined();
    expect(csp2).toBeDefined();
    expect(csp1).toContain("script-src 'self' 'nonce-");
    expect(csp1).toContain("'strict-dynamic'");

    // Extract nonces
    const nonceMatch1 = csp1?.match(/'nonce-([^']+)'/);
    const nonceMatch2 = csp2?.match(/'nonce-([^']+)'/);

    expect(nonceMatch1).toBeTruthy();
    expect(nonceMatch2).toBeTruthy();
    expect(nonceMatch1![1]).not.toBe(nonceMatch2![1]);

    // Forwarded request header for App Router layout
    expect(
      res1.headers.get('x-middleware-request-x-nonce') || res1.headers.get('x-nonce'),
    ).toBeTruthy();
  });
});
