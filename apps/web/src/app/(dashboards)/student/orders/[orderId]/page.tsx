'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMyOrderDetailQuery, OrderReceiptCard } from '@/features/commerce';

export default function StudentOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ?? '';

  const {
    data: order,
    isLoading,
    error,
    refetch,
  } = useMyOrderDetailQuery(orderId, {
    polling: true,
  });

  if (isLoading) {
    return (
      <div className="container max-w-4xl py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading order receipt...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container max-w-md py-12">
        <Card className="border-rose-500/30 text-center">
          <CardHeader>
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <CardTitle className="mt-2 text-lg">Order Not Found</CardTitle>
            <CardDescription>{error?.message || 'Unable to load order receipt.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
            <Button asChild size="sm">
              <Link href="/student/orders">Back to Orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <OrderReceiptCard order={order} showBackLink={true} />
    </div>
  );
}
