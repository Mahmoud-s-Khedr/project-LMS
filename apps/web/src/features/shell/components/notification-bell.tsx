'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { fetchMyNotifications } from '@/features/notifications/api';
import {
  NOTIFICATIONS_QUERY_KEYS,
  useMarkAllNotificationsReadMutation,
} from '@/features/notifications/hooks';

export function NotificationBell() {
  const query = useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEYS.all, 'bell'],
    queryFn: async () => {
      const notifications = [];
      let cursor: string | undefined;
      do {
        const page = await fetchMyNotifications({ unread: 'true', limit: 100, cursor });
        notifications.push(...page.data);
        cursor = page.meta?.nextCursor ?? undefined;
      } while (cursor);
      return notifications;
    },
  });
  const markAll = useMarkAllNotificationsReadMutation();
  const notifications = query.data ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Notifications (${notifications.length} unread)`}
          className="relative rounded-full"
        >
          <Bell className="size-4" aria-hidden="true" />
          {notifications.length > 0 && (
            <span
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2">
        <DropdownMenuLabel>
          Notifications {notifications.length > 0 && `(${notifications.length} unread)`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {query.isLoading && <p className="p-2 text-sm">Loading notifications...</p>}
        {query.isError && (
          <p className="p-2 text-sm">
            Could not load notifications. <button onClick={() => query.refetch()}>Try again</button>
          </p>
        )}
        {query.isSuccess && notifications.length === 0 && (
          <p className="p-2 text-sm">No unread notifications.</p>
        )}
        {notifications.slice(0, 5).map((notification) => (
          <div key={notification.id} className="p-2">
            <p className="text-sm font-semibold">{notification.title}</p>
            <p className="text-xs">{notification.body}</p>
          </div>
        ))}
        {notifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate(new Date().toISOString())}
          >
            Mark all as read
          </Button>
        )}
        {markAll.isError && <p className="p-2 text-sm">Could not mark notifications as read.</p>}
        <Link href="/student/notifications" className="block p-2 text-sm">
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
