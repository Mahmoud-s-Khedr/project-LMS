'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, Tag, Receipt, Plus, Edit2, Trash2, Archive } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActiveWorkspace } from '@/features/workspaces';
import type { Product, Coupon, OrderStatus } from '../types';
import {
  useAdminProductsQuery,
  useAdminCouponsQuery,
  useAdminOrdersQuery,
  useDeleteProductMutation,
  useDeleteCouponMutation,
} from '../hooks';
import { formatMoney, formatDate } from '../utils';
import { OrderStatusBadge } from './order-status-badge';
import { FulfillmentStatusBadge } from './fulfillment-status-badge';
import { ProductDialog } from './product-dialog';
import { PriceDialog } from './price-dialog';
import { CouponDialog } from './coupon-dialog';

export function AdminCommerceView() {
  const { activeWorkspaceId } = useActiveWorkspace();
  const workspaceId = activeWorkspaceId ?? '';

  const [activeTab, setActiveTab] = React.useState('products');

  // Products Query
  const {
    data: productsResponse,
    isLoading: isProductsLoading,
    refetch: refetchProducts,
  } = useAdminProductsQuery(workspaceId, {}, { enabled: Boolean(workspaceId) });
  const products = productsResponse?.data ?? [];

  // Coupons Query
  const {
    data: couponsResponse,
    isLoading: isCouponsLoading,
    refetch: refetchCoupons,
  } = useAdminCouponsQuery(workspaceId, {}, { enabled: Boolean(workspaceId) });
  const coupons = couponsResponse?.data ?? [];

  // Orders Query
  const [orderStatusFilter, setOrderStatusFilter] = React.useState<string>('ALL');
  const { data: ordersResponse, isLoading: isOrdersLoading } = useAdminOrdersQuery(
    workspaceId,
    { status: orderStatusFilter !== 'ALL' ? (orderStatusFilter as OrderStatus) : undefined },
    { enabled: Boolean(workspaceId) },
  );
  const orders = ordersResponse?.data ?? [];

  // Modal dialog states
  const [isProductDialogOpen, setIsProductDialogOpen] = React.useState(false);
  const [editingProduct, setEditingProduct] = React.useState<Product | null>(null);

  const [isPriceDialogOpen, setIsPriceDialogOpen] = React.useState(false);
  const [priceProduct, setPriceProduct] = React.useState<Product | null>(null);

  const [isCouponDialogOpen, setIsCouponDialogOpen] = React.useState(false);
  const [editingCoupon, setEditingCoupon] = React.useState<Coupon | null>(null);

  // Deletion mutations
  const deleteProductMutation = useDeleteProductMutation(workspaceId);
  const deleteCouponMutation = useDeleteCouponMutation(workspaceId);

  const handleDeleteProduct = async (product: Product) => {
    if (confirm('Are you sure you want to archive this product?')) {
      try {
        await deleteProductMutation.mutateAsync({
          productId: product.id,
          etagOrUpdatedAt: product.updatedAt,
        });
        void refetchProducts();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to archive product');
      }
    }
  };

  const handleDeleteCoupon = async (coupon: Coupon) => {
    if (confirm('Are you sure you want to disable/delete this coupon?')) {
      try {
        await deleteCouponMutation.mutateAsync({
          couponId: coupon.id,
          etagOrUpdatedAt: coupon.updatedAt,
        });
        void refetchCoupons();
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to delete coupon');
      }
    }
  };

  if (!workspaceId) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Package className="mx-auto h-8 w-8 mb-2 opacity-50" />
        <p>Please select a workspace to manage commerce.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Commerce Administration
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage course products, pricing tiers, promotional coupons, order accounting, and
            refunds.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="products" className="text-xs">
            <Package className="h-3.5 w-3.5 mr-1.5" />
            Products & Pricing
          </TabsTrigger>
          <TabsTrigger value="coupons" className="text-xs">
            <Tag className="h-3.5 w-3.5 mr-1.5" />
            Coupons
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">
            <Receipt className="h-3.5 w-3.5 mr-1.5" />
            Orders & Accounting
          </TabsTrigger>
        </TabsList>

        {/* ============================================================== */}
        {/* TAB 1: PRODUCTS & PRICING                                      */}
        {/* ============================================================== */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold tracking-tight">Workspace Products</h2>
            <Button
              size="sm"
              onClick={() => {
                setEditingProduct(null);
                setIsProductDialogOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Product
            </Button>
          </div>

          {isProductsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-28 w-full animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <Card className="border-dashed p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold">No products created yet</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Create a product to package and sell your courses to students.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingProduct(null);
                  setIsProductDialogOpen(true);
                }}
              >
                Create First Product
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {products.map((p) => (
                <Card key={p.id} className="overflow-hidden">
                  <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border bg-muted/10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-foreground">{p.name}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {p.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            p.status === 'ACTIVE'
                              ? 'border-emerald-500/30 text-emerald-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        Slug: /{p.slug} • {p.courseIds.length} course(s)
                        {p.accessDurationDays
                          ? ` • ${p.accessDurationDays} days access`
                          : ' • Lifetime'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPriceProduct(p);
                          setIsPriceDialogOpen(true);
                        }}
                        className="text-xs gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Price
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingProduct(p);
                          setIsProductDialogOpen(true);
                        }}
                        className="text-xs gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProduct(p)}
                        className="text-xs text-muted-foreground hover:text-rose-600"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 2: COUPONS                                                 */}
        {/* ============================================================== */}
        <TabsContent value="coupons" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold tracking-tight">Active Coupons & Discounts</h2>
            <Button
              size="sm"
              onClick={() => {
                setEditingCoupon(null);
                setIsCouponDialogOpen(true);
              }}
              className="gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              New Coupon
            </Button>
          </div>

          {isCouponsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 w-full animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : coupons.length === 0 ? (
            <Card className="border-dashed p-8 text-center">
              <Tag className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold">No promotional coupons</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Create percent-off or fixed discount coupons for student marketing campaigns.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  setEditingCoupon(null);
                  setIsCouponDialogOpen(true);
                }}
              >
                Create Coupon
              </Button>
            </Card>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {coupons.map((c) => {
                return (
                  <div
                    key={c.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground">
                          {c.rules.code}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            c.rules.isActive
                              ? 'border-emerald-500/30 text-emerald-600'
                              : 'text-muted-foreground'
                          }
                        >
                          {c.rules.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>

                      <div className="text-xs text-muted-foreground space-x-2">
                        <span className="font-semibold text-foreground">
                          {c.rules.kind === 'PERCENT'
                            ? `${c.rules.percentOff}% off`
                            : `-${formatMoney(c.rules.amountOff, c.rules.currency)}`}
                        </span>
                        <span>•</span>
                        <span>
                          Valid: {formatDate(c.rules.validFrom)} –{' '}
                          {c.rules.validUntil ? formatDate(c.rules.validUntil) : 'No expiry'}
                        </span>
                        <span>•</span>
                        <span>
                          Redemptions: {c.redeemedUses}
                          {c.rules.maxRedemptions ? ` / ${c.rules.maxRedemptions}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCoupon(c);
                          setIsCouponDialogOpen(true);
                        }}
                        className="text-xs gap-1"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCoupon(c)}
                        className="text-xs text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================================================== */}
        {/* TAB 3: ORDERS & ACCOUNTING                                     */}
        {/* ============================================================== */}
        <TabsContent value="orders" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Orders & Refunds Ledger</h2>
            <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
              <SelectTrigger className="w-[160px] text-xs">
                <SelectValue placeholder="All Statuses" />
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

          {isOrdersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <Card className="border-dashed p-8 text-center">
              <Receipt className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
              <p className="text-sm font-semibold">No orders recorded</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Orders placed by students will be logged here for accounting and fulfillment.
              </p>
            </Card>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card">
              {orders.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 hover:bg-muted/10 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-foreground">
                        #{o.number}
                      </span>
                      <OrderStatusBadge status={o.status} />
                      <FulfillmentStatusBadge status={o.fulfillmentStatus} />
                    </div>
                    <div className="text-xs text-muted-foreground space-x-2">
                      <span>{o.items.map((i) => i.name).join(', ')}</span>
                      <span>•</span>
                      <span>{formatDate(o.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 self-end sm:self-center">
                    <span className="font-bold text-sm text-foreground">
                      {formatMoney(o.grandTotal, o.currency)}
                    </span>
                    <Button asChild variant="outline" size="sm" className="text-xs">
                      <Link href={`/admin/commerce/orders/${o.id}`}>View Accounting</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Modal */}
      {isProductDialogOpen && (
        <ProductDialog
          workspaceId={workspaceId}
          product={editingProduct}
          isOpen={isProductDialogOpen}
          onClose={() => setIsProductDialogOpen(false)}
          onSuccess={() => void refetchProducts()}
        />
      )}

      {/* Price Modal */}
      {isPriceDialogOpen && priceProduct && (
        <PriceDialog
          workspaceId={workspaceId}
          product={priceProduct}
          isOpen={isPriceDialogOpen}
          onClose={() => {
            setIsPriceDialogOpen(false);
            setPriceProduct(null);
          }}
          onSuccess={() => void refetchProducts()}
        />
      )}

      {/* Coupon Modal */}
      {isCouponDialogOpen && (
        <CouponDialog
          workspaceId={workspaceId}
          coupon={editingCoupon}
          isOpen={isCouponDialogOpen}
          onClose={() => setIsCouponDialogOpen(false)}
          onSuccess={() => void refetchCoupons()}
        />
      )}
    </div>
  );
}
