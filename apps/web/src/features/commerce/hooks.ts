'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CheckoutQuote,
  CheckoutQuoteInput,
  CheckoutSession,
  CheckoutSessionInput,
  Order,
  OrdersQuery,
  Subscription,
  SubscriptionsQuery,
  AdminSubscriptionCancel,
  BillingPortalInput,
  Product,
  ProductCreate,
  ProductUpdate,
  Price,
  PriceCreate,
  PriceUpdate,
  Coupon,
  CouponCreate,
  CouponUpdate,
  Refund,
  RefundInput,
  ProductsQuery,
  CouponsQuery,
  CursorResponse,
} from './types';
import {
  getCheckoutQuote,
  createCheckoutSession,
  getMyOrders,
  getMyOrder,
  cancelOrder,
  getMySubscriptions,
  getMySubscription,
  cancelMySubscription,
  resumeMySubscription,
  createBillingPortalSession,
  getAdminProducts,
  getAdminProduct,
  createAdminProduct,
  updateAdminProduct,
  deleteAdminProduct,
  replaceAdminProductCourses,
  createAdminPrice,
  updateAdminPrice,
  getAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  replaceAdminCouponProducts,
  deleteAdminCoupon,
  getAdminOrders,
  getAdminOrder,
  createPaymentRefund,
  getAdminRefund,
  cancelAdminSubscription,
} from './api';

export const COMMERCE_QUERY_KEYS = {
  quote: (workspaceId: string, input: CheckoutQuoteInput) =>
    ['commerce', 'quote', workspaceId, input] as const,
  orders: {
    all: ['commerce', 'orders'] as const,
    mine: (query?: Partial<OrdersQuery>) => ['commerce', 'orders', 'me', query] as const,
    myDetail: (id: string) => ['commerce', 'orders', 'me', id] as const,
    adminList: (workspaceId: string, query?: Partial<OrdersQuery>) =>
      ['commerce', 'admin', workspaceId, 'orders', query] as const,
    adminDetail: (workspaceId: string, id: string) =>
      ['commerce', 'admin', workspaceId, 'orders', id] as const,
  },
  subscriptions: {
    all: ['commerce', 'subscriptions'] as const,
    mine: (query?: Partial<SubscriptionsQuery>) =>
      ['commerce', 'subscriptions', 'me', query] as const,
    myDetail: (id: string) => ['commerce', 'subscriptions', 'me', id] as const,
    adminList: (workspaceId: string, query?: Partial<SubscriptionsQuery>) =>
      ['commerce', 'admin', workspaceId, 'subscriptions', query] as const,
  },
  products: {
    adminList: (workspaceId: string, query?: Partial<ProductsQuery>) =>
      ['commerce', 'admin', workspaceId, 'products', query] as const,
    adminDetail: (workspaceId: string, id: string) =>
      ['commerce', 'admin', workspaceId, 'products', id] as const,
  },
  coupons: {
    adminList: (workspaceId: string, query?: Partial<CouponsQuery>) =>
      ['commerce', 'admin', workspaceId, 'coupons', query] as const,
  },
  refunds: {
    adminDetail: (workspaceId: string, refundId: string) =>
      ['commerce', 'admin', workspaceId, 'refunds', refundId] as const,
  },
};

/* ============================================================================
   Checkout & Quote Hooks
============================================================================ */

export function useCheckoutQuoteQuery(
  workspaceId: string | null | undefined,
  input: CheckoutQuoteInput | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<CheckoutQuote>({
    queryKey:
      workspaceId && input ? COMMERCE_QUERY_KEYS.quote(workspaceId, input) : ['commerce', 'quote'],
    queryFn: () => {
      if (!workspaceId || !input) throw new Error('Missing workspaceId or input for quote');
      return getCheckoutQuote(workspaceId, input);
    },
    enabled: Boolean(workspaceId && input && input.items.length > 0 && (options?.enabled ?? true)),
    staleTime: 10_000,
  });
}

export function useCreateCheckoutSessionMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    CheckoutSession,
    Error,
    { input: CheckoutSessionInput; idempotencyKey?: string }
  >({
    mutationFn: ({ input, idempotencyKey }) =>
      createCheckoutSession(workspaceId, input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMMERCE_QUERY_KEYS.orders.all });
    },
  });
}

/* ============================================================================
   Student Orders Hooks
============================================================================ */

