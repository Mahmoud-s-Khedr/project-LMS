'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Printer,
  Calendar,
  Receipt,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  RefreshCcw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { siteConfig } from '@/features/marketing/site-config';
import type { Order } from '../types';
import { formatMoney, formatDateTime, formatDate } from '../utils';
import { OrderStatusBadge } from './order-status-badge';
import { FulfillmentStatusBadge } from './fulfillment-status-badge';
import { OrderPollBanner } from './order-poll-banner';

interface OrderReceiptCardProps {
  order: Order;
  showBackLink?: boolean;
}

export function OrderReceiptCard({ order, showBackLink = true }: OrderReceiptCardProps) {
  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const isFulfilled = order.fulfillmentStatus === 'FULFILLED';
  const hasRefunds = order.refunds && order.refunds.length > 0;

  return (
    <div className="space-y-6">
      {/* Live Polling Banner for In-Progress Transactions */}
      <OrderPollBanner
        orderStatus={order.status}
        fulfillmentStatus={order.fulfillmentStatus}
      />

      <Card className="overflow-hidden border border-border shadow-sm print:border-none print:shadow-none">
        {/* Printable Invoice Header */}
        <CardHeader className="bg-muted/40 p-6 pb-5 sm:p-8 sm:pb-6 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Receipt className="h-5 w-5 text-primary" />
                <span className="font-semibold text-lg tracking-tight text-foreground">
                  {siteConfig.name} Receipt
                </span>
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Order #{order.number}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1 text-xs">
                <Calendar className="h-3.5 w-3.5" />
                Placed on {formatDateTime(order.createdAt)}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <OrderStatusBadge status={order.status} />
              <FulfillmentStatusBadge status={order.fulfillmentStatus} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 ml-2"
                aria-label="Print receipt"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 space-y-8">
          {/* Purchased Items Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Purchased Items
            </h3>
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {order.items.map((item) => (
                <div key={item.id} className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-foreground">{item.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Quantity: {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold text-foreground">
                        {formatMoney(item.totalAmount, order.currency)}
                      </span>
                      {item.discountAmount > 0 && (
                        <p className="text-xs text-emerald-600 line-through">
                          {formatMoney(item.unitAmount, order.currency)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Included Courses / Entitlements */}
                  {item.courses && item.courses.length > 0 && (
                    <div className="mt-3 rounded-md bg-muted/50 p-3 text-xs space-y-1.5">
                      <div className="font-medium text-muted-foreground flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" />
                        Included Course Access:
                      </div>
                      <ul className="space-y-1 pl-5 list-disc text-muted-foreground">
                        {item.courses.map((c, i) => (
                          <li key={i}>
                            <span>Course ID: {c.courseId}</span>
                            {c.cohortId && (
                              <span className="ml-2 font-mono text-[11px] bg-background px-1.5 py-0.5 rounded border border-border">
                                Cohort: {c.cohortId}
                              </span>
                            )}
                            {c.accessDurationDays && (
                              <span className="ml-2 text-foreground/80">
                                ({c.accessDurationDays} days access)
                              </span>
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

          {/* Totals Breakdown */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatMoney(order.subtotal, order.currency)}</span>
              </div>
              {order.discountTotal > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
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
              <div className="flex justify-between font-bold text-base text-foreground pt-1">
                <span>Total Paid</span>
                <span>{formatMoney(order.grandTotal, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Payment & Refund History Ledger */}
          {(order.payments.length > 0 || hasRefunds) && (
            <div className="space-y-4 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Transaction History
              </h3>

              {order.payments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Payments:
                  </div>
                  <div className="divide-y divide-border/60 rounded-md border border-border/80 bg-muted/20 text-xs">
                    {order.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3">
                        <div>
                          <span className="font-medium text-foreground">
                            Payment ID: {p.id.slice(0, 8)}...
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {formatDateTime(p.paidAt ?? p.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {formatMoney(p.amount, p.currency)}
                          </span>
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasRefunds && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Refunds Issued:
                  </div>
                  <div className="divide-y divide-rose-500/20 rounded-md border border-rose-500/20 bg-rose-500/5 text-xs">
                    {order.refunds.map((r) => (
                      <div key={r.id} className="p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-rose-800 dark:text-rose-300">
                            Refund #{r.id.slice(0, 8)}...
                          </span>
                          <span className="font-semibold text-rose-800 dark:text-rose-300">
                            -{formatMoney(r.amount, r.currency)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Reason: {r.reason} • {formatDate(r.completedAt ?? r.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-border print:hidden">
            {showBackLink ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/student/orders">
                  ← Back to My Orders
                </Link>
              </Button>
            ) : <div />}

            {isFulfilled && (
              <Button asChild className="gap-2">
                <Link href="/student">
                  <ShieldCheck className="h-4 w-4" />
                  Access Student Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
