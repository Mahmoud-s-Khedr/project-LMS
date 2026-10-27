import {
  acceptedResponseSchema,
  type ChangePasswordInput,
  type LoginInput,
  type Me,
  type RegisterInput,
  type ResetPasswordInput,
  type WorkspaceMember,
} from '@lms/shared';
import { ApiError, api, setAccessToken } from '@/lib/api';
import type { AuthSessionData, UserSession } from './schemas';

function unwrapEnvelope<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) {
      return inner as T;
    }
  }
  return payload as T;
}

export async function loginWithPassword(input: LoginInput): Promise<AuthSessionData> {
  const response = await api.post<{ data: AuthSessionData } | AuthSessionData>(
    '/auth/login',
    {
      email: input.email.trim().toLowerCase(),
      password: input.password,
    },
    { skipAuthRefresh: true },
  );
  const session = unwrapEnvelope<AuthSessionData>(response);
  if (session?.accessToken) {
    setAccessToken(session.accessToken);
  }
  return session;
}

export interface RegisterResult {
  message: string;
}

export async function registerAccount(input: RegisterInput): Promise<RegisterResult> {
  const response = await api.post<unknown>(
    '/auth/register',
    {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      password: input.password,
      onboardingMode: input.onboardingMode ?? 'STUDENT',
    },
    { skipAuthRefresh: true },
  );
  const parsed = acceptedResponseSchema.parse(response);
  return {
    message: parsed.data.message,
  };
}

export async function logoutCurrentSession(): Promise<void> {
  try {
    await api.post<void>('/auth/logout', undefined, { skipAuthRefresh: true });
  } finally {
    setAccessToken(undefined);
  }
}

export async function requestPasswordReset(input: { email: string }): Promise<{ message: string }> {
  const response = await api.post<{ data: { message: string } } | { message: string } | undefined>(
    '/auth/forgot-password',
    { email: input.email.trim().toLowerCase() },
    { skipAuthRefresh: true },
  );
  const unwrapped = unwrapEnvelope<{ message?: string } | undefined>(response);
  return {
    message: unwrapped?.message ?? 'If eligible, recovery instructions have been sent.',
  };
}

export async function confirmPasswordReset(
  input: ResetPasswordInput,
): Promise<{ message: string }> {
  const response = await api.post<{ data: { message: string } } | { message: string } | undefined>(
    '/auth/reset-password',
    {
      token: input.token.trim(),
      password: input.password,
    },
    { skipAuthRefresh: true },
  );
  const unwrapped = unwrapEnvelope<{ message?: string } | undefined>(response);
  return {
    message: unwrapped?.message ?? 'Password has been reset.',
  };
}

export async function verifyEmailToken(input: { token: string }): Promise<{ message: string }> {
  const response = await api.post<{ data: { message: string } } | { message: string } | undefined>(
    '/auth/verify-email',
    { token: input.token.trim() },
    { skipAuthRefresh: true },
  );
  const unwrapped = unwrapEnvelope<{ message?: string } | undefined>(response);
  return {
    message: unwrapped?.message ?? 'Email address verified.',
  };
}

export async function resendVerificationEmail(input: {
  email: string;
}): Promise<{ message: string }> {
  const response = await api.post<{ data: { message: string } } | { message: string } | undefined>(
    '/auth/resend-verification',
    { email: input.email.trim().toLowerCase() },
    { skipAuthRefresh: true },
  );
  const unwrapped = unwrapEnvelope<{ message?: string } | undefined>(response);
  return {
    message: unwrapped?.message ?? 'If eligible, a verification email has been sent.',
  };
}

export async function fetchCurrentUser(): Promise<Me> {
  const response = await api.get<{ data: Me } | Me>('/me');
  return unwrapEnvelope<Me>(response);
}

export async function acceptWorkspaceInvitation(input: {
  token: string;
}): Promise<WorkspaceMember> {
  const response = await api.post<{ data: WorkspaceMember } | WorkspaceMember>(
    '/invitations/accept',
    { token: input.token.trim() },
  );
  return unwrapEnvelope<WorkspaceMember>(response);
}

export async function fetchUserSessions(): Promise<UserSession[]> {
  const response = await api.get<{ data: UserSession[] } | UserSession[]>('/me/sessions');
  const unwrapped = unwrapEnvelope<UserSession[]>(response);
  return Array.isArray(unwrapped) ? unwrapped : [];
}

export async function revokeUserSession(familyId: string): Promise<void> {
  await api.delete<void>(`/me/sessions/${familyId}`);
}

export async function logoutAllSessions(): Promise<void> {
  try {
    await api.post<void>('/auth/logout-all', undefined, { skipAuthRefresh: true });
  } finally {
    setAccessToken(undefined);
  }
}

export async function updateUserPassword(input: ChangePasswordInput): Promise<void> {
  await api.put<void>('/me/password', {
    currentPassword: input.currentPassword,
    password: input.password,
  });
}

export interface ParsedAuthError {
  title: string;
  message: string;
  code?: string;
  requestId?: string;
  fieldIssues: string[];
}

export function parseAuthError(error: unknown): ParsedAuthError {
  if (error instanceof ApiError) {
    const fieldIssues: string[] = [];
    if (Array.isArray(error.details)) {
      for (const item of error.details) {
        if (typeof item === 'string') {
          fieldIssues.push(item);
        } else if (typeof item === 'object' && item !== null && 'message' in item) {
          const msg = (item as { message?: unknown }).message;
          const path = (item as { path?: unknown }).path;
          if (typeof msg === 'string') {
            const prefix = Array.isArray(path) && path.length > 0 ? `${path.join('.')}: ` : '';
            fieldIssues.push(`${prefix}${msg}`);
          }
        }
      }
    }

    const titleMap: Record<string, string> = {
      UNAUTHORIZED: 'Invalid credentials',
      FORBIDDEN: 'Access restricted',
      CONFLICT: 'Account already exists',
      INVITATION_UNAVAILABLE: 'Invitation unavailable',
      RATE_LIMITED: 'Too many attempts',
      VALIDATION_FAILED: 'Please check your input',
      NOT_FOUND: 'Resource not found',
    };

    return {
      title: titleMap[error.code] ?? 'Unable to complete request',
      message: error.message || 'An unexpected error occurred while contacting the server.',
      code: error.code,
      requestId: error.requestId !== 'unknown' ? error.requestId : undefined,
      fieldIssues,
    };
  }

  if (error instanceof Error) {
    return {
      title: 'Connection or request error',
      message: error.message || 'Unable to reach the authentication service.',
      fieldIssues: [],
    };
  }

  return {
    title: 'Unexpected error',
    message: 'Something went wrong. Please try again in a moment.',
    fieldIssues: [],
  };
}
