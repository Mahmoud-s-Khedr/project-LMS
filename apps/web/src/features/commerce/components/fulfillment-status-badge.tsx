import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import type { FulfillmentStatus } from '../types';

interface FulfillmentStatusBadgeProps {
  status: FulfillmentStatus;
  className?: string;
}

export function FulfillmentStatusBadge({ status, className }: FulfillmentStatusBadgeProps) {
  switch (status) {
    case 'FULFILLED':
      return (
        <Badge
          variant="outline"
          className={`border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 ${className ?? ''}`}
        >
          Access Granted
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge
          variant="outline"
          className={`border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 animate-pulse ${className ?? ''}`}
        >
          Provisioning Access
        </Badge>
      );
    case 'PARTIALLY_FULFILLED':
      return (
        <Badge
          variant="outline"
          className={`border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 ${className ?? ''}`}
        >
          Partial Access
        </Badge>
      );
    case 'REVOKED':
      return (
        <Badge
          variant="outline"
          className={`border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 ${className ?? ''}`}
        >
          Access Revoked
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
