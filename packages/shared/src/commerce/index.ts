import { z } from 'zod';
import {
  productTypeSchema,
  productStatusSchema,
  billingIntervalSchema,
  orderStatusSchema,
  paymentStatusSchema,
  subscriptionStatusSchema,
  refundStatusSchema,
} from '../enums';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { publicCourseSchema } from '../catalog';
import { capabilityUrlSchema } from '../media';
import {
  entityShape,
  uuidSchema,
  titleSchema,
  slugSchema,
  richTextSchema,
  timestampSchema,
  positionSchema,
  moneySchema,
  currencySchema,
  percentSchema,
  reasonSchema,
  applicationPathSchema,
  uniqueIdsSchema,
  searchSchema,
  dateRangeShape,
  validDateRange,
  nonemptyPatch,
  responseSchema,
} from '../primitives';
export const productCreateSchema = z
  .strictObject({
    type: productTypeSchema,
    slug: slugSchema,
    name: titleSchema,
    description: richTextSchema,
    accessDurationDays: z.number().int().positive().nullable(),
    courseIds: uniqueIdsSchema.min(1),
  })
  .refine(
    (v) => v.type !== 'COURSE' || v.courseIds.length === 1,
    'COURSE product requires exactly one course',
  );
export const productUpdateSchema = nonemptyPatch({
  name: titleSchema,
  description: richTextSchema,
  status: productStatusSchema,
  accessDurationDays: z.number().int().positive().nullable(),
});
export const productCoursesReplaceSchema = z.strictObject({ courseIds: uniqueIdsSchema.min(1) });
export const productSchema = z.strictObject({
  ...entityShape,
  type: productTypeSchema,
  status: productStatusSchema,
  slug: slugSchema,
  name: titleSchema,
  description: richTextSchema,
  accessDurationDays: z.number().int().positive().nullable(),
  courseIds: uniqueIdsSchema.min(1),
});
export const priceCreateSchema = z
  .strictObject({
    currency: currencySchema,
    amount: moneySchema.max(2147483647),
    interval: billingIntervalSchema.nullable(),
    intervalCount: z.number().int().min(1).max(36),
    trialDays: z.number().int().min(0).max(730),
    isActive: z.boolean(),
  })
  .refine(
    (v) => v.interval !== null || (v.intervalCount === 1 && v.trialDays === 0),
    'One-time price cannot have recurring options',
  );
export const priceUpdateSchema = z.strictObject({ isActive: z.boolean() });
export const priceSchema = priceCreateSchema.safeExtend({ ...entityShape, productId: uuidSchema });
export const publicProductSchema = productSchema
  .omit({ courseIds: true, createdAt: true, updatedAt: true })
  .extend({
    status: z.literal('ACTIVE'),
    courses: z.array(publicCourseSchema).min(1).max(1000),
    prices: z.array(priceSchema).max(100),
  });
export const productsQuerySchema = cursorQuerySchema.extend({
  search: searchSchema.optional(),
  status: productStatusSchema.optional(),
  type: productTypeSchema.optional(),
});
export const catalogProductsQuerySchema = cursorQuerySchema.extend({
  workspaceId: uuidSchema.optional(),
  type: productTypeSchema.optional(),
});
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(
    z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Z0-9_-]+$/),
  );
const couponCommon = {
  code: couponCodeSchema,
  validFrom: timestampSchema,
  validUntil: timestampSchema.nullable(),
  maxRedemptions: z.number().int().positive().nullable(),
  maxPerUser: z.number().int().positive(),
  minimumOrderAmount: moneySchema.max(2147483647),
  isActive: z.boolean(),
};
export const couponCreateSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...couponCommon,
      kind: z.literal('PERCENT'),
      percentOff: percentSchema.refine((v) => Number(v) > 0, 'Discount must be positive'),
    }),
    z.strictObject({
      ...couponCommon,
      kind: z.literal('FIXED'),
      amountOff: moneySchema.positive().max(2147483647),
      currency: currencySchema,
    }),
  ])
  .refine(
    (v) => !v.validUntil || Date.parse(v.validFrom) < Date.parse(v.validUntil),
    'Invalid coupon window',
  );
export const couponUpdateSchema = nonemptyPatch({
  validFrom: timestampSchema,
  validUntil: timestampSchema.nullable(),
  maxRedemptions: z.number().int().positive().nullable(),
  maxPerUser: z.number().int().positive(),
  isActive: z.boolean(),
});
export const couponSchema = z.strictObject({
  ...entityShape,
  rules: couponCreateSchema,
  productIds: uniqueIdsSchema,
  reservedUses: positionSchema,
  redeemedUses: positionSchema,
});
export const couponProductsReplaceSchema = z.strictObject({ productIds: uniqueIdsSchema });
export const couponsQuerySchema = cursorQuerySchema
  .extend({
    search: searchSchema.optional(),
    isActive: z.enum(['true', 'false']).optional(),
    ...dateRangeShape,
  })
  .refine(validDateRange, 'Invalid date range');
