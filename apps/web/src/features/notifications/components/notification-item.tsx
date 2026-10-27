'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Award,
  Check,
  CreditCard,
  ExternalLink,
  GraduationCap,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMarkNotificationReadMutation } from '../hooks';
import {
  formatNotificationRelativeTime,
  getNotificationCategory,
} from '../types';
import type { Notification } from '../types';

export interface NotificationItemProps {
  notification: Notification;
}

function getNotificationIcon(type: string) {
  if (type.startsWith('security.')) {
    return { icon: ShieldAlert, color: 'text-amber-500', bg: 'bg-amber-500/10' };
  }
  if (type.startsWith('order.') || type.startsWith('subscription.')) {
    return { icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  }
  if (type.startsWith('certificate.')) {
    return { icon: Award, color: 'text-primary', bg: 'bg-primary/10' };
  }
  return { icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-500/10' };
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const markReadMutation = useMarkNotificationReadMutation();
  const isUnread = !notification.readAt;
  const { icon: Icon, color, bg } = getNotificationIcon(notification.type);
  const { label: categoryLabel } = getNotificationCategory(notification.type);

  const handleToggleRead = () => {
    markReadMutation.mutate({
      id: notification.id,
      read: isUnread,
    });
  };

  return (
    <div
      className={`group relative flex items-start gap-3.5 rounded-xl border p-4 transition-all ${
        isUnread
          ? 'border-primary/30 bg-primary/[0.03] shadow-xs'
          : 'border-border/60 bg-card hover:bg-muted/20'
      }`}
    >
      {/* Type Icon */}
      <div className={`rounded-xl p-2.5 shrink-0 ${bg} ${color}`}>
        <Icon className="size-4" aria-hidden="true" />
      </div>

      {/* Main Content */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">{categoryLabel}</span>
            {isUnread && (
              <span className="inline-block size-1.5 rounded-full bg-primary" aria-label="Unread" />
            )}
          </div>
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            {formatNotificationRelativeTime(notification.createdAt)}
          </span>
        </div>

        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {notification.title}
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
          {notification.body}
        </p>

        {/* Action Link & Mark Read */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {notification.data?.path ? (
            <Button variant="outline" size="sm" asChild className="h-7 text-xs">
              <Link href={notification.data.path}>
                View Details
                <ExternalLink className="ml-1.5 size-3" />
              </Link>
            </Button>
          ) : (
            <span />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleRead}
            disabled={markReadMutation.isPending}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            {isUnread ? (
              <>
                <Check className="mr-1 size-3 text-primary" />
                Mark as read
              </>
            ) : (
              'Mark as unread'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
