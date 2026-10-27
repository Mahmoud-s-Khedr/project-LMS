import {
  orderSchema,
  subscriptionSchema,
  productSchema,
  priceSchema,
  couponSchema,
  refundSchema,
  checkoutQuoteSchema,
  checkoutSessionSchema,
  type Order,
  type Subscription,
  type Product,
  type Price,
  type Coupon,
  type Refund,
  type CheckoutQuote,
  type CheckoutSession,
} from '@lms/shared';

export const COMMERCE_FIXTURE_IDS = {
  workspace: '10000000-0000-4000-8000-000000000001',
  user: '10000000-0000-4000-8000-000000000002',
  course: '10000000-0000-4000-8000-000000000003',
  cohort: '10000000-0000-4000-8000-000000000004',
  price: '10000000-0000-4000-8000-000000000010',
  product: '10000000-0000-4000-8000-000000000011',
  order: '10000000-0000-4000-8000-000000000012',
  orderItem: '10000000-0000-4000-8000-000000000013',
  payment: '10000000-0000-4000-8000-000000000014',
  subscription: '10000000-0000-4000-8000-000000000015',
  coupon: '10000000-0000-4000-8000-000000000016',
  refund: '10000000-0000-4000-8000-000000000017',
} as const;

export const mockProduct: Product = productSchema.parse({
  id: COMMERCE_FIXTURE_IDS.product,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  type: 'COURSE',
  status: 'ACTIVE',
  slug: 'deep-learning-mastery',
  name: 'Deep Learning Mastery',
  description: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Master modern deep learning.' }] },
    ],
  },
  accessDurationDays: 365,
  courseIds: [COMMERCE_FIXTURE_IDS.course],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