const checkoutItemSchema = z.strictObject({
  priceId: uuidSchema,
  cohorts: z
    .array(z.strictObject({ courseId: uuidSchema, cohortId: uuidSchema }))
    .max(1000)
    .refine(
      (v) => new Set(v.map((x) => x.courseId)).size === v.length,
      'Duplicate cohort selectors',
    )
    .optional(),
});
export const checkoutQuoteInputSchema = z.strictObject({
  items: z
    .array(checkoutItemSchema)
    .min(1)
    .max(100)
    .refine((v) => new Set(v.map((x) => x.priceId)).size === v.length, 'Duplicate prices'),
  couponCode: couponCodeSchema.optional(),
});
export const checkoutSessionInputSchema = checkoutQuoteInputSchema.extend({
  successPath: applicationPathSchema,
  cancelPath: applicationPathSchema,
});
export const orderTotalsSchema = z
  .strictObject({
    currency: currencySchema,
    subtotal: moneySchema,
    discountTotal: moneySchema,
    taxTotal: moneySchema,
    grandTotal: moneySchema,
  })
  .refine(
    (v) =>
      v.discountTotal <= v.subtotal && v.grandTotal === v.subtotal - v.discountTotal + v.taxTotal,
    'Totals do not reconcile',
  );
export const quoteLineSchema = z
  .strictObject({
    priceId: uuidSchema,
    productId: uuidSchema,
    name: titleSchema,
    quantity: z.literal(1),
    unitAmount: moneySchema,
    discountAmount: moneySchema,
    taxAmount: moneySchema,
    totalAmount: moneySchema,
  })
  .refine(
    (v) =>
      v.discountAmount <= v.unitAmount &&
      v.totalAmount === v.unitAmount - v.discountAmount + v.taxAmount,
    'Line does not reconcile',
  );
export const checkoutQuoteSchema = orderTotalsSchema
  .safeExtend({ items: z.array(quoteLineSchema).min(1).max(100) })
  .refine(
    (v) =>
      v.items.reduce((a, b) => a + b.totalAmount, 0) === v.grandTotal &&
      v.items.reduce((a, b) => a + b.unitAmount, 0) === v.subtotal &&
      v.items.reduce((a, b) => a + b.discountAmount, 0) === v.discountTotal &&
      v.items.reduce((a, b) => a + b.taxAmount, 0) === v.taxTotal,
    'Quote items do not reconcile',
  );
export const checkoutSessionSchema = z.union([
  z.strictObject({
    orderId: uuidSchema,
    checkoutUrl: capabilityUrlSchema,
    expiresAt: timestampSchema,
  }),
  z.strictObject({ orderId: uuidSchema, checkoutUrl: z.null(), expiresAt: z.null() }),
]);
export const entitlementCourseSchema = z.strictObject({
  courseId: uuidSchema,
  cohortId: uuidSchema.nullable(),
  accessDurationDays: z.number().int().positive().nullable(),
});
export const orderItemSchema = quoteLineSchema.safeExtend({
  id: uuidSchema,
  courses: z.array(entitlementCourseSchema).min(1).max(1000),
});
export const paymentSchema = z.strictObject({
  ...entityShape,
  status: paymentStatusSchema,
  currency: currencySchema,
  amount: moneySchema,
  paidAt: timestampSchema.nullable(),
  orderId: uuidSchema.nullable(),
  subscriptionId: uuidSchema.nullable(),
});
export const refundInputSchema = z
  .strictObject({
    amount: moneySchema.positive().max(2147483647),
    reason: reasonSchema,
    revokeAccess: z.boolean(),
    items: z
      .array(
        z.strictObject({
          orderItemId: uuidSchema,
          amount: moneySchema.positive(),
          revokeAccess: z.boolean(),
        }),
      )
      .min(1)
      .max(100)
      .refine(
        (v) => new Set(v.map((x) => x.orderItemId)).size === v.length,
        'Duplicate refund allocations',
      )
      .optional(),
  })
  .refine(
    (v) => !v.items || v.items.reduce((sum, x) => sum + x.amount, 0) === v.amount,
    'Refund allocations must equal amount',
  );
