import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/lib/api';
import { AcceptInvitationView } from './accept-invitation-view';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/accept-invitation',
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockActiveUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'instructor@learnspace.dev',
  name: 'Instructor One',
  platformRole: 'STUDENT',
  status: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T00:00:00.000Z',
  locale: 'en',
  timezone: 'UTC',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  avatarUrl: null,
  memberships: [],
};

const sampleToken = 'inv_tok_' + 'a'.repeat(32);

describe('AcceptInvitationView', () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders unauthenticated state prompting to log in or register with redirect', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(
      new ApiError(401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          requestId: 'req_auth_none',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/me',
        },
      }),
    );

    renderWithQueryClient(<AcceptInvitationView defaultToken={sampleToken} />);

    expect(await screen.findByText(/workspace invitation/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /sign in to accept/i }).getAttribute('href')).toContain(
      encodeURIComponent(sampleToken),
    );
    expect(
      screen.getByRole('link', { name: /create free account/i }).getAttribute('href'),
    ).toContain(encodeURIComponent(sampleToken));
  });

  it('validates token length before calling accept API', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockActiveUser });
    const postSpy = vi.spyOn(api, 'post');

    renderWithQueryClient(<AcceptInvitationView defaultToken="short_tok" />);

    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    expect(
      await screen.findByText(/invitation token must be at least 32 characters/i),
    ).toBeTruthy();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('successfully accepts invitation and renders confirmed membership view', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockActiveUser });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        id: '00000000-0000-0000-0000-000000000099',
        workspaceId: '00000000-0000-0000-0000-000000000010',
        userId: mockActiveUser.id,
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
        joinedAt: '2026-10-26T10:00:00.000Z',
        createdAt: '2026-10-26T10:00:00.000Z',
        updatedAt: '2026-10-26T10:00:00.000Z',
      },
    });

    const successCallback = vi.fn();
    renderWithQueryClient(
      <AcceptInvitationView defaultToken={sampleToken} onSuccess={successCallback} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/invitations/accept', {
        token: sampleToken,
      });
    });

    expect(await screen.findByText(/invitation accepted/i)).toBeTruthy();
    expect(screen.getByText('INSTRUCTOR')).toBeTruthy();
    expect(successCallback).toHaveBeenCalledWith(expect.objectContaining({ role: 'INSTRUCTOR' }));
  });

  it('handles expired or already used invitation error with accessible alert', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockActiveUser });
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError(409, {
        error: {
          code: 'INVITATION_UNAVAILABLE',
          message: 'Invitation is expired or already used',
          requestId: 'req_inv_err_1',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/invitations/accept',
        },
      }),
    );

    renderWithQueryClient(<AcceptInvitationView defaultToken={sampleToken} />);

    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /accept invitation/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invitation unavailable');
    expect(alert.textContent).toContain('Invitation is expired or already used');
    expect(alert.textContent).toContain('req_inv_err_1');
  });

  it('shows warning alert when logged in user email is unverified', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        ...mockActiveUser,
        emailVerifiedAt: null,
      },
    });

    renderWithQueryClient(<AcceptInvitationView defaultToken={sampleToken} />);

    expect(await screen.findByText(/email address not verified/i)).toBeTruthy();
    expect(screen.getByText(/verify your email now/i)).toBeTruthy();
  });
});
