import * as React from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { OrderStatus, FulfillmentStatus } from '../types';

interface OrderPollBannerProps {
  orderStatus: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  className?: string;
}

export function OrderPollBanner({
  orderStatus,
  fulfillmentStatus,
  className,
}: OrderPollBannerProps) {
  if (orderStatus === 'PENDING') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 ${className ?? ''}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <p className="font-medium">Awaiting payment confirmation</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            We are waiting for Stripe to confirm your payment. This page updates automatically.
          </p>
        </div>
      </div>
    );
  }

  if (orderStatus === 'PAID' && fulfillmentStatus === 'PENDING') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200 ${className ?? ''}`}
      >
        <Loader2 className="h-5 w-5 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
        <div>
          <p className="font-medium">Payment received — setting up your access</p>
          <p className="text-xs text-sky-800/80 dark:text-sky-300/80">
            Your payment is verified. Your course enrollments and cohort access are being
            provisioned...
          </p>
        </div>
      </div>
    );
  }

  if (orderStatus === 'PAID' && fulfillmentStatus === 'FULFILLED') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:text-emerald-200 ${className ?? ''}`}
      >
        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <div>
          <p className="font-medium">Everything is ready!</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Your enrollment is active. You can start learning immediately.
          </p>
        </div>
      </div>
    );
  }

  if (orderStatus === 'CANCELED') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-muted-foreground/30 bg-muted/30 p-4 text-sm text-muted-foreground ${className ?? ''}`}
      >
        <AlertCircle className="h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium text-foreground">Order canceled</p>
          <p className="text-xs">
            This order has been canceled and any reserved seats were released.
          </p>
        </div>
      </div>
    );
  }

  if (orderStatus === 'EXPIRED') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200 ${className ?? ''}`}
      >
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
        <div>
          <p className="font-medium">Checkout session expired</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
            Payment was not completed before the session expired. You may start a new checkout.
          </p>
        </div>
      </div>
    );
  }

  if (fulfillmentStatus === 'REVOKED') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-900 dark:text-rose-200 ${className ?? ''}`}
      >
        <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
        <div>
          <p className="font-medium">Access revoked</p>
          <p className="text-xs text-rose-800/80 dark:text-rose-300/80">
            Course access for this order has been revoked following a refund or administrative
            update.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
