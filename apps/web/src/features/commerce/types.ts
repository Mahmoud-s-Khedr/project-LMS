import type {
  Product,
  ProductCreate,
  ProductUpdate,
  Price,
  PriceCreate,
  PriceUpdate,
  Coupon,
  CouponCreate,
  CouponUpdate,
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
  Refund,
  RefundInput,
  ProductsQuery,
  CouponsQuery,
  CursorResponse,
} from '@lms/shared';

export type {
  Product,
  ProductCreate,
  ProductUpdate,
  Price,
  PriceCreate,
  PriceUpdate,
  Coupon,
  CouponCreate,
  CouponUpdate,
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
  Refund,
  RefundInput,
  ProductsQuery,
  CouponsQuery,
  CursorResponse,
};

export type OrderStatus = Order['status'];
export type FulfillmentStatus = Order['fulfillmentStatus'];
export type SubscriptionStatus = Subscription['status'];
export type ProductType = Product['type'];
export type ProductStatus = Product['status'];
export type Payment = Order['payments'][number];

export interface CheckoutState {
  couponCode: string;
  appliedCoupon: string | null;
  cohortSelections: Record<string, string>; // courseId -> cohortId
  isSubmitting: boolean;
  error: string | null;
}
