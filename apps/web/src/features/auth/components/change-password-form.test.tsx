import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/lib/api';
import { ChangePasswordForm } from './change-password-form';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('validates password length and confirmation match', async () => {
    const putSpy = vi.spyOn(api, 'put');

    renderWithQueryClient(<ChangePasswordForm />);

    fireEvent.change(screen.getByLabelText(/^current password$/i), {
      target: { value: 'old-password-123' },
    });
    fireEvent.change(screen.getByLabelText(/^new password \(12\+ characters\)$/i), {
      target: { value: 'short' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'different-password-123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByText(/new password must be at least 12 characters/i)).toBeTruthy();
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('submits valid password change and displays confirmation banner', async () => {
    const putSpy = vi.spyOn(api, 'put').mockResolvedValueOnce(undefined);
    const successCallback = vi.fn();

    renderWithQueryClient(<ChangePasswordForm onSuccess={successCallback} />);

    fireEvent.change(screen.getByLabelText(/^current password$/i), {
      target: { value: 'correct-old-password-123' },
    });
    fireEvent.change(screen.getByLabelText(/^new password \(12\+ characters\)$/i), {
      target: { value: 'brand-new-super-secure-2026' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'brand-new-super-secure-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/me/password', {
        currentPassword: 'correct-old-password-123',
        password: 'brand-new-super-secure-2026',
      });
    });

    expect(await screen.findByText(/password updated successfully/i)).toBeTruthy();
    expect(successCallback).toHaveBeenCalled();
  });

  it('renders accessible error banner when current password is wrong', async () => {
    vi.spyOn(api, 'put').mockRejectedValueOnce(
      new ApiError(400, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Current password does not match',
          requestId: 'req_pw_mismatch',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/me/password',
        },
      }),
    );

    renderWithQueryClient(<ChangePasswordForm />);

    fireEvent.change(screen.getByLabelText(/^current password$/i), {
      target: { value: 'wrong-current-password' },
    });
    fireEvent.change(screen.getByLabelText(/^new password \(12\+ characters\)$/i), {
      target: { value: 'brand-new-super-secure-2026' },
    });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), {
      target: { value: 'brand-new-super-secure-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Current password does not match');
    expect(alert.textContent).toContain('req_pw_mismatch');
  });
});
