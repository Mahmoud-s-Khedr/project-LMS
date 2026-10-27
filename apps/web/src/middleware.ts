import { NextResponse, type NextRequest } from 'next/server';
import { buildCspHeader, generateNonce } from '@/lib/security/csp';

const PROTECTED_PREFIXES = ['/student', '/instructor', '/admin'] as const;

export function isProtectedDashboardPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  // This non-sensitive hint only gates navigation. The client guard restores the
  // session and checks roles; API authorization remains the security boundary.
  if (isProtectedDashboardPath(pathname) && !request.cookies.has('lms_session')) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = generateNonce();
  const csp = buildCspHeader({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
