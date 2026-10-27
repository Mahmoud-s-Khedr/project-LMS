import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/api';
import { DashboardSessionGuard } from './dashboard-session-guard';

const navigation = vi.hoisted(() => ({
  pathname: '/student',
  router: { replace: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation.router,
}));

function profile(platformRole = 'STUDENT', membershipRole?: string, status = 'ACTIVE') {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test User',
    email: 'user@example.com',
    platformRole,
    status,
    memberships: membershipRole ? [{ role: membershipRole }] : [],
  };
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const clients: QueryClient[] = [];
function renderGuard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = () => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <DashboardSessionGuard>
          {(me) => <div>Protected content for {me.name}</div>}
        </DashboardSessionGuard>
      </QueryClientProvider>
    </StrictMode>
  );
  return { ...render(view()), view };
}

beforeEach(() => {
  navigation.pathname = '/student';
  navigation.router.replace.mockReset();
  window.history.replaceState(null, '', '/student');
  setAccessToken(undefined);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  setAccessToken(undefined);
  vi.restoreAllMocks();
});

describe('Dashboard session guard', () => {
  it('shows a skeleton until /me authenticates, without exposing protected children', async () => {
    let resolveMe!: (response: Response) => void;
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveMe = resolve;
        }),
    );
    renderGuard();
    expect(screen.getByRole('status', { name: 'Loading your workspace' })).toBeInTheDocument();
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
    resolveMe(json(profile()));
    expect(await screen.findByText('Protected content for Test User')).toBeInTheDocument();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('restores the session through the existing single-flight client and reuses it across navigation', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ csrfToken: 'csrf-test' }))
      .mockResolvedValueOnce(json({ accessToken: 'restored-jwt' }))
      .mockResolvedValueOnce(json(profile()));
    const { rerender, view } = renderGuard();
    await screen.findByText('Protected content for Test User');
    expect(fetchSpy.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      '/api/v1/me',
      '/api/v1/auth/csrf',
      '/api/v1/auth/refresh',
      '/api/v1/me',
    ]);
    const refreshOptions = fetchSpy.mock.calls[2]![1]!;
    expect(refreshOptions).toMatchObject({
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': 'csrf-test' },
    });
    const meHeaders = new Headers(fetchSpy.mock.calls[3]![1]!.headers);
    expect(meHeaders.get('Authorization')).toBe('Bearer restored-jwt');
    navigation.pathname = '/student/courses';
    rerender(view());
    expect(screen.getByText('Protected content for Test User')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('redirects a stale or forged hint to login when refresh fails', async () => {
    navigation.pathname = '/admin/users';
    window.history.replaceState(null, '', '/admin/users?page=2');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ csrfToken: 'csrf-test' }))
      .mockResolvedValueOnce(json({}, 401));
    renderGuard();
    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith(
        '/login?redirect=%2Fadmin%2Fusers%3Fpage%3D2',
      ),
    );
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
  });

  it('redirects to login on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    renderGuard();
    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith('/login?redirect=%2Fstudent'),
    );
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
  });

  it.each([
    ['STUDENT', undefined, '/admin/users', '/student'],
    ['STUDENT', 'INSTRUCTOR', '/admin/users', '/instructor'],
    ['STUDENT', 'TEACHING_ASSISTANT', '/admin', '/instructor'],
  ])(
    'redirects %s/%s from %s to %s without rendering children',
    async (platformRole, role, path, fallback) => {
      navigation.pathname = path!;
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(profile(platformRole, role)));
      renderGuard();
      await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith(fallback));
      expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
    },
  );

  it.each([
    ['SUPER_ADMIN', undefined, '/admin/users'],
    ['STUDENT', 'ADMIN', '/admin'],
    ['STUDENT', 'INSTRUCTOR', '/instructor/courses'],
  ])('allows %s/%s in %s', async (platformRole, role, path) => {
    navigation.pathname = path!;
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(profile(platformRole, role)));
    renderGuard();
    expect(await screen.findByText('Protected content for Test User')).toBeInTheDocument();
    expect(navigation.router.replace).not.toHaveBeenCalled();
  });

  it('rejects an inactive profile even with an otherwise permitted role', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json(profile('SUPER_ADMIN', undefined, 'SUSPENDED')),
    );
    renderGuard();
    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith('/login?redirect=%2Fstudent'),
    );
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
  });

  it('rechecks area access on client navigation without fetching or rotating again', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(profile()));
    const { rerender, view } = renderGuard();
    await screen.findByText('Protected content for Test User');
    navigation.pathname = '/admin';
    rerender(view());
    expect(screen.queryByText(/Protected content/)).not.toBeInTheDocument();
    await waitFor(() => expect(navigation.router.replace).toHaveBeenCalledWith('/student'));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
