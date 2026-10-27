import {
  checkoutQuoteResponseSchema,
  checkoutSessionResponseSchema,
  ordersResponseSchema,
  orderResponseSchema,
  subscriptionsResponseSchema,
  subscriptionResponseSchema,
  billingPortalResponseSchema,
  productsResponseSchema,
  productResponseSchema,
  priceResponseSchema,
  couponsResponseSchema,
  couponResponseSchema,
  refundAcceptedResponseSchema,
  refundResponseSchema,
} from '@lms/shared';
import { api } from '@/lib/api';
import { formatCommerceEtag } from './utils';
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

function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

/* ============================================================================
   Checkout & Quotes
============================================================================ */

export async function getCheckoutQuote(
  workspaceId: string,
  input: CheckoutQuoteInput,
): Promise<CheckoutQuote> {
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/checkout/quote`, input);
  const parsed = checkoutQuoteResponseSchema.parse(raw);
  return parsed.data;
}

export async function createCheckoutSession(
  workspaceId: string,
  input: CheckoutSessionInput,
  idempotencyKey?: string,
): Promise<CheckoutSession> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/checkout/sessions`, input, {
    headers,
  });
  const parsed = checkoutSessionResponseSchema.parse(raw);
  return parsed.data;
}

/* ============================================================================
   Student / Owner Orders
============================================================================ */

export async function getMyOrders(query?: Partial<OrdersQuery>): Promise<CursorResponse<Order>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/me/orders${qs}`);
  const parsed = ordersResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function getMyOrder(orderId: string): Promise<Order> {
  const raw = await api.get<unknown>(`/me/orders/${orderId}`);
  const parsed = orderResponseSchema.parse(raw);
  return parsed.data;
}

export async function cancelOrder(
  workspaceId: string,
  orderId: string,
  idempotencyKey?: string,
): Promise<Order> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/orders/${orderId}/cancel`,
    {},
    { headers },
  );
  const parsed = orderResponseSchema.parse(raw);
  return parsed.data;
}

/* ============================================================================
   Student / Owner Subscriptions & Billing Portal
============================================================================ */

export async function getMySubscriptions(
  query?: Partial<SubscriptionsQuery>,
): Promise<CursorResponse<Subscription>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/me/subscriptions${qs}`);
  const parsed = subscriptionsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function getMySubscription(subscriptionId: string): Promise<Subscription> {
  const raw = await api.get<unknown>(`/me/subscriptions/${subscriptionId}`);
  const parsed = subscriptionResponseSchema.parse(raw);
  return parsed.data;
}

export async function cancelMySubscription(
  subscriptionId: string,
  idempotencyKey?: string,
): Promise<Subscription> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(
    `/me/subscriptions/${subscriptionId}/cancel`,
    {},
    { headers },
  );
  const parsed = subscriptionResponseSchema.parse(raw);
  return parsed.data;
}

export async function resumeMySubscription(
  subscriptionId: string,
  idempotencyKey?: string,
): Promise<Subscription> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(
    `/me/subscriptions/${subscriptionId}/resume`,
    {},
    { headers },
  );
  const parsed = subscriptionResponseSchema.parse(raw);
  return parsed.data;
}

export async function createBillingPortalSession(
  workspaceId: string,
  input: BillingPortalInput,
): Promise<{ url: string }> {
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/billing/portal-sessions`, input);
  const parsed = billingPortalResponseSchema.parse(raw);
  return parsed.data;
}

/* ============================================================================
   Admin Products & Prices
============================================================================ */

export async function getAdminProducts(
  workspaceId: string,
  query?: Partial<ProductsQuery>,
): Promise<CursorResponse<Product>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/products${qs}`);
  const parsed = productsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function getAdminProduct(workspaceId: string, productId: string): Promise<Product> {
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/products/${productId}`);
  const parsed = productResponseSchema.parse(raw);
  return parsed.data;
}

