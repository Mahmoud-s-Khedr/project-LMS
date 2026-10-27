'use client';

import * as React from 'react';
import { Bell, CheckCheck, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NotificationItem } from './notification-item';
import { useMarkAllNotificationsReadMutation, useMyNotificationsQuery } from '../hooks';

export function NotificationCenter() {
  const [tab, setTab] = React.useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');

  const { data, isLoading, isError, refetch } = useMyNotificationsQuery(
    tab === 'unread' ? { unread: 'true' } : undefined,
  );

  const markAllMutation = useMarkAllNotificationsReadMutation();

  const notifications = React.useMemo(() => data?.data || [], [data?.data]);

  const unreadCount = React.useMemo(() => {
    return notifications.filter((n) => !n.readAt).length;
  }, [notifications]);

  const filteredNotifications = React.useMemo(() => {
    if (categoryFilter === 'all') return notifications;
    return notifications.filter((n) => {
      if (categoryFilter === 'security') return n.type.startsWith('security.');
      if (categoryFilter === 'learning') {
        return (
          n.type.startsWith('enrollment.') ||
          n.type.startsWith('course.') ||
          n.type.startsWith('live.') ||
          n.type.startsWith('assessment.')
        );
      }
      if (categoryFilter === 'commerce') {
        return n.type.startsWith('order.') || n.type.startsWith('subscription.');
      }
      if (categoryFilter === 'certificate') return n.type.startsWith('certificate.');
      return true;
    });
  }, [notifications, categoryFilter]);

  const handleMarkAllRead = () => {
    markAllMutation.mutate(new Date().toISOString());
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Tabs
            value={tab}
            onValueChange={(val) => setTab(val as typeof tab)}
            className="w-full sm:w-auto"
          >
            <TabsList>
              <TabsTrigger value="all">
                All
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                  {notifications.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread
                {unreadCount > 0 && (
                  <Badge variant="default" className="ml-1.5 text-[10px] px-1.5 py-0 bg-primary">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="security">Security</SelectItem>
              <SelectItem value="learning">Courses</SelectItem>
              <SelectItem value="commerce">Orders</SelectItem>
              <SelectItem value="certificate">Certificates</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || markAllMutation.isPending}
          className="text-xs"
        >
          {markAllMutation.isPending ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <CheckCheck className="mr-1.5 size-3.5 text-primary" />
          )}
          Mark all as read
        </Button>
      </div>

      {/* List / Loading / Error / Empty */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-border/60 p-4">
              <Skeleton className="size-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center sm:p-12">
          <p className="font-semibold text-destructive">Failed to load notifications</p>
          <p className="mt-1 text-sm text-muted-foreground">
            There was an issue retrieving your in-app notifications.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
            <RotateCcw className="mr-2 size-3.5" />
            Retry
          </Button>
        </div>
      ) : filteredNotifications.length > 0 ? (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center sm:p-12">
          <div className="rounded-2xl bg-primary/10 p-4 text-primary">
            <Bell className="size-8" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {tab === 'unread'
              ? 'You are all caught up! There are no unread alerts at this time.'
              : 'Important security, enrollment, course, and certificate updates will appear here.'}
          </p>
        </div>
      )}
    </div>
  );
}
