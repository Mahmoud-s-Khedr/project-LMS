import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  formatNotificationRelativeTime,
  getNotificationCategory,
  isMandatoryEmailNotification,
} from './types';
import { NotificationItem } from './components/notification-item';
import { NotificationCenter } from './components/notification-center';
import { NotificationPreferencesForm } from './components/notification-preferences-form';
import type { Notification, NotificationPreference } from './types';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockUnreadNotification: Notification = {
  id: '80000000-0000-4000-8000-000000000001',
  workspaceId: null,
  type: 'security.password_changed',
  title: 'Password Successfully Changed',
  body: 'Your account password was updated from a new IP address.',
  data: { path: '/student/settings' },
  readAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockReadNotification: Notification = {
  id: '80000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  type: 'order.paid',
  title: 'Payment Confirmed',
  body: 'Your enrollment order has been processed.',
  data: { orderId: '90000000-0000-4000-8000-000000000001', path: '/student/orders' },
  readAt: '2026-10-25T10:00:00.000Z',
  createdAt: '2026-10-25T09:30:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
};

const mockPreferences: NotificationPreference[] = [
  {
    workspaceId: null,
    type: 'security.password_changed',
    channel: 'EMAIL',
    enabled: true,
  },
  {
    workspaceId: null,
    type: 'security.password_changed',
    channel: 'IN_APP',
    enabled: true,
  },
  {
    workspaceId: '10000000-0000-4000-8000-000000000001',
    type: 'course.released',
    channel: 'EMAIL',
    enabled: true,
  },
  {
    workspaceId: '10000000-0000-4000-8000-000000000001',
    type: 'course.released',
    channel: 'IN_APP',
    enabled: true,
  },
];

describe('Notification Domain Helpers', () => {
  it('formats relative notification time', () => {
    expect(formatNotificationRelativeTime(new Date().toISOString())).toBe('Just now');
  });

  it('determines category and label', () => {
    expect(getNotificationCategory('security.password_changed').category).toBe('security');
    expect(getNotificationCategory('order.paid').category).toBe('commerce');
    expect(getNotificationCategory('certificate.issued').category).toBe('certificate');
    expect(getNotificationCategory('assessment.graded').category).toBe('learning');
  });

  it('identifies mandatory transactional email types', () => {
    expect(isMandatoryEmailNotification('security.password_changed')).toBe(true);
    expect(isMandatoryEmailNotification('order.paid')).toBe(true);
    expect(isMandatoryEmailNotification('certificate.issued')).toBe(true);
    expect(isMandatoryEmailNotification('course.released')).toBe(false);
  });
});

describe('NotificationItem Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders unread notification and toggles read status', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: { ...mockUnreadNotification, readAt: new Date().toISOString() },
    });

    renderWithClient(<NotificationItem notification={mockUnreadNotification} />);

    expect(screen.getByText('Password Successfully Changed')).toBeTruthy();
    expect(screen.getByText('Security & Account')).toBeTruthy();
    expect(screen.getByRole('link', { name: /view details/i })).toBeTruthy();

    const markReadBtn = screen.getByRole('button', { name: /mark as read/i });
    fireEvent.click(markReadBtn);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(`/me/notifications/${mockUnreadNotification.id}`, {
        read: true,
      });
    });
  });
});

describe('NotificationCenter Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders notification items and marks all as read', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: [mockUnreadNotification, mockReadNotification],
    });
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({});

    renderWithClient(<NotificationCenter />);

    expect(await screen.findByText('Password Successfully Changed')).toBeTruthy();
    expect(screen.getByText('Payment Confirmed')).toBeTruthy();

    const markAllBtn = screen.getByRole('button', { name: /mark all as read/i });
    fireEvent.click(markAllBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/me/notifications/read-all', expect.any(Object));
    });
  });
});

describe('NotificationPreferencesForm Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('disables toggling for mandatory security and transactional emails', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockPreferences,
    });

    renderWithClient(<NotificationPreferencesForm />);

    expect(await screen.findByText('Password Changes & Session Revocations')).toBeTruthy();
    expect(screen.getByText('New Course Content Releases')).toBeTruthy();

    // The email toggle for password changes is mandatory, so it has disabled=true
    const mandatoryEmailBtn = screen.getByRole('switch', {
      name: /toggle email notifications for password changes/i,
    });
    expect(mandatoryEmailBtn.hasAttribute('disabled')).toBe(true);

    // The email toggle for course releases is optional, so it can be clicked
    const optionalEmailBtn = screen.getByRole('switch', {
      name: /toggle email notifications for new course content releases/i,
    });
    expect(optionalEmailBtn.hasAttribute('disabled')).toBe(false);
  });

  it('updates preferences and sends PUT /me/notification-preferences', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockPreferences,
    });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValueOnce({
      data: mockPreferences,
    });

    renderWithClient(<NotificationPreferencesForm />);

    expect(await screen.findByText('New Course Content Releases')).toBeTruthy();

    // Toggle optional course releases in-app
    const inAppBtn = screen.getByRole('switch', {
      name: /toggle in-app notifications for new course content releases/i,
    });
    fireEvent.click(inAppBtn);

    const saveBtn = screen.getByRole('button', { name: /save preferences/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/me/notification-preferences',
        expect.objectContaining({ preferences: expect.any(Array) }),
      );
    });
  });

  it('matches preferences on (workspaceId, type, channel) and switches workspace scope', async () => {
    const multiWsPreferences: NotificationPreference[] = [
      {
        workspaceId: null,
        type: 'security.password_changed',
        channel: 'EMAIL',
        enabled: true,
      },
      {
        workspaceId: '10000000-0000-4000-8000-000000000001',
        type: 'course.released',
        channel: 'IN_APP',
        enabled: true,
      },
      {
        workspaceId: '20000000-0000-4000-8000-000000000002',
        type: 'course.released',
        channel: 'IN_APP',
        enabled: false,
      },
    ];

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: multiWsPreferences,
    });
    const putSpy = vi.spyOn(api, 'put').mockResolvedValueOnce({
      data: multiWsPreferences,
    });

    renderWithClient(<NotificationPreferencesForm />);

    expect(await screen.findByText('New Course Content Releases')).toBeTruthy();

    const scopeSelect = screen.getByLabelText(/workspace scope/i);
    expect(scopeSelect).toBeInTheDocument();

    // Default to first workspace (enabled: true)
    const inAppBtn = screen.getByRole('switch', {
      name: /toggle in-app notifications for new course content releases/i,
    });
    expect(inAppBtn.getAttribute('aria-checked')).toBe('true');

    // Switch to second workspace (enabled: false)
    fireEvent.change(scopeSelect, { target: { value: '20000000-0000-4000-8000-000000000002' } });
    expect(inAppBtn.getAttribute('aria-checked')).toBe('false');

    // Toggle for second workspace to true
    fireEvent.click(inAppBtn);
    expect(inAppBtn.getAttribute('aria-checked')).toBe('true');

    // Save preferences
    const saveBtn = screen.getByRole('button', { name: /save preferences/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/me/notification-preferences',
        expect.objectContaining({
          preferences: expect.arrayContaining([
            expect.objectContaining({
              workspaceId: '10000000-0000-4000-8000-000000000001',
              type: 'course.released',
              channel: 'IN_APP',
              enabled: true,
            }),
            expect.objectContaining({
              workspaceId: '20000000-0000-4000-8000-000000000002',
              type: 'course.released',
              channel: 'IN_APP',
              enabled: true,
            }),
          ]),
        }),
      );
    });
  });
});
