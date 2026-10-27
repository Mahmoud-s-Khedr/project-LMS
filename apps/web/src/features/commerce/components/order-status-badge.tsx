import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { OrderStatus } from '../types';

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  switch (status) {
    case 'PAID':
      return (
        <Badge
          variant="outline"
          className={`border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 ${className ?? ''}`}
        >
          Paid
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 ${className ?? ''}`}
        >
          Payment Pending
        </Badge>
      );
    case 'PARTIALLY_REFUNDED':
      return (
        <Badge
          variant="outline"
          className={`border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 ${className ?? ''}`}
        >
          Partially Refunded
        </Badge>
      );
    case 'REFUNDED':
      return (
        <Badge
          variant="outline"
          className={`border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 ${className ?? ''}`}
        >
          Refunded
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
      return (
        <Badge
          variant="outline"
          className={`border-muted-foreground/30 bg-muted text-muted-foreground ${className ?? ''}`}
        >
          Expired
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