export const mockPrice: Price = priceSchema.parse({
  id: COMMERCE_FIXTURE_IDS.price,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  productId: COMMERCE_FIXTURE_IDS.product,
  currency: 'usd',
  amount: 4900,
  interval: null,
  intervalCount: 1,
  trialDays: 0,
  isActive: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

export const mockRecurringPrice: Price = priceSchema.parse({
  id: '10000000-0000-4000-8000-000000000020',
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  productId: COMMERCE_FIXTURE_IDS.product,
  currency: 'usd',
  amount: 2900,
  interval: 'MONTH',
  intervalCount: 1,
  trialDays: 7,
  isActive: true,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

export const mockCoupon: Coupon = couponSchema.parse({
  id: COMMERCE_FIXTURE_IDS.coupon,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  rules: {
    kind: 'PERCENT',
    code: 'SAVE20',
    percentOff: '20.00',
    validFrom: '2026-10-01T00:00:00.000Z',
    validUntil: '2026-12-31T23:59:59.000Z',
    maxRedemptions: 100,
    maxPerUser: 1,
    minimumOrderAmount: 0,
    isActive: true,
  },
  productIds: [COMMERCE_FIXTURE_IDS.product],
  reservedUses: 5,
  redeemedUses: 12,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
});

export const mockCheckoutQuote: CheckoutQuote = checkoutQuoteSchema.parse({
  currency: 'usd',
  subtotal: 4900,
  discountTotal: 980,
  taxTotal: 0,
  grandTotal: 3920,
  items: [
    {
      priceId: COMMERCE_FIXTURE_IDS.price,
      productId: COMMERCE_FIXTURE_IDS.product,
      name: 'Deep Learning Mastery',
      quantity: 1,
      unitAmount: 4900,
      discountAmount: 980,
      taxAmount: 0,
      totalAmount: 3920,
    },
  ],
});

export const mockCheckoutSession: CheckoutSession = checkoutSessionSchema.parse({
  orderId: COMMERCE_FIXTURE_IDS.order,
  checkoutUrl: 'https://checkout.stripe.test/c/pay/cs_test_sample',
  expiresAt: '2026-10-27T10:00:00.000Z',
});

export const mockFreeCheckoutSession: CheckoutSession = checkoutSessionSchema.parse({
  orderId: COMMERCE_FIXTURE_IDS.order,
  checkoutUrl: null,
  expiresAt: null,
});

export const mockPaidOrder: Order = orderSchema.parse({
  id: COMMERCE_FIXTURE_IDS.order,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  number: 'ORD-2026-0001',
  status: 'PAID',
  currency: 'usd',
  subtotal: 4900,
  discountTotal: 980,
  taxTotal: 0,
  grandTotal: 3920,
  paidAt: '2026-10-26T12:00:00.000Z',
  expiresAt: null,
  createdAt: '2026-10-26T11:55:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
  fulfillmentStatus: 'FULFILLED',
  items: [
    {
      id: COMMERCE_FIXTURE_IDS.orderItem,
      priceId: COMMERCE_FIXTURE_IDS.price,
      productId: COMMERCE_FIXTURE_IDS.product,
      name: 'Deep Learning Mastery',
      quantity: 1,
      unitAmount: 4900,
      discountAmount: 980,
      taxAmount: 0,
      totalAmount: 3920,
      courses: [
        {
          courseId: COMMERCE_FIXTURE_IDS.course,
          cohortId: null,
          accessDurationDays: 365,
        },
      ],
    },
  ],
  payments: [
    {
      id: COMMERCE_FIXTURE_IDS.payment,
      workspaceId: COMMERCE_FIXTURE_IDS.workspace,
      status: 'SUCCEEDED',
      currency: 'usd',
      amount: 3920,
      paidAt: '2026-10-26T12:00:00.000Z',
      orderId: COMMERCE_FIXTURE_IDS.order,
      subscriptionId: null,
      createdAt: '2026-10-26T11:58:00.000Z',
      updatedAt: '2026-10-26T12:00:00.000Z',
    },
  ],
  refunds: [],
});

export const mockPendingOrder: Order = orderSchema.parse({
  id: COMMERCE_FIXTURE_IDS.order,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  number: 'ORD-2026-0002',
  status: 'PENDING',
  currency: 'usd',
  subtotal: 4900,
  discountTotal: 0,
  taxTotal: 0,
  grandTotal: 4900,
  paidAt: null,
  expiresAt: '2026-10-27T12:00:00.000Z',
  createdAt: '2026-10-26T12:00:00.000Z',
  updatedAt: '2026-10-26T12:00:00.000Z',
  fulfillmentStatus: 'PENDING',
  items: [
    {
      id: COMMERCE_FIXTURE_IDS.orderItem,
      priceId: COMMERCE_FIXTURE_IDS.price,
      productId: COMMERCE_FIXTURE_IDS.product,
      name: 'Deep Learning Mastery',
      quantity: 1,
      unitAmount: 4900,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 4900,
      courses: [
        {
          courseId: COMMERCE_FIXTURE_IDS.course,
          cohortId: null,
          accessDurationDays: 365,
        },
      ],
    },
  ],
  payments: [],
  refunds: [],
});

export const mockFulfillmentPendingOrder: Order = orderSchema.parse({
  ...mockPaidOrder,
  id: '10000000-0000-4000-8000-000000000033',
  number: 'ORD-2026-0003',
  fulfillmentStatus: 'PENDING',
});

export const mockRefund: Refund = refundSchema.parse({
  id: COMMERCE_FIXTURE_IDS.refund,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  paymentId: COMMERCE_FIXTURE_IDS.payment,
  status: 'SUCCEEDED',
  currency: 'usd',
  amount: 3920,
  reason: 'Student requested refund within guarantee period',
  revokeAccess: true,
  completedAt: '2026-10-26T12:30:00.000Z',
  createdAt: '2026-10-26T12:25:00.000Z',
  updatedAt: '2026-10-26T12:30:00.000Z',
});

export const mockRefundedOrder: Order = orderSchema.parse({
  ...mockPaidOrder,
  id: '10000000-0000-4000-8000-000000000044',
  number: 'ORD-2026-0004',
  status: 'REFUNDED',
  fulfillmentStatus: 'REVOKED',
  refunds: [mockRefund],
});

export const mockSubscription: Subscription = subscriptionSchema.parse({
  id: COMMERCE_FIXTURE_IDS.subscription,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  productId: COMMERCE_FIXTURE_IDS.product,
  priceId: '10000000-0000-4000-8000-000000000020',
  status: 'ACTIVE',
  currentPeriodStart: '2026-10-01T00:00:00.000Z',
  currentPeriodEnd: '2026-11-01T00:00:00.000Z',
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  courses: [
    {
      courseId: COMMERCE_FIXTURE_IDS.course,
      cohortId: null,
      accessDurationDays: null,
    },
  ],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