export function useMyOrdersQuery(query?: Partial<OrdersQuery>, options?: { enabled?: boolean }) {
  return useQuery<CursorResponse<Order>>({
    queryKey: COMMERCE_QUERY_KEYS.orders.mine(query),
    queryFn: () => getMyOrders(query),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useMyOrderDetailQuery(
  orderId: string,
  options?: { enabled?: boolean; polling?: boolean },
) {
  return useQuery<Order>({
    queryKey: COMMERCE_QUERY_KEYS.orders.myDetail(orderId),
    queryFn: () => getMyOrder(orderId),
    enabled: Boolean(orderId) && (options?.enabled ?? true),
    refetchInterval: (query) => {
      if (!options?.polling) return false;
      const data = query.state.data;
      if (!data) return 2000;
      // Continue polling if order is pending payment, or paid but fulfillment is still pending
      if (data.status === 'PENDING' || data.fulfillmentStatus === 'PENDING') {
        return 3000;
      }
      return false;
    },
  });
}

export function useCancelOrderMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<Order, Error, { orderId: string; idempotencyKey?: string }>({
    mutationFn: ({ orderId, idempotencyKey }) => cancelOrder(workspaceId, orderId, idempotencyKey),
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: COMMERCE_QUERY_KEYS.orders.all });
      queryClient.setQueryData(COMMERCE_QUERY_KEYS.orders.myDetail(order.id), order);
    },
  });
}

/* ============================================================================
   Student Subscriptions & Billing Portal Hooks
============================================================================ */

export function useMySubscriptionsQuery(
  query?: Partial<SubscriptionsQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Subscription>>({
    queryKey: COMMERCE_QUERY_KEYS.subscriptions.mine(query),
    queryFn: () => getMySubscriptions(query),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useMySubscriptionDetailQuery(
  subscriptionId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Subscription>({
    queryKey: COMMERCE_QUERY_KEYS.subscriptions.myDetail(subscriptionId),
    queryFn: () => getMySubscription(subscriptionId),
    enabled: Boolean(subscriptionId) && (options?.enabled ?? true),
  });
}

export function useCancelSubscriptionMutation() {
  const queryClient = useQueryClient();
  return useMutation<Subscription, Error, { subscriptionId: string; idempotencyKey?: string }>({
    mutationFn: ({ subscriptionId, idempotencyKey }) =>
      cancelMySubscription(subscriptionId, idempotencyKey),
    onSuccess: (sub) => {
      void queryClient.invalidateQueries({ queryKey: COMMERCE_QUERY_KEYS.subscriptions.all });
      queryClient.setQueryData(COMMERCE_QUERY_KEYS.subscriptions.myDetail(sub.id), sub);
    },
  });
}

export function useResumeSubscriptionMutation() {
  const queryClient = useQueryClient();
  return useMutation<Subscription, Error, { subscriptionId: string; idempotencyKey?: string }>({
    mutationFn: ({ subscriptionId, idempotencyKey }) =>
      resumeMySubscription(subscriptionId, idempotencyKey),
    onSuccess: (sub) => {
      void queryClient.invalidateQueries({ queryKey: COMMERCE_QUERY_KEYS.subscriptions.all });
      queryClient.setQueryData(COMMERCE_QUERY_KEYS.subscriptions.myDetail(sub.id), sub);
    },
  });
}

export function useBillingPortalMutation(workspaceId: string) {
  return useMutation<{ url: string }, Error, BillingPortalInput>({
    mutationFn: (input) => createBillingPortalSession(workspaceId, input),
  });
}

/* ============================================================================
   Admin Products & Prices Hooks
============================================================================ */

export function useAdminProductsQuery(
  workspaceId: string,
  query?: Partial<ProductsQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Product>>({
    queryKey: COMMERCE_QUERY_KEYS.products.adminList(workspaceId, query),
    queryFn: () => getAdminProducts(workspaceId, query),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useAdminProductDetailQuery(
  workspaceId: string,
  productId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Product>({
    queryKey: COMMERCE_QUERY_KEYS.products.adminDetail(workspaceId, productId),
    queryFn: () => getAdminProduct(workspaceId, productId),
    enabled: Boolean(workspaceId && productId) && (options?.enabled ?? true),
  });
}

export function useCreateProductMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<Product, Error, ProductCreate>({
    mutationFn: (input) => createAdminProduct(workspaceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
    },
  });
}

export function useUpdateProductMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Product,
    Error,
    { productId: string; input: ProductUpdate; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: ({ productId, input, etagOrUpdatedAt }) =>
      updateAdminProduct(workspaceId, productId, input, etagOrUpdatedAt),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
      queryClient.setQueryData(
        COMMERCE_QUERY_KEYS.products.adminDetail(workspaceId, updated.id),
        updated,
      );
    },
  });
}

export function useDeleteProductMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    string | { productId: string; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: (param) => {
      const productId = typeof param === 'string' ? param : param.productId;
      const etag = typeof param === 'string' ? undefined : param.etagOrUpdatedAt;
      return deleteAdminProduct(workspaceId, productId, etag);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
    },
  });
}

