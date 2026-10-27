import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setAccessToken } from '@/lib/api';
import { AUTH_QUERY_KEYS } from '@/features/auth';
import type { ProfileUpdate } from './types';
import { fetchProfile, updateProfile, logoutAllSessions } from './api';

export const ACCOUNT_QUERY_KEYS = {
  profile: ['account', 'profile'] as const,
};

export function useProfileQuery() {
  return useQuery({
    queryKey: ACCOUNT_QUERY_KEYS.profile,
    queryFn: fetchProfile,
  });
}

export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProfileUpdate) => updateProfile(data),
    onSuccess: (_updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEYS.profile });
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
    },
  });
}

export function useLogoutAllSessionsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutAllSessions,
    onSuccess: () => {
      // Clear access token and all cached TanStack Query data on complete logout
      setAccessToken(undefined);
      queryClient.clear();
      if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
        window.location.href = '/login';
      }
    },
  });
}
