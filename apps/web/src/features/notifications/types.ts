import type {
  Notification,
  NotificationsQuery,
  NotificationPreference,
  NotificationPreferencesUpdate,
  NotificationType,
} from '@lms/shared';
import type { z } from 'zod';
import type { notificationsQuerySchema } from '@lms/shared';
import { mandatoryEmailNotificationTypes } from '@lms/shared';

export type {
  Notification,
  NotificationsQuery,
  NotificationPreference,
  NotificationPreferencesUpdate,
  NotificationType,
};

export type NotificationsQueryParams = z.input<typeof notificationsQuerySchema>;

export { mandatoryEmailNotificationTypes };

export function isMandatoryEmailNotification(type: string): boolean {
  return (mandatoryEmailNotificationTypes as readonly string[]).includes(type);
}

export function formatNotificationRelativeTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getNotificationCategory(type: string): {
  category: 'security' | 'learning' | 'commerce' | 'certificate' | 'general';
  label: string;
} {
  if (type.startsWith('security.')) {
    return { category: 'security', label: 'Security & Account' };
  }
  if (
    type.startsWith('enrollment.') ||
    type.startsWith('course.') ||
    type.startsWith('live.') ||
    type.startsWith('assessment.')
  ) {
    return { category: 'learning', label: 'Learning & Courses' };
  }
  if (type.startsWith('order.') || type.startsWith('subscription.')) {
    return { category: 'commerce', label: 'Billing & Purchases' };
  }
  if (type.startsWith('certificate.')) {
    return { category: 'certificate', label: 'Certificates' };
  }
  return { category: 'general', label: 'General' };
}