export const refundSchema = z.strictObject({
  ...entityShape,
  paymentId: uuidSchema,
  status: refundStatusSchema,
  currency: currencySchema,
  amount: moneySchema.positive(),
  reason: reasonSchema,
  revokeAccess: z.boolean(),
  completedAt: timestampSchema.nullable(),
});
export const orderSchema = orderTotalsSchema
  .safeExtend({
    ...entityShape,
    number: z.string().min(1).max(40),
    status: orderStatusSchema,
    paidAt: timestampSchema.nullable(),
    expiresAt: timestampSchema.nullable(),
    items: z.array(orderItemSchema).min(1).max(100),
    payments: z.array(paymentSchema).max(1000),
    refunds: z.array(refundSchema).max(1000),
    fulfillmentStatus: z.enum(['PENDING', 'FULFILLED', 'PARTIALLY_FULFILLED', 'REVOKED']),
  })
  .refine(
    (v) =>
      v.items.reduce((sum, item) => sum + item.totalAmount, 0) === v.grandTotal &&
      v.items.reduce((sum, item) => sum + item.unitAmount, 0) === v.subtotal &&
      v.items.reduce((sum, item) => sum + item.discountAmount, 0) === v.discountTotal &&
      v.items.reduce((sum, item) => sum + item.taxAmount, 0) === v.taxTotal,
    'Order items must reconcile with totals',
  );
export const ordersQuerySchema = cursorQuerySchema
  .extend({
    status: orderStatusSchema.optional(),
    workspaceId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    currency: currencySchema.optional(),
    ...dateRangeShape,
  })
  .refine(validDateRange, 'Invalid date range');
export const subscriptionsQuerySchema = cursorQuerySchema.extend({
  status: subscriptionStatusSchema.optional(),
  workspaceId: uuidSchema.optional(),
});
export const subscriptionSchema = z.strictObject({
  ...entityShape,
  productId: uuidSchema,
  priceId: uuidSchema,
  status: subscriptionStatusSchema,
  currentPeriodStart: timestampSchema.nullable(),
  currentPeriodEnd: timestampSchema.nullable(),
  trialEndsAt: timestampSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: timestampSchema.nullable(),
  endedAt: timestampSchema.nullable(),
  courses: z.array(entitlementCourseSchema).min(1).max(1000),
});
export const subscriptionCancelSchema = z.strictObject({});
export const adminSubscriptionCancelSchema = z.strictObject({
  immediate: z.boolean(),
  reason: reasonSchema,
});
export const billingPortalInputSchema = z.strictObject({ returnPath: applicationPathSchema });
export const billingPortalResponseSchema = responseSchema(
  z.strictObject({ url: capabilityUrlSchema }),
);
export const productResponseSchema = responseSchema(productSchema);
export const productsResponseSchema = cursorResponseSchema(productSchema);
export const publicProductResponseSchema = responseSchema(publicProductSchema);
export const publicProductsResponseSchema = cursorResponseSchema(publicProductSchema);
export const priceResponseSchema = responseSchema(priceSchema);
export const couponResponseSchema = responseSchema(couponSchema);
export const couponsResponseSchema = cursorResponseSchema(couponSchema);
export const checkoutQuoteResponseSchema = responseSchema(checkoutQuoteSchema);
export const checkoutSessionResponseSchema = responseSchema(checkoutSessionSchema);
export const orderResponseSchema = responseSchema(orderSchema);
export const ordersResponseSchema = cursorResponseSchema(orderSchema);
export const refundResponseSchema = responseSchema(refundSchema);
export const refundAcceptedResponseSchema = responseSchema(
  z.strictObject({ operationId: uuidSchema, status: z.literal('PENDING') }),
);
export const subscriptionResponseSchema = responseSchema(subscriptionSchema);
export const subscriptionsResponseSchema = cursorResponseSchema(subscriptionSchema);
export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type Product = z.infer<typeof productSchema>;
export type PriceCreate = z.infer<typeof priceCreateSchema>;
export type PriceUpdate = z.infer<typeof priceUpdateSchema>;
export type CouponCreate = z.infer<typeof couponCreateSchema>;
export type CouponUpdate = z.infer<typeof couponUpdateSchema>;
export type ProductsQuery = z.infer<typeof productsQuerySchema>;
export type CouponsQuery = z.infer<typeof couponsQuerySchema>;
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteInputSchema>;
export type CheckoutSessionInput = z.infer<typeof checkoutSessionInputSchema>;
export type CheckoutQuote = z.infer<typeof checkoutQuoteSchema>;
export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;
export type Order = z.infer<typeof orderSchema>;
export type OrdersQuery = z.infer<typeof ordersQuerySchema>;
export type RefundInput = z.infer<typeof refundInputSchema>;
export type Refund = z.infer<typeof refundSchema>;
export type Subscription = z.infer<typeof subscriptionSchema>;
export type SubscriptionsQuery = z.infer<typeof subscriptionsQuerySchema>;
export type AdminSubscriptionCancel = z.infer<typeof adminSubscriptionCancelSchema>;
export type BillingPortalInput = z.infer<typeof billingPortalInputSchema>;
