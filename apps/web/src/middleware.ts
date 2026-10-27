import { NextResponse, type NextRequest } from 'next/server';

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
  return NextResponse.next();
}

export const config = {
  matcher: ['/student/:path*', '/instructor/:path*', '/admin/:path*'],
};