export function useReplaceProductCoursesMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Product,
    Error,
    { productId: string; courseIds: string[]; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: ({ productId, courseIds, etagOrUpdatedAt }) =>
      replaceAdminProductCourses(workspaceId, productId, courseIds, etagOrUpdatedAt),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
      queryClient.setQueryData(
        COMMERCE_QUERY_KEYS.products.adminDetail(workspaceId, updated.id),
        updated,
      );
    },
  });
}

export function useCreatePriceMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<Price, Error, { productId: string; input: PriceCreate }>({
    mutationFn: ({ productId, input }) => createAdminPrice(workspaceId, productId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
    },
  });
}

export function useUpdatePriceMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Price,
    Error,
    {
      productId: string;
      priceId: string;
      input: PriceUpdate;
      etagOrUpdatedAt?: string | Date | null;
    }
  >({
    mutationFn: ({ productId, priceId, input, etagOrUpdatedAt }) =>
      updateAdminPrice(workspaceId, productId, priceId, input, etagOrUpdatedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'products'],
      });
    },
  });
}

/* ============================================================================
   Admin Coupons Hooks
============================================================================ */

export function useAdminCouponsQuery(
  workspaceId: string,
  query?: Partial<CouponsQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Coupon>>({
    queryKey: COMMERCE_QUERY_KEYS.coupons.adminList(workspaceId, query),
    queryFn: () => getAdminCoupons(workspaceId, query),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useCreateCouponMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<Coupon, Error, CouponCreate>({
    mutationFn: (input) => createAdminCoupon(workspaceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'coupons'],
      });
    },
  });
}

export function useUpdateCouponMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Coupon,
    Error,
    { couponId: string; input: CouponUpdate; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: ({ couponId, input, etagOrUpdatedAt }) =>
      updateAdminCoupon(workspaceId, couponId, input, etagOrUpdatedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'coupons'],
      });
    },
  });
}

export function useReplaceCouponProductsMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Coupon,
    Error,
    { couponId: string; productIds: string[]; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: ({ couponId, productIds, etagOrUpdatedAt }) =>
      replaceAdminCouponProducts(workspaceId, couponId, productIds, etagOrUpdatedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'coupons'],
      });
    },
  });
}

export function useDeleteCouponMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    string | { couponId: string; etagOrUpdatedAt?: string | Date | null }
  >({
    mutationFn: (param) => {
      const couponId = typeof param === 'string' ? param : param.couponId;
      const etag = typeof param === 'string' ? undefined : param.etagOrUpdatedAt;
      return deleteAdminCoupon(workspaceId, couponId, etag);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'coupons'],
      });
    },
  });
}

/* ============================================================================
   Admin Orders & Refunds Hooks
============================================================================ */

export function useAdminOrdersQuery(
  workspaceId: string,
  query?: Partial<OrdersQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Order>>({
    queryKey: COMMERCE_QUERY_KEYS.orders.adminList(workspaceId, query),
    queryFn: () => getAdminOrders(workspaceId, query),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useAdminOrderDetailQuery(
  workspaceId: string,
  orderId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Order>({
    queryKey: COMMERCE_QUERY_KEYS.orders.adminDetail(workspaceId, orderId),
    queryFn: () => getAdminOrder(workspaceId, orderId),
    enabled: Boolean(workspaceId && orderId) && (options?.enabled ?? true),
  });
}

export function useAdminRefundMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    { operationId: string; status: 'PENDING' },
    Error,
    { paymentId: string; input: RefundInput; idempotencyKey?: string }
  >({
    mutationFn: ({ paymentId, input, idempotencyKey }) =>
      createPaymentRefund(workspaceId, paymentId, input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'orders'],
      });
    },
  });
}

export function useAdminRefundQuery(
  workspaceId: string,
  refundId: string,
  options?: { enabled?: boolean; polling?: boolean },
) {
  return useQuery<Refund>({
    queryKey: COMMERCE_QUERY_KEYS.refunds.adminDetail(workspaceId, refundId),
    queryFn: () => getAdminRefund(workspaceId, refundId),
    enabled: Boolean(workspaceId && refundId) && (options?.enabled ?? true),
    refetchInterval: (query) => {
      if (!options?.polling) return false;
      const data = query.state.data;
      if (!data || data.status === 'PENDING') return 2500;
      return false;
    },
  });
}

export function useAdminCancelSubscriptionMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    Subscription,
    Error,
    { subscriptionId: string; input: AdminSubscriptionCancel; idempotencyKey?: string }
  >({
    mutationFn: ({ subscriptionId, input, idempotencyKey }) =>
      cancelAdminSubscription(workspaceId, subscriptionId, input, idempotencyKey),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'admin', workspaceId, 'subscriptions'],
      });
    },
  });
}
