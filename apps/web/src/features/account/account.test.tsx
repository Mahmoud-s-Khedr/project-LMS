import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { ProfileForm } from './components/profile-form';
import { AccountSettingsView } from './components/account-settings-view';
import type { Me } from './types';

function renderWithClient(ui: React.ReactElement, queryClient?: QueryClient) {
  const qc =
    queryClient ||
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockMe: Me = {
  id: '10000000-0000-4000-8000-000000000004',
  email: 'student@example.com',
  name: 'Alex Mercer',
  platformRole: 'STUDENT',
  status: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T12:00:00.000Z',
  locale: 'en-US',
  timezone: 'America/New_York',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-25T14:00:00.000Z',
  avatarUrl: null,
  memberships: [],
};

describe('ProfileForm Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders user details and verified email badge', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockMe });

    renderWithClient(<ProfileForm />);

    expect(await screen.findByDisplayValue('Alex Mercer')).toBeTruthy();
    expect(screen.getByDisplayValue('student@example.com')).toBeTruthy();
    expect(screen.getByText('Verified')).toBeTruthy();
  });

  it('submits updated profile details via PATCH /me', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockMe });
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: { ...mockMe, name: 'Alexander Mercer' },
    });

    renderWithClient(<ProfileForm />);

    const nameInput = await screen.findByDisplayValue('Alex Mercer');
    fireEvent.change(nameInput, { target: { value: 'Alexander Mercer' } });

    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/me', {
        name: 'Alexander Mercer',
        locale: 'en-US',
        timezone: 'America/New_York',
      });
    });
  });
});

describe('AccountSettingsView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders tabs and allows switching between Profile, Security, and Notifications', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path === '/me') return { data: mockMe };
      if (path === '/me/sessions') return { data: [] };
      if (path === '/me/notification-preferences') return { data: [] };
      return { data: {} };
    });

    renderWithClient(<AccountSettingsView />);

    expect(await screen.findByDisplayValue('Alex Mercer')).toBeTruthy();

    // Switch to Security tab
    const securityTab = screen.getByRole('tab', { name: /security & sessions/i });
    await user.click(securityTab);
    expect(await screen.findByText(/Global Session Revocation/i)).toBeTruthy();

    // Switch to Notifications tab
    const notificationsTab = screen.getByRole('tab', { name: /notifications/i });
    await user.click(notificationsTab);
    expect(await screen.findByText(/Notification Preferences/i)).toBeTruthy();
  });

  it('clears query cache and revokes all sessions on logout-all', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const clearSpy = vi.spyOn(queryClient, 'clear');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({});
    vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path === '/me') return { data: mockMe };
      if (path === '/me/sessions') return { data: [] };
      return { data: {} };
    });

    renderWithClient(<AccountSettingsView />, queryClient);

    const securityTab = screen.getByRole('tab', { name: /security & sessions/i });
    await user.click(securityTab);

    const logoutAllBtn = await screen.findByRole('button', {
      name: /sign out everywhere/i,
    });
    await user.click(logoutAllBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/auth/logout-all');
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
