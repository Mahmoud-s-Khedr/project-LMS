import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationsQueryParams,
  NotificationPreference,
} from './types';
import {
  fetchMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from './api';

export const NOTIFICATIONS_QUERY_KEYS = {
  all: ['notifications'] as const,
  mine: (query?: NotificationsQueryParams) => ['notifications', 'mine', query] as const,
  preferences: ['notifications', 'preferences'] as const,
};

export function useMyNotificationsQuery(query?: NotificationsQueryParams) {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEYS.mine(query),
    queryFn: () => fetchMyNotifications(query),
  });
}

export function useMarkNotificationReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      markNotificationRead(id, read),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEYS.all });
    },
  });
}

export function useMarkAllNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (through: string) => markAllNotificationsRead(through),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEYS.all });
    },
  });
}

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEYS.preferences,
    queryFn: fetchNotificationPreferences,
  });
}

export function useUpdateNotificationPreferencesMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: NotificationPreference[]) =>
      updateNotificationPreferences(preferences),
    onSuccess: (data) => {
      queryClient.setQueryData(NOTIFICATIONS_QUERY_KEYS.preferences, data);
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEYS.preferences });
    },
  });
}
