'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangePasswordInput,
  LoginInput,
  Me,
  RegisterInput,
  ResetPasswordInput,
} from '@lms/shared';
import {
  acceptWorkspaceInvitation,
  confirmPasswordReset,
  fetchCurrentUser,
  fetchUserSessions,
  loginWithPassword,
  logoutAllSessions,
  logoutCurrentSession,
  registerAccount,
  requestPasswordReset,
  resendVerificationEmail,
  revokeUserSession,
  updateUserPassword,
  verifyEmailToken,
} from './api';
import type { UserSession } from './schemas';

export const AUTH_QUERY_KEYS = {
  me: ['auth', 'me'] as const,
  sessions: ['auth', 'sessions'] as const,
};

export function useMeQuery(options?: { enabled?: boolean }) {
  return useQuery<Me>({
    queryKey: AUTH_QUERY_KEYS.me,
    queryFn: fetchCurrentUser,
    enabled: options?.enabled ?? true,
    retry: false,
    // Reuse the bootstrapped session across dashboard navigations. Explicit auth
    // mutations invalidate this query when the session changes.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => loginWithPassword(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (input: RegisterInput) => registerAccount(input),
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logoutCurrentSession(),
    onSettled: () => {
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}

export function useForgotPasswordMutation() {
  return useMutation({
    mutationFn: (input: { email: string }) => requestPasswordReset(input),
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) => confirmPasswordReset(input),
  });
}

export function useVerifyEmailMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string }) => verifyEmailToken(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}

export function useResendVerificationMutation() {
  return useMutation({
    mutationFn: (input: { email: string }) => resendVerificationEmail(input),
  });
}

export function useAcceptInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string }) => acceptWorkspaceInvitation(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useSessionsQuery(options?: { enabled?: boolean }) {
  return useQuery<UserSession[]>({
    queryKey: AUTH_QUERY_KEYS.sessions,
    queryFn: fetchUserSessions,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (familyId: string) => revokeUserSession(familyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.sessions });
    },
  });
}

export function useLogoutAllMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logoutAllSessions(),
    onSettled: () => {
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.me });
      queryClient.removeQueries({ queryKey: AUTH_QUERY_KEYS.sessions });
    },
  });
}

export function useChangePasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => updateUserPassword(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.sessions });
    },
  });
}
