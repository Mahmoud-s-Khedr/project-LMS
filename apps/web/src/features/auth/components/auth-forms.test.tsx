import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/lib/api';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { ResetPasswordForm } from './reset-password-form';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
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

describe('Auth forms (Zod validation + TanStack Query mutations)', () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('validates required and malformed fields on LoginForm before calling the API', async () => {
    const postSpy = vi.spyOn(api, 'post');
    renderWithQueryClient(<LoginForm />);

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/email address is required/i)).toBeTruthy();
    expect(await screen.findByText(/password is required/i)).toBeTruthy();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('submits normalized credentials on LoginForm and redirects to the role-appropriate dashboard', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        accessToken: 'jwt-test-token',
        expiresIn: 600,
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@learnspace.dev',
          name: 'Platform Admin',
          platformRole: 'SUPER_ADMIN',
          status: 'ACTIVE',
          emailVerifiedAt: '2026-10-01T00:00:00.000Z',
          locale: 'en',
          timezone: 'UTC',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          avatarUrl: null,
        },
      },
    });

    renderWithQueryClient(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: '  ADMIN@Learnspace.dev ' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'correct-horse-battery-staple' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/auth/login',
        {
          email: 'admin@learnspace.dev',
          password: 'correct-horse-battery-staple',
        },
        { skipAuthRefresh: true },
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/admin');
    });
  });

  it('waits for /me memberships after login and routes staff role (TEACHING_ASSISTANT) to /instructor', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        accessToken: 'jwt-ta-token',
        expiresIn: 600,
        user: {
          id: '00000000-0000-0000-0000-000000000003',
          email: 'ta@learnspace.dev',
          name: 'Teaching Assistant',
          platformRole: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: '2026-10-01T00:00:00.000Z',
          locale: 'en',
          timezone: 'UTC',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          avatarUrl: null,
        },
      },
    });

    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'ta@learnspace.dev',
        name: 'Teaching Assistant',
        platformRole: 'STUDENT',
        status: 'ACTIVE',
        emailVerifiedAt: '2026-10-01T00:00:00.000Z',
        locale: 'en',
        timezone: 'UTC',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        avatarUrl: null,
        memberships: [
          {
            id: '00000000-0000-0000-0000-000000000020',
            workspaceId: '00000000-0000-0000-0000-000000000010',
            role: 'TEACHING_ASSISTANT',
            workspace: {
              id: '00000000-0000-0000-0000-000000000010',
              name: 'Algorithms Workspace',
              slug: 'algorithms',
              kind: 'ACADEMY',
            },
          },
        ],
      },
    });

    renderWithQueryClient(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'ta@learnspace.dev' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'correct-horse-battery-staple' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/instructor');
    });
  });

  it('honours redirectTo when provided', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        accessToken: 'jwt-student-token',
        expiresIn: 600,
        user: {
          id: '00000000-0000-0000-0000-000000000004',
          email: 'student@learnspace.dev',
          name: 'Student User',
          platformRole: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: '2026-10-01T00:00:00.000Z',
          locale: 'en',
          timezone: 'UTC',
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          avatarUrl: null,
        },
      },
    });

    renderWithQueryClient(<LoginForm redirectTo="/student/courses" />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'student@learnspace.dev' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'correct-horse-battery-staple' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/student/courses');
    });
  });

  it('renders an accessible alert banner with requestId when LoginForm encounters an ApiError', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError(401, {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
          requestId: 'req_test_9912',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/auth/login',
        },
      }),
    );

    renderWithQueryClient(<LoginForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'learner@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'wrong-password-123' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid credentials');
    expect(alert.textContent).toContain('Invalid email or password');
    expect(alert.textContent).toContain('req_test_9912');
  });

  it('enforces 12-character minimum password and confirmation match on RegisterForm', async () => {
    const postSpy = vi.spyOn(api, 'post');
    renderWithQueryClient(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Elena Rostova' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'elena@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password \(12\+ characters\)/i), {
      target: { value: 'short123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'mismatch123456' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByText(/password must be at least 12 characters/i)).toBeTruthy();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('submits RegisterForm with INSTRUCTOR mode, renders confirmation state, focuses heading, and does not navigate', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        message: 'Check your email for next steps.',
      },
    });

    renderWithQueryClient(<RegisterForm />);

    fireEvent.click(screen.getByRole('radio', { name: /i want to teach/i }));
    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Elena Rostova' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'Elena@Example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password \(12\+ characters\)/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/auth/register',
        {
          name: 'Elena Rostova',
          email: 'elena@example.com',
          password: 'super-secure-passphrase-2026',
          onboardingMode: 'INSTRUCTOR',
        },
        { skipAuthRefresh: true },
      );
    });

    // Does not navigate to any dashboard
    expect(pushMock).not.toHaveBeenCalled();

    // Renders confirmation state with role="status"
    const statusContainer = await screen.findByRole('status');
    expect(statusContainer).toBeInTheDocument();

    // Focus is moved to the confirmation heading
    const heading = screen.getByRole('heading', {
      level: 1,
      name: /check your email for next steps/i,
    });
    expect(heading).toBeInTheDocument();
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });

    // Displays submitted email and guidance to check inbox
    expect(screen.getByText('elena@example.com')).toBeInTheDocument();
    expect(statusContainer.textContent).toMatch(/check your inbox/i);

    // Displays links to /login and /forgot-password
    const loginLink = screen.getByRole('link', { name: /^sign in$/i });
    expect(loginLink.getAttribute('href')).toBe('/login');

    const forgotPasswordLink = screen.getByRole('link', { name: /forgot password\?/i });
    expect(forgotPasswordLink.getAttribute('href')).toBe('/forgot-password');

    // "Use a different email" resets the form
    const resetBtn = screen.getByRole('button', { name: /use a different email/i });
    fireEvent.click(resetBtn);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('renders the same confirmation UI for any 201 response without revealing account existence', async () => {
    vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        message: 'Check your email for next steps.',
      },
    });

    renderWithQueryClient(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Existing User' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'existing@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password \(12\+ characters\)/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    const statusContainer = await screen.findByRole('status');
    expect(statusContainer).toBeInTheDocument();
    expect(statusContainer.textContent).toContain('existing@example.com');
    expect(statusContainer.textContent).toContain('Check your email for next steps');
    expect(statusContainer.textContent).not.toMatch(/already exists|account created|welcome/i);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders AuthErrorBanner on 400 validation error without navigating or confirming', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The submitted registration data is invalid.',
          details: [
            { path: 'password', code: 'too_weak', message: 'Password is too easily guessed.' },
          ],
          requestId: 'req_val_400',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/auth/register',
        },
      }),
    );

    renderWithQueryClient(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Alex Mercer' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password \(12\+ characters\)/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Please check your input');
    expect(alert.textContent).toContain('The submitted registration data is invalid.');
    expect(alert.textContent).toContain('Password is too easily guessed.');
    expect(alert.textContent).toContain('req_val_400');

    expect(screen.queryByRole('status')).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('renders AuthErrorBanner on 429 rate-limited error without navigating or confirming', async () => {
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new ApiError(429, {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many registration attempts. Please try again later.',
          requestId: 'req_rate_429',
          timestamp: '2026-10-26T10:00:00.000Z',
          path: '/api/v1/auth/register',
        },
      }),
    );

    renderWithQueryClient(<RegisterForm />);

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Alex Mercer' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alex@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password \(12\+ characters\)/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'super-secure-passphrase-2026' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Too many attempts');
    expect(alert.textContent).toContain('Too many registration attempts. Please try again later.');
    expect(alert.textContent).toContain('req_rate_429');

    expect(screen.queryByRole('status')).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('submits ForgotPasswordForm and ResetPasswordForm with confirmation feedback', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: { message: 'If eligible, an email will be sent.' } })
      .mockResolvedValueOnce(undefined);

    const { unmount } = renderWithQueryClient(<ForgotPasswordForm />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'student@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send recovery instructions/i }));

    expect(await screen.findByText(/check your inbox/i)).toBeTruthy();
    unmount();

    const sampleHexToken = 'a'.repeat(64);
    renderWithQueryClient(<ResetPasswordForm defaultToken={sampleHexToken} />);

    fireEvent.change(screen.getByLabelText(/new password \(12\+ characters\)/i), {
      target: { value: 'new-strong-password-2026' },
    });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), {
      target: { value: 'new-strong-password-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/password updated/i)).toBeTruthy();
    expect(postSpy).toHaveBeenLastCalledWith(
      '/auth/reset-password',
      {
        token: sampleHexToken,
        password: 'new-strong-password-2026',
      },
      { skipAuthRefresh: true },
    );
  });
});
