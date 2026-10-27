'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Receipt,
  Search,
  Calendar,
  Ban,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Order, OrderStatus } from '../types';
import { useMyOrdersQuery, useCancelOrderMutation } from '../hooks';
import { formatMoney, formatDate } from '../utils';
import { OrderStatusBadge } from './order-status-badge';
import { FulfillmentStatusBadge } from './fulfillment-status-badge';

export function StudentOrdersView() {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [search, setSearch] = React.useState('');

  const queryParams = React.useMemo(() => {
    return {
      status: statusFilter !== 'ALL' ? (statusFilter as OrderStatus) : undefined,
    };
  }, [statusFilter]);

  const { data: ordersResponse, isLoading, error, refetch } = useMyOrdersQuery(queryParams);

  // Filter client-side by search query (order number or product name)
  const orders = React.useMemo(() => {
    const list = ordersResponse?.data ?? [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter(
      (o) =>
        o.number.toLowerCase().includes(term) ||
        o.items.some((i) => i.name.toLowerCase().includes(term)),
    );
  }, [ordersResponse?.data, search]);

  // Order cancellation state
  const [cancelingOrder, setCancelingOrder] = React.useState<Order | null>(null);
  const cancelMutation = useCancelOrderMutation(cancelingOrder?.workspaceId ?? '');

  const handleConfirmCancel = async () => {
    if (!cancelingOrder) return;
    try {
      await cancelMutation.mutateAsync({ orderId: cancelingOrder.id });
      setCancelingOrder(null);
    } catch {
      // handled by mutation error state
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Order History & Receipts
          </h1>
          <p className="text-sm text-muted-foreground">
            View past course purchases, subscriptions, payment receipts, and fulfillment status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] text-xs">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PARTIALLY_REFUNDED">Partially Refunded</SelectItem>
              <SelectItem value="REFUNDED">Refunded</SelectItem>
              <SelectItem value="CANCELED">Canceled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search order number or course..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 text-xs"
        />
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 w-full animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : error ? (
        <Card className="border-rose-500/30">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <CardTitle className="text-lg mt-2">Error Loading Orders</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : orders.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-semibold text-foreground">No orders found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            {search || statusFilter !== 'ALL'
              ? 'No orders match your filter criteria. Try resetting filters.'
              : 'You have not placed any orders yet. Browse our course catalog to find courses.'}
          </p>
          <Button asChild size="sm">
            <Link href="/catalog">Explore Catalog</Link>
          </Button>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 gap-4 hover:bg-muted/20 transition-colors"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold text-sm text-foreground">
                    #{order.number}
                  </span>
                  <OrderStatusBadge status={order.status} />
                  <FulfillmentStatusBadge status={order.fulfillmentStatus} />
                </div>

                <div className="text-sm font-medium text-foreground">
                  {order.items.map((i) => i.name).join(', ')}
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(order.createdAt)}
                  </span>
                  <span>•</span>
                  <span>{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 self-end sm:self-center">
                <div className="text-right">
                  <span className="font-bold text-base text-foreground">
                    {formatMoney(order.grandTotal, order.currency)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link href={`/student/orders/${order.id}`}>
                      <Receipt className="h-4 w-4" />
                      Receipt
                    </Link>
                  </Button>

                  {order.status === 'PENDING' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCancelingOrder(order)}
                      className="text-muted-foreground hover:text-rose-600"
                    >
                      <Ban className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancel Order Confirmation Dialog */}
      <Dialog open={Boolean(cancelingOrder)} onOpenChange={() => setCancelingOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Pending Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel order #{cancelingOrder?.number}? Any pending
              seat reservations will be immediately released.
            </DialogDescription>
          </DialogHeader>

          {cancelMutation.isError && (
            <p className="text-xs text-rose-600 font-medium">
              {cancelMutation.error?.message || 'Failed to cancel order.'}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelingOrder(null)}
              disabled={cancelMutation.isPending}
            >
              Keep Order
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
