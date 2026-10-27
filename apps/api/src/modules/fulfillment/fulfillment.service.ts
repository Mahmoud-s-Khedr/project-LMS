import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  EnrollmentGrantService,
  type CommerceGrantInput,
} from '../learning/enrollment-grant.service';
import { lock } from '../commerce/commerce.core';
import { PermanentEventError } from '../events/event-consumer';

type Tx = Prisma.TransactionClient;
const scopeSchema = z.object({ workspaceId: z.uuid(), id: z.uuid() });
const snapshotSchema = z.object({
  courses: z
    .array(
      z.object({
        courseId: z.uuid(),
        cohortId: z.uuid().nullable(),
        accessDurationDays: z.number().int().positive().nullable().default(null),
      }),
    )
    .min(1)
    .max(500),
});

/** Persistence snapshots are internal, versioned commerce facts, never HTTP input or current products. */
export function snapshotCourses(value: unknown) {
  const parsed = snapshotSchema.safeParse(value);
  if (
    !parsed.success ||
    new Set(parsed.data.courses.map((c) => c.courseId)).size !== parsed.data.courses.length
  )
    throw new PermanentEventError('Invalid commerce entitlement snapshot');
  return parsed.data.courses;
}
export function expiryFromPaidAt(paidAt: Date, duration: number | null): Date | null {
  if (duration === null) return null;
  const expiry = new Date(paidAt.getTime() + duration * 86_400_000);
  if (!Number.isSafeInteger(duration) || duration <= 0 || !Number.isFinite(expiry.getTime()))
    throw new PermanentEventError('Invalid frozen access duration');
  return expiry;
}

/** Internal orchestration only. The caller supplies the receipt transaction; no public granting endpoint. */
@Injectable()
export class FulfillmentService {
  constructor(private readonly grants: EnrollmentGrantService) {}

  private async serialize(tx: Tx, workspaceId: string, id: string) {
    scopeSchema.parse({ workspaceId, id });
    // Same tenant lock as the billing reconciler, always before learning/course/cohort locks.
    await lock(tx, `commerce-reconcile:${workspaceId}`);
  }

