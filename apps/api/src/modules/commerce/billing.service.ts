import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { OrdersQuery, SubscriptionsQuery, RefundInput } from '@lms/shared';
import { AuditService } from '../audit/audit.service';
import { CommerceAdminService } from './commerce-admin.service';
import { PAYMENT_PROVIDER, stripeId, type PaymentProvider } from './payment-provider';
import { CheckoutService } from './checkout.service';
import {
  conflict,
  invalid,
  idempotent,
  beginIdempotent,
  completeIdempotent,
  lock,
  page,
  pageArgs,
  hash,
} from './commerce.core';
import { orderInclude, orderView, subscriptionView, refundView } from './commerce-projections';
@Injectable()
export class BillingService {
  constructor(
    private readonly db: PrismaService,
    private readonly admin: CommerceAdminService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly checkout: CheckoutService,
    private readonly audit: AuditService,
  ) {}
  async orders(a: AuthenticatedUser, q: OrdersQuery, w?: string) {
    if (w) await this.admin.authorize(a, w);
    else if (q.userId && q.userId !== a.id) invalid('Own orders only');
    const scope = { ...q, cursor: undefined, w, user: w ? undefined : a.id };
    const args = pageArgs(q, scope);
    const rows = await this.db.order.findMany({
      ...args,
      where: {
        ...args.where,
        ...(w
          ? { workspaceId: w, ...(q.userId ? { userId: q.userId } : {}) }
          : { userId: a.id, ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}) }),
        ...(q.status ? { status: q.status } : {}),
        ...(q.currency ? { currency: q.currency } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lt: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      include: orderInclude,
    });
    return page(rows, q.limit, scope, orderView);
  }
  async order(a: AuthenticatedUser, id: string, w?: string) {
    if (w) await this.admin.authorize(a, w);
    const o = await this.db.order.findFirst({
      where: { id, ...(w ? { workspaceId: w } : { userId: a.id }) },
      include: orderInclude,
    });
    if (!o) throw new NotFoundException();
    return { data: orderView(o) };
  }
  async subscriptions(a: AuthenticatedUser, q: SubscriptionsQuery) {
    const scope = { ...q, cursor: undefined, userId: a.id };
    const args = pageArgs(q, scope);
    const rows = await this.db.subscription.findMany({
      ...args,
      where: {
        ...args.where,
        userId: a.id,
        ...(q.status ? { status: q.status } : {}),
        ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
      },
    });
    return page(rows, q.limit, scope, subscriptionView);
  }
  async subscription(a: AuthenticatedUser, id: string) {
    const s = await this.db.subscription.findFirst({ where: { id, userId: a.id } });
    if (!s) throw new NotFoundException();
    return { data: subscriptionView(s) };
  }
  async portal(a: AuthenticatedUser, w: string, path: string) {
    if (
      !(await this.db.workspace.findFirst({ where: { id: w, status: 'ACTIVE', deletedAt: null } }))
    )
      throw new NotFoundException();
    const customer = await this.db.billingCustomer.findUnique({
      where: { workspaceId_userId: { workspaceId: w, userId: a.id } },
    });
    if (!customer) throw new NotFoundException();
    const session = await this.provider.call('billingPortal.sessions', 'create', {
      customer: customer.stripeCustomerId,
      return_url: this.checkout.url(path),
    });
    if (typeof session.url !== 'string') throw new Error('Invalid portal response');
    return { data: { url: session.url } };
  }
  async cancelOrder(
    a: AuthenticatedUser,
    w: string,
    id: string,
    key: string | undefined,
    requestId: string,
  ) {
    const own = await this.db.order.findFirst({ where: { id, workspaceId: w, userId: a.id } });
    if (!own) await this.admin.authorize(a, w);
    const phase = await this.db.$transaction(
      async (tx) => {
        const intent = await beginIdempotent(tx, w, a.id, `orders/${id}/cancel`, key, {});
        if (intent.kind === 'completed') return { done: true as const, response: intent.response };
        await lock(tx, `order:${id}`);
        const order = await tx.order.findFirst({ where: { id, workspaceId: w } });
        if (!order) throw new NotFoundException();
        if (order.status !== 'PENDING') conflict('Only pending orders can be canceled');
        return {
          done: false as const,
          scope: intent.scope,
          sessionId: order.stripeCheckoutSessionId,
        };
      },
      { timeout: 10000 },
    );
    if (phase.done) return phase.response;
    if (phase.sessionId) {
      const remote = await this.provider.call(
        'checkout.sessions',
        'retrieve',
        {},
        undefined,
        phase.sessionId,
      );
      if (remote.status === 'complete') conflict('Payment already completed');
      if (remote.status !== 'expired')
        await this.provider.call(
          'checkout.sessions',
          'expire',
          {},
          `cancel-${id}`,
          phase.sessionId,
        );
    }
    return this.db.$transaction(
      async (tx) => {
        await lock(tx, `order:${id}`);
        const updated = await tx.order.updateMany({
          where: { id, status: 'PENDING', stripeCheckoutSessionId: phase.sessionId },
          data: { status: 'CANCELED' },
        });
        if (!updated.count) conflict('Order changed during cancellation');
        await tx.couponRedemption.updateMany({
          where: { orderId: id, redeemedAt: null },
          data: { releasedAt: new Date(), reservedUntil: null },
        });
        await this.audit.append(tx, {
          workspaceId: w,
          actorId: a.id,
          requestId,
          action: 'commerce.order.canceled',
          resourceType: 'Order',
          resourceId: id,
        });
        return completeIdempotent(tx, phase.scope, 200, {
          data: orderView(
            await tx.order.findUniqueOrThrow({ where: { id }, include: orderInclude }),
          ),
        });
      },
      { timeout: 10000 },
    );
  }
  async changeSubscription(
    a: AuthenticatedUser,
    id: string,
    key: string | undefined,
    requestId: string,
    input: { resume?: boolean; immediate?: boolean; reason?: string },
    w?: string,
  ) {
    if (w) await this.admin.authorize(a, w);
    const s = await this.db.subscription.findFirst({
      where: { id, ...(w ? { workspaceId: w } : { userId: a.id }) },
    });
    if (!s) throw new NotFoundException();
    const phase = await this.db.$transaction(
      async (tx) => {
        const intent = await beginIdempotent(
          tx,
          s.workspaceId,
          a.id,
          `subscriptions/${id}/${input.resume ? 'resume' : 'cancel'}`,
          key,
          input,
        );
        if (intent.kind === 'completed') return { done: true as const, response: intent.response };
        await lock(tx, `subscription:${s.stripeSubscriptionId}`);
        const local = await tx.subscription.findUniqueOrThrow({ where: { id } });
        if (['CANCELED', 'EXPIRED'].includes(local.status)) conflict('Subscription has ended');
        return { done: false as const, scope: intent.scope };
      },
      { timeout: 10000 },
    );
    if (phase.done) return phase.response;
    await this.provider.call(
      'subscriptions',
      input.immediate ? 'cancel' : 'update',
      input.immediate ? {} : { cancel_at_period_end: !input.resume },
      `subscription-${hash({ id, key, input })}`,
      s.stripeSubscriptionId,
    );
    return this.db.$transaction(
      async (tx) => {
        await lock(tx, `subscription:${s.stripeSubscriptionId}`);
        await this.audit.append(tx, {
          workspaceId: s.workspaceId,
          actorId: a.id,
          requestId,
          action: 'commerce.subscription.change_requested',
          resourceType: 'Subscription',
          resourceId: id,
          changes: {
            reason: input.reason ?? 'Self service',
            immediate: !!input.immediate,
            resume: !!input.resume,
          },
        });
        return completeIdempotent(tx, phase.scope, 200, {
          data: subscriptionView(await tx.subscription.findUniqueOrThrow({ where: { id } })),
        });
      },
      { timeout: 10000 },
    );
  }
  refund(
    a: AuthenticatedUser,
    w: string,
    paymentId: string,
    input: RefundInput,
    key: string | undefined,
    requestId: string,
  ) {
    return this.reserveRefund(a, w, paymentId, input, key, requestId);
  }
  /** Operations-only internal command. Explicit attribution/allocation is required for a dashboard refund. */
  async adoptRefund(
    a: AuthenticatedUser,
    w: string,
    stripeRefundId: string,
    input: RefundInput,
    key: string,
    requestId: string,
  ) {
    await this.admin.authorize(a, w);
    const remote = await this.provider.call('refunds', 'retrieve', {}, undefined, stripeRefundId);
    const pi = stripeId(remote.payment_intent),
      charge = stripeId(remote.charge);
    if (!pi && !charge) invalid('Refund has no trusted payment mapping');
    const p = await this.db.payment.findFirst({
      where: {
        workspaceId: w,
        OR: [
          ...(pi ? [{ stripePaymentIntentId: pi }] : []),
          ...(charge ? [{ stripeChargeId: charge }] : []),
        ],
      },
    });
    if (!p || p.currency !== remote.currency || remote.amount !== input.amount)
      invalid('Refund does not match a local payment');
    return this.reserveRefund(a, w, p.id, input, key, requestId, remote.id);
  }
  private async reserveRefund(
    a: AuthenticatedUser,
    w: string,
    paymentId: string,
    input: RefundInput,
    key: string | undefined,
    requestId: string,
    externalRefundId?: string,
  ) {
    await this.admin.authorize(a, w);
    if (!this.provider.enabled) throw new ServiceUnavailableException('Payments disabled');
    return this.db.$transaction(
      async (tx) =>
        idempotent(
          tx,
          w,
          a.id,
          `payments/${paymentId}/refund`,
          key,
          { input, externalRefundId },
          202,
          async () => {
            await lock(tx, `payment:${paymentId}`);
            if (
              externalRefundId &&
              (await tx.refund.findUnique({ where: { stripeRefundId: externalRefundId } }))
            )
              conflict('Refund already mapped');
            const p = await tx.payment.findFirst({
              where: { id: paymentId, workspaceId: w, status: 'SUCCEEDED' },
              include: {
                refunds: { include: { refundItems: true } },
                order: { include: { orderItems: true } },
              },
            });
            if (!p) throw new NotFoundException();
            if (!p.stripePaymentIntentId && !p.stripeChargeId)
              invalid('Payment has no refundable provider charge');
            const committed = p.refunds.filter(
              (r) => r.status === 'PENDING' || r.status === 'SUCCEEDED',
            );
            if (committed.reduce((n, r) => n + r.amount, 0) + input.amount > p.amount)
              conflict('Refund exceeds captured balance');
            if (p.orderId) {
              if (!input.items) invalid('Order item allocations required');
              for (const allocation of input.items) {
                const item = p.order?.orderItems.find((i) => i.id === allocation.orderItemId);
                if (!item) invalid('Foreign refund item');
                const used = committed
                  .flatMap((r) => r.refundItems)
                  .filter((i) => i.orderItemId === item.id)
                  .reduce((n, i) => n + i.amount, 0);
                if (used + allocation.amount > item.totalAmount)
                  conflict('Refund exceeds line balance');
              }
            } else if (input.items) invalid('Renewal refunds cannot allocate order items');
            const refund = await tx.refund.create({
              data: {
                workspaceId: w,
                paymentId,
                requestedById: a.id,
                amount: input.amount,
                currency: p.currency,
                reason: input.reason,
                stripeRefundId: externalRefundId ?? null,
                revokeAccess: input.revokeAccess,
                refundItems: { create: input.items?.map((i) => ({ ...i })) ?? [] },
              },
            });
            await this.audit.append(tx, {
              workspaceId: w,
              actorId: a.id,
              requestId,
              action: externalRefundId ? 'commerce.refund.adopted' : 'commerce.refund.requested',
              resourceType: 'Refund',
              resourceId: refund.id,
              changes: {
                amount: input.amount,
                currency: p.currency,
                reason: input.reason,
                revokeAccess: input.revokeAccess,
              },
            });
            return { data: { operationId: refund.id, status: 'PENDING' } };
          },
        ),
      { timeout: 60000 },
    );
  }
  async getRefund(a: AuthenticatedUser, w: string, id: string) {
    await this.admin.authorize(a, w);
    const r = await this.db.refund.findFirst({ where: { id, workspaceId: w } });
    if (!r) throw new NotFoundException();
    return { data: refundView(r) };
  }
}
