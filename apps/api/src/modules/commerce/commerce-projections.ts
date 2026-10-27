import { Prisma } from '@prisma/client';
import { orderSchema, paymentSchema, refundSchema, subscriptionSchema } from '@lms/shared';
import { selectionSchema } from './commerce.core';
export const orderInclude = {
  orderItems: { include: { orderItemCourses: true, enrollmentGrants: true } },
  payments: { include: { refunds: true } },
  subscriptions: { include: { enrollmentGrants: true } },
} satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export const paymentView = (p: Prisma.PaymentGetPayload<object>) =>
  paymentSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    status: p.status,
    currency: p.currency,
    amount: p.amount,
    paidAt: p.paidAt?.toISOString() ?? null,
    orderId: p.orderId,
    subscriptionId: p.subscriptionId,
  });
export const refundView = (p: Prisma.RefundGetPayload<object>) =>
  refundSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    paymentId: p.paymentId,
    status: p.status,
    currency: p.currency,
    amount: p.amount,
    reason: p.reason,
    revokeAccess: p.revokeAccess,
    completedAt: p.completedAt?.toISOString() ?? null,
  });
export function orderView(o: OrderRow) {
  const expected = o.orderItems.reduce((n, i) => n + i.orderItemCourses.length, 0);
  const grants = [
    ...o.orderItems.flatMap((i) => i.enrollmentGrants),
    ...o.subscriptions.flatMap((s) => s.enrollmentGrants),
  ];
  const active = grants.filter((g) => !g.revokedAt).length;
  return orderSchema.parse({
    id: o.id,
    workspaceId: o.workspaceId,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    number: o.number,
    status: o.status,
    currency: o.currency,
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    taxTotal: o.taxTotal,
    grandTotal: o.grandTotal,
    paidAt: o.paidAt?.toISOString() ?? null,
    expiresAt: o.expiresAt?.toISOString() ?? null,
    items: o.orderItems.map((i) => ({
      id: i.id,
      productId: i.productId,
      priceId: i.priceId,
      name:
        typeof i.productSnapshot === 'object' &&
        i.productSnapshot &&
        !Array.isArray(i.productSnapshot) &&
        typeof i.productSnapshot.name === 'string'
          ? i.productSnapshot.name
          : 'Purchased product',
      quantity: 1,
      unitAmount: i.unitAmount,
      discountAmount: i.discountAmount,
      taxAmount: i.taxAmount,
      totalAmount: i.totalAmount,
      courses: i.orderItemCourses.map((c) => ({
        courseId: c.courseId,
        cohortId: c.cohortId,
        accessDurationDays: c.accessDurationDays,
      })),
    })),
    payments: o.payments.map(paymentView),
    refunds: o.payments.flatMap((p) => p.refunds.map(refundView)),
    fulfillmentStatus:
      active >= expected
        ? 'FULFILLED'
        : active
          ? 'PARTIALLY_FULFILLED'
          : grants.length
            ? 'REVOKED'
            : 'PENDING',
  });
}
export const subscriptionView = (s: Prisma.SubscriptionGetPayload<object>) =>
  subscriptionSchema.parse({
    id: s.id,
    workspaceId: s.workspaceId,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    productId: s.productId,
    priceId: s.priceId,
    status: s.status,
    currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    cancelAtPeriodEnd: s.cancelAtPeriodEnd,
    canceledAt: s.canceledAt?.toISOString() ?? null,
    endedAt: s.endedAt?.toISOString() ?? null,
    courses: selectionSchema.parse(
      typeof s.entitlementSnapshot === 'object' &&
        s.entitlementSnapshot &&
        !Array.isArray(s.entitlementSnapshot)
        ? s.entitlementSnapshot.courses
        : s.entitlementSnapshot,
    ),
  });
