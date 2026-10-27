import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/lib/api';
import { SessionList } from './session-list';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockSessions = [
  {
    familyId: '00000000-0000-0000-0000-000000000001',
    current: true,
    createdAt: '2026-10-26T09:00:00.000Z',
    expiresAt: '2026-11-25T09:00:00.000Z',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
  },
  {
    familyId: '00000000-0000-0000-0000-000000000002',
    current: false,
    createdAt: '2026-10-25T14:30:00.000Z',
    expiresAt: '2026-11-24T14:30:00.000Z',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  },
];

describe('SessionList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders sessions list with device labels and current session badge', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockSessions });

    renderWithQueryClient(<SessionList />);

    expect(await screen.findByText('This device')).toBeTruthy();
    expect(screen.getByText(/Chrome on Linux/i)).toBeTruthy();
    expect(screen.getByText(/Safari on iOS/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /revoke session on safari on ios/i })).toBeTruthy();
  });

  it('allows revoking a non-current session', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockSessions });
    const deleteSpy = vi.spyOn(api, 'delete').mockResolvedValueOnce(undefined);

    renderWithQueryClient(<SessionList />);

    const revokeBtn = await screen.findByRole('button', {
      name: /revoke session on safari on ios/i,
    });
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('/me/sessions/00000000-0000-0000-0000-000000000002');
    });
  });

  it('calls logout-all when clicking log out of other devices', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockSessions });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce(undefined);

    renderWithQueryClient(<SessionList />);

    const logoutAllBtn = await screen.findByRole('button', {
      name: /log out of other devices/i,
    });
    fireEvent.click(logoutAllBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/auth/logout-all', undefined, {
        skipAuthRefresh: true,
      });
    });
  });

  it('renders empty state when no sessions are active', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] });

    renderWithQueryClient(<SessionList />);

    expect(await screen.findByText(/no active sessions found/i)).toBeTruthy();
  });

  it('displays accessible error banner when revocation fails', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockSessions });
    vi.spyOn(api, 'delete').mockRejectedValueOnce(
      new ApiError(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Unable to revoke requested session family',
          requestId: 'req_sess_fail',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/me/sessions/00000000-0000-0000-0000-000000000002',
        },
      }),
    );

    renderWithQueryClient(<SessionList />);

    const revokeBtn = await screen.findByRole('button', {
      name: /revoke session on safari on ios/i,
    });
    fireEvent.click(revokeBtn);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Unable to revoke requested session family');
    expect(alert.textContent).toContain('req_sess_fail');
  });
});