  async order(tx: Tx, workspaceId: string, id: string, requestId: string): Promise<void> {
    await this.serialize(tx, workspaceId, id);
    const order = await tx.order.findFirst({
      where: { id, workspaceId },
      include: {
        orderItems: {
          include: { orderItemCourses: true, refundItems: { include: { refund: true } } },
        },
      },
    });
    if (!order) throw new PermanentEventError('Order does not belong to event workspace');
    if (!order.paidAt || !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.status)) return;
    const inputs: CommerceGrantInput[] = [];
    for (const item of order.orderItems) {
      const product = z
        .object({ type: z.enum(['COURSE', 'BUNDLE', 'SUBSCRIPTION_PLAN']) })
        .parse(item.productSnapshot);
      if (product.type === 'SUBSCRIPTION_PLAN') continue;
      const courses = snapshotCourses(item.entitlementSnapshot);
      if (
        courses.length !== item.orderItemCourses.length ||
        courses.some(
          (c) =>
            !item.orderItemCourses.some(
              (row) =>
                row.courseId === c.courseId &&
                row.cohortId === c.cohortId &&
                row.accessDurationDays === c.accessDurationDays,
            ),
        )
      )
        throw new PermanentEventError('Order snapshot does not match frozen course rows');
      const revoked = item.refundItems
        .filter((r) => r.revokeAccess && r.refund.status === 'SUCCEEDED')
        .sort(
          (a, b) =>
            (a.refund.completedAt ?? a.createdAt).getTime() -
            (b.refund.completedAt ?? b.createdAt).getTime(),
        )[0];
      if (revoked) {
        await this.grants.revokeGrants(
          { workspaceId, orderItemId: item.id },
          'Confirmed allocated refund',
          { actorId: null, requestId },
          revoked.refund.completedAt ?? revoked.createdAt,
          tx,
        );
        continue;
      }
      for (const c of courses)
        inputs.push({
          workspaceId,
          userId: order.userId,
          courseId: c.courseId,
          cohortId: c.cohortId,
          source: 'ORDER_ITEM',
          orderItemId: item.id,
          sourceKey: `order-item:${item.id}:course:${c.courseId}`,
          startsAt: order.paidAt,
          expiresAt: expiryFromPaidAt(order.paidAt, c.accessDurationDays),
          requestId,
        });
    }
    // Learning converts held reservations using Content's sorted cohort locks and excludeOrderId.
    await this.grants.grantManyFromCommerce(await this.missing(tx, inputs), tx);
  }

  async subscription(tx: Tx, workspaceId: string, id: string, requestId: string): Promise<void> {
    await this.serialize(tx, workspaceId, id);
    const sub = await tx.subscription.findFirst({
      where: { id, workspaceId },
      include: {
        payments: {
          include: {
            refunds: {
              where: { status: 'SUCCEEDED' },
              include: { refundItems: { include: { orderItem: true } } },
            },
          },
        },
      },
    });
    if (!sub) throw new PermanentEventError('Subscription does not belong to event workspace');
    const refunds = sub.payments
      .flatMap((p) =>
        p.refunds.filter((r) =>
          p.orderId
            ? r.refundItems.some(
                (i) =>
                  i.revokeAccess &&
                  i.orderItem.productId === sub.productId &&
                  i.orderItem.orderId === sub.initialOrderId,
              )
            : r.revokeAccess,
        ),
      )
      .sort(
        (a, b) =>
          (b.completedAt ?? b.createdAt).getTime() - (a.completedAt ?? a.createdAt).getTime() ||
          b.id.localeCompare(a.id),
      );
    const cutoff = refunds[0] ? (refunds[0].completedAt ?? refunds[0].createdAt) : null;
    // Explicit subscription-level refund policy. A later confirmed period may purchase fresh access;
    // an old event can never resurrect a revoked source generation.
    if (cutoff) {
      const old = await tx.enrollmentGrant.findMany({
        where: {
          workspaceId,
          source: 'SUBSCRIPTION',
          subscriptionId: id,
          startsAt: { lte: cutoff },
          revokedAt: null,
        },
        select: { id: true },
      });
      for (const g of old)
        await this.grants.revokeGrants(
          { workspaceId, grantId: g.id },
          'Confirmed subscription refund',
          { actorId: null, requestId },
          cutoff,
          tx,
        );
    }
    if (sub.endedAt) {
      await this.grants.revokeGrants(
        { workspaceId, subscriptionId: id },
        'Subscription terminated',
        { actorId: null, requestId },
        sub.endedAt,
        tx,
      );
      return;
    }
    const start = sub.currentPeriodStart,
      end = sub.currentPeriodEnd;
    // These dates are confirmed paid/trial bounds, deliberately retained on payment failure.
    if (
      !start ||
      !end ||
      end <= start ||
      (cutoff && start <= cutoff) ||
      sub.status === 'INCOMPLETE'
    )
      return;
    const inputs = snapshotCourses(sub.entitlementSnapshot).map((c) => ({
      workspaceId,
      userId: sub.userId,
      courseId: c.courseId,
      cohortId: c.cohortId,
      source: 'SUBSCRIPTION' as const,
      subscriptionId: id,
      sourceKey: `subscription:${id}${refunds[0] ? `:after-refund:${refunds[0].id}` : ''}:course:${c.courseId}`,
      startsAt: start,
      expiresAt: end,
      requestId,
    }));
    await this.grants.grantManyFromCommerce(await this.missing(tx, inputs), tx);
    for (const input of inputs) {
      const grant = await tx.enrollmentGrant.findFirst({
        where: { workspaceId, sourceKey: input.sourceKey, subscriptionId: id },
      });
      if (grant && ['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(sub.status))
        await this.grants.extendGrant(
          { workspaceId, grantId: grant.id },
          end,
          { actorId: null, requestId },
          tx,
        );
    }
    // cancelAtPeriodEnd never stamps revokedAt: expiry enforces the paid period and permits resume.
  }

  private async missing(tx: Tx, inputs: CommerceGrantInput[]): Promise<CommerceGrantInput[]> {
    if (!inputs.length) return [];
    const existing = await tx.enrollmentGrant.findMany({
      where: {
        workspaceId: inputs[0]!.workspaceId,
        sourceKey: { in: inputs.map((i) => i.sourceKey) },
        enrollment: { userId: inputs[0]!.userId },
      },
      select: { sourceKey: true },
    });
    const keys = new Set(existing.map((g) => g.sourceKey));
    return inputs.filter((i) => !keys.has(i.sourceKey));
  }

  async refund(tx: Tx, workspaceId: string, id: string, requestId: string): Promise<void> {
    await this.serialize(tx, workspaceId, id);
    const refund = await tx.refund.findFirst({
      where: { id, workspaceId },
      include: { payment: true, refundItems: { include: { orderItem: true } } },
    });
    if (!refund) throw new PermanentEventError('Refund does not belong to event workspace');
    if (refund.status !== 'SUCCEEDED') return;
    for (const item of refund.refundItems) {
      if (item.orderItem.orderId !== refund.payment.orderId)
        throw new PermanentEventError('Refund allocation does not belong to payment order');
      if (item.revokeAccess)
        await this.grants.revokeGrants(
          { workspaceId, orderItemId: item.orderItemId },
          'Confirmed allocated refund',
          { actorId: null, requestId },
          refund.completedAt ?? refund.createdAt,
          tx,
        );
    }
    if (refund.payment.subscriptionId)
      await this.subscription(tx, workspaceId, refund.payment.subscriptionId, requestId);
  }
}
