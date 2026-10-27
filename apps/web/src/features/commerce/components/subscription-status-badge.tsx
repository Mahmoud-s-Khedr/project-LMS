import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { SubscriptionStatus } from '../types';

interface SubscriptionStatusBadgeProps {
  status: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  className?: string;
}

export function SubscriptionStatusBadge({
  status,
  cancelAtPeriodEnd,
  className,
}: SubscriptionStatusBadgeProps) {
  if (cancelAtPeriodEnd && status === 'ACTIVE') {
    return (
      <Badge
        variant="outline"
        className={`border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 ${className ?? ''}`}
      >
        Cancels At Period End
      </Badge>
    );
  }

  switch (status) {
    case 'ACTIVE':
      return (
        <Badge
          variant="outline"
          className={`border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 ${className ?? ''}`}
        >
          Active
        </Badge>
      );
    case 'TRIALING':
      return (
        <Badge
          variant="outline"
          className={`border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 ${className ?? ''}`}
        >
          Trial
        </Badge>
      );
    case 'PAST_DUE':
      return (
        <Badge
          variant="outline"
          className={`border-orange-500/30 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 ${className ?? ''}`}
        >
          Past Due
        </Badge>
      );
    case 'CANCELED':
      return (
        <Badge
          variant="outline"
          className={`border-muted-foreground/30 bg-muted text-muted-foreground ${className ?? ''}`}
        >
          Canceled
        </Badge>
      );
    case 'EXPIRED':
    case 'UNPAID':
      return (
        <Badge
          variant="outline"
          className={`border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 ${className ?? ''}`}
        >
          {status === 'EXPIRED' ? 'Expired' : 'Unpaid'}
        </Badge>
      );
    case 'INCOMPLETE':
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 ${className ?? ''}`}
        >
          Incomplete
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={className}>
          {status}
        </Badge>
      );
  }
}
