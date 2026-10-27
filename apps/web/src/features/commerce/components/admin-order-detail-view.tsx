'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Receipt,
  Calendar,
  CreditCard,
  RefreshCcw,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Payment } from '../types';
import { useAdminOrderDetailQuery, useAdminRefundQuery } from '../hooks';
import { formatMoney, formatDateTime } from '../utils';
import { OrderStatusBadge } from './order-status-badge';
import { FulfillmentStatusBadge } from './fulfillment-status-badge';
import { RefundDialog } from './refund-dialog';

interface AdminOrderDetailViewProps {
  workspaceId: string;
  orderId: string;
}

export function AdminOrderDetailView({ workspaceId, orderId }: AdminOrderDetailViewProps) {
  const { data: order, isLoading, error, refetch } = useAdminOrderDetailQuery(workspaceId, orderId);

  // Refund dialog state
  const [selectedPayment, setSelectedPayment] = React.useState<Payment | null>(null);
  const [refundSuccessOpId, setRefundSuccessOpId] = React.useState<string | null>(null);

  const { data: polledRefund } = useAdminRefundQuery(workspaceId, refundSuccessOpId ?? '', {
    enabled: Boolean(refundSuccessOpId),
    polling: true,
  });

  React.useEffect(() => {
    if (polledRefund?.status === 'SUCCEEDED' || polledRefund?.status === 'FAILED') {
      void refetch();
    }
  }, [polledRefund?.status, refetch]);

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded-lg border bg-muted/30" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="border-rose-500/30 text-center">
          <CardHeader>
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <CardTitle className="mt-2">Order Not Found</CardTitle>
            <CardDescription>
              {error?.message || 'Unable to retrieve order details.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/admin/commerce">Back to Orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const refundablePayment = order.payments.find(
    (p) => p.status === 'SUCCEEDED' && order.status !== 'REFUNDED',
  );

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-xs">
          <Link href="/admin/commerce">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Orders
          </Link>
        </Button>
      </div>

      {refundSuccessOpId && (
        <div
          role="status"
          className={`rounded-lg border p-4 text-xs flex items-center justify-between ${
            polledRefund?.status === 'SUCCEEDED'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
              : polledRefund?.status === 'FAILED'
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {polledRefund?.status === 'SUCCEEDED' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : polledRefund?.status === 'FAILED' ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            ) : (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
            )}
            <span>
              {polledRefund?.status === 'SUCCEEDED' ? (
                <>
                  Refund operation <span className="font-mono">{refundSuccessOpId}</span> has
                  completed successfully.
                </>
              ) : polledRefund?.status === 'FAILED' ? (
                <>
                  Refund operation <span className="font-mono">{refundSuccessOpId}</span> failed.
                </>
              ) : (
                <>
                  Refund operation <span className="font-mono">{refundSuccessOpId}</span> accepted
                  (HTTP 202) and processing. Polling status...
                </>
              )}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRefundSuccessOpId(null);
              void refetch();
            }}
            className="h-6 text-[11px]"
          >
            {polledRefund?.status === 'SUCCEEDED' || polledRefund?.status === 'FAILED'
              ? 'Dismiss'
              : 'Refresh'}
          </Button>
        </div>
      )}

      {/* Main Order Header Card */}
      <Card className="overflow-hidden">
        <CardHeader className="bg-muted/30 p-6 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-5 w-5 text-primary" />
                <span className="font-mono text-sm text-muted-foreground">
                  Order ID: {order.id}
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Order #{order.number}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 text-xs">
                <Calendar className="h-3.5 w-3.5" />
                Created {formatDateTime(order.createdAt)}
                {order.paidAt && ` • Paid ${formatDateTime(order.paidAt)}`}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusBadge status={order.status} />
              <FulfillmentStatusBadge status={order.fulfillmentStatus} />

              {refundablePayment && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedPayment(refundablePayment)}
                  className="gap-1.5 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Issue Refund
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Purchased Items & Snapshots */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Purchased Product Items
            </h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {order.items.map((item) => (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-foreground text-sm">{item.name}</h4>
                      <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                        <span>Quantity: {item.quantity}</span>
                        <span>•</span>
                        <span>Item ID: {item.id}</span>
                        <span>•</span>
                        <span>Product ID: {item.productId}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-foreground text-sm">
                        {formatMoney(item.totalAmount, order.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Course Entitlements snapshot */}
                  {item.courses && item.courses.length > 0 && (
                    <div className="mt-2 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Entitled Course Access:</span>
                      <ul className="mt-1 list-disc pl-4 space-y-0.5">
                        {item.courses.map((c, i) => (
                          <li key={i}>
                            Course: <span className="font-mono">{c.courseId}</span>
                            {c.cohortId && (
                              <span className="ml-2 font-mono bg-background px-1.5 py-0.5 rounded border border-border">
                                Cohort: {c.cohortId}
                              </span>
                            )}
                            {c.accessDurationDays && (
                              <span className="ml-2">({c.accessDurationDays} days)</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Financial Totals Reconciliation */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(order.subtotal, order.currency)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount</span>
                  <span>-{formatMoney(order.discountTotal, order.currency)}</span>
                </div>
              )}
              {order.taxTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatMoney(order.taxTotal, order.currency)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-sm text-foreground pt-1">
                <span>Grand Total</span>
                <span>{formatMoney(order.grandTotal, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Payments & Refunds */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Accounting & Ledger Records
            </h3>

            {/* Payments list */}
            {order.payments.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" />
                  Payments
                </span>
                <div className="divide-y divide-border rounded-md border border-border text-xs">
                  {order.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3">
                      <div className="space-y-0.5">
                        <div className="font-mono font-medium text-foreground">
                          Payment ID: {p.id}
                        </div>
                        <div className="text-muted-foreground">
                          Status: {p.status} • {formatDateTime(p.paidAt ?? p.createdAt)}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-foreground">
                          {formatMoney(p.amount, p.currency)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
            )}

            {/* Refunds list */}
            {order.refunds.length > 0 && (
              <div className="space-y-2 pt-2">
                <span className="text-xs font-medium text-rose-600 flex items-center gap-1.5">
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Refunds
                </span>
                <div className="divide-y divide-rose-500/20 rounded-md border border-rose-500/20 bg-rose-500/5 text-xs">
                  {order.refunds.map((r) => (
                    <div key={r.id} className="p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium text-rose-800 dark:text-rose-300">
                          Refund #{r.id}
                        </span>
                        <span className="font-bold text-rose-800 dark:text-rose-300">
                          -{formatMoney(r.amount, r.currency)}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        Reason: {r.reason} • Status: {r.status} • Completed:{' '}
                        {formatDateTime(r.completedAt ?? r.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Refund Modal */}
      {selectedPayment && (
        <RefundDialog
          order={order}
          payment={selectedPayment}
          workspaceId={workspaceId}
          isOpen={Boolean(selectedPayment)}
          onClose={() => setSelectedPayment(null)}
          onSuccess={(opId) => {
            setRefundSuccessOpId(opId);
            void refetch();
          }}
        />
      )}
    </div>
  );
}