export async function createAdminProduct(
  workspaceId: string,
  input: ProductCreate,
): Promise<Product> {
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/products`, input);
  const parsed = productResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateAdminProduct(
  workspaceId: string,
  productId: string,
  input: ProductUpdate,
  etagOrUpdatedAt?: string | Date | null,
): Promise<Product> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  const raw = await api.patch<unknown>(`/workspaces/${workspaceId}/products/${productId}`, input, {
    headers,
  });
  const parsed = productResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteAdminProduct(
  workspaceId: string,
  productId: string,
  etagOrUpdatedAt?: string | Date | null,
): Promise<void> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  await api.delete<unknown>(`/workspaces/${workspaceId}/products/${productId}`, { headers });
}

export async function replaceAdminProductCourses(
  workspaceId: string,
  productId: string,
  courseIds: string[],
  etagOrUpdatedAt?: string | Date | null,
): Promise<Product> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  const raw = await api.put<unknown>(
    `/workspaces/${workspaceId}/products/${productId}/courses`,
    { courseIds },
    { headers },
  );
  const parsed = productResponseSchema.parse(raw);
  return parsed.data;
}

export async function createAdminPrice(
  workspaceId: string,
  productId: string,
  input: PriceCreate,
): Promise<Price> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/products/${productId}/prices`,
    input,
  );
  const parsed = priceResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateAdminPrice(
  workspaceId: string,
  productId: string,
  priceId: string,
  input: PriceUpdate,
  etagOrUpdatedAt?: string | Date | null,
): Promise<Price> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  const raw = await api.patch<unknown>(
    `/workspaces/${workspaceId}/products/${productId}/prices/${priceId}`,
    input,
    { headers },
  );
  const parsed = priceResponseSchema.parse(raw);
  return parsed.data;
}

/* ============================================================================
   Admin Coupons
============================================================================ */

export async function getAdminCoupons(
  workspaceId: string,
  query?: Partial<CouponsQuery>,
): Promise<CursorResponse<Coupon>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/coupons${qs}`);
  const parsed = couponsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function createAdminCoupon(workspaceId: string, input: CouponCreate): Promise<Coupon> {
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/coupons`, input);
  const parsed = couponResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateAdminCoupon(
  workspaceId: string,
  couponId: string,
  input: CouponUpdate,
  etagOrUpdatedAt?: string | Date | null,
): Promise<Coupon> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  const raw = await api.patch<unknown>(`/workspaces/${workspaceId}/coupons/${couponId}`, input, {
    headers,
  });
  const parsed = couponResponseSchema.parse(raw);
  return parsed.data;
}

export async function replaceAdminCouponProducts(
  workspaceId: string,
  couponId: string,
  productIds: string[],
  etagOrUpdatedAt?: string | Date | null,
): Promise<Coupon> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  const raw = await api.put<unknown>(
    `/workspaces/${workspaceId}/coupons/${couponId}/products`,
    { productIds },
    { headers },
  );
  const parsed = couponResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteAdminCoupon(
  workspaceId: string,
  couponId: string,
  etagOrUpdatedAt?: string | Date | null,
): Promise<void> {
  const headers: Record<string, string> = {
    'If-Match': formatCommerceEtag(etagOrUpdatedAt),
  };
  await api.delete<unknown>(`/workspaces/${workspaceId}/coupons/${couponId}`, { headers });
}

/* ============================================================================
   Admin Orders & Refunds
============================================================================ */

export async function getAdminOrders(
  workspaceId: string,
  query?: Partial<OrdersQuery>,
): Promise<CursorResponse<Order>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/orders${qs}`);
  const parsed = ordersResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function getAdminOrder(workspaceId: string, orderId: string): Promise<Order> {
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/orders/${orderId}`);
  const parsed = orderResponseSchema.parse(raw);
  return parsed.data;
}

export async function createPaymentRefund(
  workspaceId: string,
  paymentId: string,
  input: RefundInput,
  idempotencyKey?: string,
): Promise<{ operationId: string; status: 'PENDING' }> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/payments/${paymentId}/refunds`,
    input,
    { headers },
  );
  const parsed = refundAcceptedResponseSchema.parse(raw);
  return parsed.data;
}

export async function getAdminRefund(workspaceId: string, refundId: string): Promise<Refund> {
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/refunds/${refundId}`);
  const parsed = refundResponseSchema.parse(raw);
  return parsed.data;
}

export async function cancelAdminSubscription(
  workspaceId: string,
  subscriptionId: string,
  input: AdminSubscriptionCancel,
  idempotencyKey?: string,
): Promise<Subscription> {
  const headers: Record<string, string> = {};
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/subscriptions/${subscriptionId}/cancel`,
    input,
    { headers },
  );
  const parsed = subscriptionResponseSchema.parse(raw);
  return parsed.data;
}
