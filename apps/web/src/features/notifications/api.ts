import { api } from '@/lib/api';
import type { CursorMeta } from '@lms/shared';
import type { Notification, NotificationsQueryParams, NotificationPreference } from './types';

export interface PaginatedNotificationsResponse {
  data: Notification[];
  meta?: CursorMeta;
}

export async function fetchMyNotifications(
  query?: NotificationsQueryParams,
): Promise<PaginatedNotificationsResponse> {
  const searchParams = new URLSearchParams();
  if (query?.unread !== undefined) searchParams.set('unread', String(query.unread));
  if (query?.type) searchParams.set('type', query.type);
  if (query?.workspaceId) searchParams.set('workspaceId', query.workspaceId);
  if (query?.cursor) searchParams.set('cursor', query.cursor);
  if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));

  const qs = searchParams.toString();
  const path = qs ? `/me/notifications?${qs}` : '/me/notifications';
  return api.get<PaginatedNotificationsResponse>(path);
}

export async function markNotificationRead(
  notificationId: string,
  read: boolean,
): Promise<Notification> {
  const response = await api.patch<{ data: Notification }>(`/me/notifications/${notificationId}`, {
    read,
  });
  return response.data;
}

export async function markAllNotificationsRead(through: string): Promise<void> {
  await api.post('/me/notifications/read-all', { through });
}

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const response = await api.get<{ data: NotificationPreference[] }>(
    '/me/notification-preferences',
  );
  return response.data;
}

export async function updateNotificationPreferences(
  preferences: NotificationPreference[],
): Promise<NotificationPreference[]> {
  const response = await api.put<{ data: NotificationPreference[] }>(
    '/me/notification-preferences',
    { preferences },
  );
  return response.data;
}
