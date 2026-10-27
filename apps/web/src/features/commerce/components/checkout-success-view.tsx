'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Receipt, BookOpen, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/features/marketing/site-config';
import { useMyOrderDetailQuery } from '../hooks';
import { formatMoney } from '../utils';
import { OrderPollBanner } from './order-poll-banner';

interface CheckoutSuccessViewProps {
  orderId: string;
}

export function CheckoutSuccessView({ orderId }: CheckoutSuccessViewProps) {
  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useMyOrderDetailQuery(orderId, { polling: true });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Loading your order details...</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Checking confirmation and enrollment status.
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card className="border-rose-500/30">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
            <CardTitle className="text-xl mt-2">Could Not Load Order</CardTitle>
            <CardDescription>
              {error?.message || 'We could not find the specified order.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
            <Button asChild>
              <Link href="/student/orders">Go to My Orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPending = order.status === 'PENDING' || order.fulfillmentStatus === 'PENDING';

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Card className="overflow-hidden border border-border shadow-sm text-center">
        <CardHeader className="bg-muted/30 p-8 pb-6 border-b border-border">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
            {isPending ? (
              <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
            ) : (
              <CheckCircle2 className="h-7 w-7" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isPending ? 'Payment Received!' : 'Welcome Aboard!'}
          </CardTitle>
          <CardDescription className="text-sm mt-1 max-w-md mx-auto">
            {isPending
              ? 'Thank you for your enrollment with ' +
                siteConfig.name +
                '. We are finalizing your course permissions and cohort enrollment.'
              : 'Your enrollment in ' +
                siteConfig.name +
                ' is confirmed and active. You have full access to your curriculum and resources.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-8 space-y-6 text-left">
          {/* Live Polling Status Banner */}
          <OrderPollBanner orderStatus={order.status} fulfillmentStatus={order.fulfillmentStatus} />

          {/* Quick Summary */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Order Reference</span>
              <span className="font-mono font-semibold text-foreground">{order.number}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-semibold text-foreground">
                {formatMoney(order.grandTotal, order.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span className="text-foreground font-medium">
                {order.items.map((i) => i.name).join(', ')}
              </span>
            </div>
          </div>

          {/* Next Steps / CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild size="lg" className="flex-1 gap-2 shadow-sm">
              <Link href="/student">
                <BookOpen className="h-4 w-4" />
                Go to Student Portal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href={`/student/orders/${order.id}`}>
                <Receipt className="h-4 w-4" />
                View Full Receipt
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
