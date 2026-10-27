import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type SubscriptionStatus } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { AuditService } from '../audit/audit.service';
import { PAYMENT_PROVIDER, type PaymentProvider, stripeId, seconds } from './payment-provider';
import { type Tx, json, lock, hash } from './commerce.core';
import type { BackgroundTaskHandler } from '../events/background-task';
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(object) : []);
const money = (v: unknown) => z.number().int().min(0).max(2147483647).parse(v);
const subStatus: Record<string, SubscriptionStatus> = {
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'EXPIRED',
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  unpaid: 'UNPAID',
  paused: 'PAUSED',
  canceled: 'CANCELED',
};
@Injectable()
export class CommerceWorkerService {
  constructor(
    private readonly db: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}
  async accept(raw: Buffer, signature: string) {
    const e = this.provider.verify(raw, signature);
    // Inbox is committed before acknowledging Stripe. Duplicate event IDs do not overwrite evidence.
    await this.db.stripeWebhook.upsert({
      where: { stripeEventId: e.id },
      create: {
        stripeEventId: e.id,
        type: e.type,
        stripeCreatedAt: new Date(e.created * 1000),
        apiVersion: e.api_version ?? null,
        livemode: e.livemode,
        payload: json(e),
      },
      update: {},
    });
    return { data: { received: true } };
  }
  async process(id: string) {
    try {
      await this.db.$transaction(
        async (tx) => {
          await lock(tx, `stripe-event:${id}`);
          const event = await tx.stripeWebhook.findUniqueOrThrow({ where: { id } });
          if (event.status === 'PROCESSED') return;
          const payload = object(event.payload);
          const resource = object(object(payload.data).object);
          const remoteId = z.string().parse(resource.id);
          if (event.type.startsWith('checkout.session.')) await this.session(tx, remoteId);
          else if (event.type.startsWith('customer.subscription.'))
            await this.subscription(tx, remoteId);
          else if (event.type.startsWith('invoice.')) await this.invoice(tx, remoteId);
          else if (event.type.startsWith('refund.')) await this.refund(tx, remoteId);
          else if (event.type === 'charge.refunded') {
            const charge = await this.provider.call(
              'charges',
              'retrieve',
              { expand: ['refunds'] },
              undefined,
              remoteId,
            );
            for (const r of records(object(charge.refunds).data))
              await this.refund(tx, z.string().parse(r.id));
          }
          await tx.stripeWebhook.update({
            where: { id },
            data: {
              status: 'PROCESSED',
              processedAt: new Date(),
              lastError: null,
              attempts: { increment: 1 },
            },
          });
        },
        { timeout: 60000, maxWait: 10000 },
      );
    } catch {
      await this.db.stripeWebhook.updateMany({
        where: { id, status: { not: 'PROCESSED' } },
        data: {
          status: 'FAILED',
          attempts: { increment: 1 },
          lastError: 'COMMERCE_RECONCILIATION_FAILED',
        },
      });
      throw new Error('Commerce reconciliation failed');
    }
  }
  async session(tx: Tx, sessionId: string) {
    const order = await tx.order.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
      include: { orderItems: true },
    });
    if (!order) throw new Error('Unmapped checkout session');
    await lock(tx, `commerce-reconcile:${order.workspaceId}`);
    await lock(tx, `order:${order.id}`);
    const session = await this.provider.call(
      'checkout.sessions',
      'retrieve',
      {},
      undefined,
      sessionId,
    );
    if (session.livemode === true) throw new Error('Live payment forbidden');
    const customerId = stripeId(session.customer);
    const customer = customerId
      ? await tx.billingCustomer.findUnique({ where: { stripeCustomerId: customerId } })
      : null;
    if (!customer || customer.workspaceId !== order.workspaceId || customer.userId !== order.userId)
      throw new Error('Customer mismatch');
    if (session.status === 'expired') {
      await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      await tx.couponRedemption.updateMany({
        where: { orderId: order.id, redeemedAt: null },
        data: { releasedAt: new Date(), reservedUntil: null },
      });
      return;
    }
    const subscriptionId = stripeId(session.subscription);
    if (subscriptionId) {
      if (order.orderItems.length !== 1) throw new Error('Invalid plan order');
      const item = order.orderItems[0]!;
      const existing = await tx.subscription.findUnique({
        where: { stripeSubscriptionId: subscriptionId },
      });
      if (existing && (existing.initialOrderId !== order.id || existing.customerId !== customer.id))
        throw new Error('Subscription mapping conflict');
      if (!existing)
        await tx.subscription.create({
          data: {
            workspaceId: order.workspaceId,
            userId: order.userId,
            productId: item.productId,
            priceId: item.priceId,
            customerId: customer.id,
            initialOrderId: order.id,
            stripeSubscriptionId: subscriptionId,
            entitlementSnapshot: json(item.entitlementSnapshot),
          },
        });
      await this.subscription(tx, subscriptionId);
    }
    if (!subscriptionId && session.payment_status === 'unpaid') {
      const pi = stripeId(session.payment_intent);
      if (pi) {
        const intent = await this.provider.call('paymentIntents', 'retrieve', {}, undefined, pi);
        if (
          intent.currency !== order.currency ||
          money(intent.amount ?? order.grandTotal) !== order.grandTotal
        )
          throw new Error('Payment currency or amount mismatch');
        const failed = ['canceled', 'requires_payment_method'].includes(String(intent.status));
        if (intent.status !== 'succeeded')
          await this.payment(tx, {
            workspaceId: order.workspaceId,
            orderId: order.id,
            subscriptionId: null,
            amount: order.grandTotal,
            currency: order.currency,
            stripePaymentIntentId: pi,
            stripeInvoiceId: null,
            stripeChargeId: stripeId(intent.latest_charge),
            status: failed ? 'FAILED' : 'PENDING',
            paidAt: null,
          });
        if (failed) {
          await tx.order.updateMany({
            where: { id: order.id, status: 'PENDING' },
            data: { status: 'CANCELED' },
          });
          await tx.couponRedemption.updateMany({
            where: { orderId: order.id, redeemedAt: null },
            data: { releasedAt: new Date(), reservedUntil: null },
          });
        }
      }
    }
    if (
      session.status !== 'complete' ||
      !['paid', 'no_payment_required'].includes(String(session.payment_status))
    )
      return;
    if (money(session.amount_total) !== order.grandTotal || session.currency !== order.currency)
      throw new Error('Checkout totals mismatch');
    // No automatic tax configured: any unexpected tax is a reconciliation failure, never silently invented.
    if (money(object(session.total_details).amount_tax ?? 0) !== order.taxTotal)
      throw new Error('Tax mismatch');
    if (order.status === 'CANCELED')
      throw new Error('Canceled order was charged; operations refund required');
    let paidAt = seconds(session.created) ?? new Date();
    if (!subscriptionId) {
      const pi = stripeId(session.payment_intent);
      if (!pi && order.grandTotal) throw new Error('Missing payment intent');
      if (pi) {
        const payment = await this.provider.call('paymentIntents', 'retrieve', {}, undefined, pi);
        if (
          payment.status !== 'succeeded' ||
          money(payment.amount_received) !== order.grandTotal ||
          payment.currency !== order.currency
        )
          throw new Error('Payment not captured');
        const chargeId = stripeId(payment.latest_charge);
        if (chargeId) {
          const charge = await this.provider.call('charges', 'retrieve', {}, undefined, chargeId);
          paidAt = seconds(charge.created) ?? paidAt;
        }
        await this.payment(tx, {
          workspaceId: order.workspaceId,
          orderId: order.id,
          subscriptionId: null,
          amount: order.grandTotal,
          currency: order.currency,
          stripePaymentIntentId: pi,
          stripeChargeId: chargeId,
          stripeInvoiceId: null,
          status: 'SUCCEEDED',
          paidAt,
        });
      }
    }
    await this.paid(tx, order.id, paidAt, !subscriptionId);
  }
  async paid(tx: Tx, id: string, paidAt: Date, emit: boolean) {
    const updated = await tx.order.updateMany({
      where: { id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: { status: 'PAID', paidAt, expiresAt: null },
    });
    if (!updated.count) return;
    const order = await tx.order.findUniqueOrThrow({ where: { id } });
    await tx.couponRedemption.updateMany({
      where: { orderId: id },
      data: { redeemedAt: paidAt, releasedAt: null, reservedUntil: null },
    });
    if (emit)
      await this.outbox.append(tx, {
        workspaceId: order.workspaceId,
        type: 'order.paid.v1',
        aggregateType: 'Order',
        aggregateId: id,
        payload: { orderId: id },
      });
    await this.audit.append(tx, {
      workspaceId: order.workspaceId,
      actorId: null,
      requestId: `commerce:${id}`,
      action: 'commerce.order.paid',
      resourceType: 'Order',
      resourceId: id,
      changes: { amount: order.grandTotal, currency: order.currency },
    });
  }
  async payment(tx: Tx, data: Prisma.PaymentUncheckedCreateInput) {
    const where = data.stripeInvoiceId
      ? { stripeInvoiceId: data.stripeInvoiceId }
      : { stripePaymentIntentId: data.stripePaymentIntentId! };
    const existing = await tx.payment.findUnique({ where });
    if (existing) {
      if (
        existing.workspaceId !== data.workspaceId ||
        existing.orderId !== data.orderId ||
        existing.subscriptionId !== data.subscriptionId ||
        existing.currency !== data.currency
      )
        throw new Error('Payment mapping conflict');
      if (existing.status === 'SUCCEEDED') {
        if (
          data.status === 'SUCCEEDED' &&
          (existing.amount !== data.amount || existing.currency !== data.currency)
        )
          throw new Error('Captured payment changed');
        return tx.payment.update({
          where: { id: existing.id },
          data: {
            ...(!existing.stripePaymentIntentId && data.stripePaymentIntentId
              ? { stripePaymentIntentId: data.stripePaymentIntentId }
              : {}),
            ...(!existing.stripeChargeId && data.stripeChargeId
              ? { stripeChargeId: data.stripeChargeId }
              : {}),
          },
        });
      }
      return tx.payment.update({ where: { id: existing.id }, data });
    }
    return tx.payment.create({ data });
  }
  async subscription(tx: Tx, id: string) {
    const mapping = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: id },
      select: { workspaceId: true },
    });
    if (!mapping) throw new Error('Unmapped subscription');
    await lock(tx, `commerce-reconcile:${mapping.workspaceId}`);
    await lock(tx, `subscription:${id}`);
    const local = await tx.subscription.findUnique({
      where: { stripeSubscriptionId: id },
      include: { customer: true, price: true },
    });
    if (!local) throw new Error('Unmapped subscription (checkout must reconcile first)');
    const remote = await this.provider.call(
      'subscriptions',
      'retrieve',
      { expand: ['latest_invoice'] },
      undefined,
      id,
    );
    if (stripeId(remote.customer) !== local.customer.stripeCustomerId)
      throw new Error('Subscription customer mismatch');
    const status = subStatus[String(remote.status)];
    if (!status) throw new Error('Unknown subscription status');
    const items = records(object(remote.items).data);
    if (items.length !== 1) throw new Error('Unsupported plan item count');
    const stripePrice = object(items[0]!.price),
      recurring = object(stripePrice.recurring);
    if (
      stripePrice.currency !== local.price.currency ||
      stripePrice.unit_amount !== local.price.amount ||
      recurring.interval !== local.price.interval?.toLowerCase() ||
      recurring.interval_count !== local.price.intervalCount ||
      items[0]!.quantity !== 1
    )
      throw new Error('Subscription price changed outside commerce');
    const start = seconds(items[0]!.current_period_start),
      end = seconds(items[0]!.current_period_end),
      trial = seconds(remote.trial_end);
    const invoice = object(remote.latest_invoice);
    const paid = invoice.status === 'paid';
    // An ACTIVE state alone cannot extend access. Only a confirmed paid invoice or trial can.
    let confirmedStart = local.currentPeriodStart,
      confirmedEnd = local.currentPeriodEnd;
    if (status === 'TRIALING' && trial) {
      confirmedStart = seconds(remote.trial_start) ?? start;
      confirmedEnd = trial;
    }
    const paidLine = records(object(invoice.lines).data).find((line) => {
      const parent = object(object(line.parent).subscription_item_details),
        period = object(line.period);
      return (
        parent.subscription_item === items[0]!.id &&
        parent.proration !== true &&
        typeof line.amount === 'number' &&
        line.amount >= 0 &&
        seconds(period.start)?.getTime() === start?.getTime() &&
        seconds(period.end)?.getTime() === end?.getTime()
      );
    });
    if (status === 'ACTIVE' && paid && paidLine && start && end) {
      confirmedStart = start;
      confirmedEnd = end;
    }
    const ended = seconds(remote.ended_at);
    if (ended && confirmedEnd && ended < confirmedEnd) confirmedEnd = ended;
    const data = {
      status,
      currentPeriodStart: confirmedStart,
      currentPeriodEnd: confirmedEnd,
      trialEndsAt: trial,
      cancelAtPeriodEnd: remote.cancel_at_period_end === true,
      canceledAt: seconds(remote.canceled_at),
      endedAt: ended,
      lastSyncedAt: new Date(),
    };
    const changed =
      hash({ ...data, lastSyncedAt: undefined }) !==
      hash({
        status: local.status,
        currentPeriodStart: local.currentPeriodStart,
        currentPeriodEnd: local.currentPeriodEnd,
        trialEndsAt: local.trialEndsAt,
        cancelAtPeriodEnd: local.cancelAtPeriodEnd,
        canceledAt: local.canceledAt,
        endedAt: local.endedAt,
      });
    await tx.subscription.update({ where: { id: local.id }, data });
    if (changed)
      await this.outbox.append(tx, {
        workspaceId: local.workspaceId,
        type: 'subscription.entitlements.changed.v1',
        aggregateType: 'Subscription',
        aggregateId: local.id,
        payload: { subscriptionId: local.id },
      });
    if (paid && typeof invoice.id === 'string') {
      const detailed = await this.provider.call(
        'invoices',
        'retrieve',
        { expand: ['payments.data.payment.payment_intent'] },
        undefined,
        invoice.id,
      );
      await this.invoicePayment(tx, local, detailed);
    }
    let startingAfter: string | undefined;
    for (let page = 0; page < 10; page++) {
      const history = await this.provider.call('invoices', 'list', {
        subscription: id,
        limit: 100,
        created: {
          gte: Math.max(
            0,
            Math.floor(
              (local.lastSyncedAt?.getTime() ??
                seconds(remote.created)?.getTime() ??
                local.createdAt.getTime()) / 1000,
            ) - 86400,
          ),
        },
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });
      const invoices = records(history.data);
      for (const entry of invoices) {
        if (typeof entry.id !== 'string') throw new Error('Invalid invoice');
        const detailed = await this.provider.call(
          'invoices',
          'retrieve',
          { expand: ['payments.data.payment.payment_intent'] },
          undefined,
          entry.id,
        );
        await this.invoicePayment(tx, local, detailed);
      }
      if (history.has_more !== true) break;
      startingAfter = z.string().parse(invoices.at(-1)?.id);
      if (page === 9) throw new Error('Invoice backfill requires operations');
    }
  }
  async invoice(tx: Tx, id: string) {
    const invoice = await this.provider.call(
      'invoices',
      'retrieve',
      { expand: ['payments.data.payment.payment_intent'] },
      undefined,
      id,
    );
    const subId = stripeId(object(object(invoice.parent).subscription_details).subscription);
    if (!subId) return;
    const local = await tx.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
    if (!local) throw new Error('Unmapped invoice subscription');
    await this.subscription(tx, subId);
    await this.invoicePayment(tx, local, invoice);
  }
  async invoicePayment(
    tx: Tx,
    local: { id: string; workspaceId: string; initialOrderId: string | null },
    invoice: Record<string, unknown>,
  ) {
    const id = z.string().parse(invoice.id);
    const subscription = await tx.subscription.findUniqueOrThrow({
      where: { id: local.id },
      include: { price: true, customer: true },
    });
    if (invoice.currency !== subscription.price.currency)
      throw new Error('Invoice currency mismatch');
    if (invoice.customer && stripeId(invoice.customer) !== subscription.customer.stripeCustomerId)
      throw new Error('Invoice customer mismatch');
    const status =
      invoice.status === 'paid'
        ? ('SUCCEEDED' as const)
        : invoice.status === 'void' ||
            invoice.status === 'uncollectible' ||
            (typeof invoice.attempt_count === 'number' && invoice.attempt_count > 0)
          ? ('FAILED' as const)
          : ('PENDING' as const);
    const first = records(object(invoice.payments).data).find(
      (p) => object(p.payment).type === 'payment_intent',
    );
    const pi = stripeId(object(first?.payment).payment_intent);
    const initial = invoice.billing_reason === 'subscription_create';
    const paidAt =
      status === 'SUCCEEDED' ? seconds(object(invoice.status_transitions).paid_at) : null;
    await this.payment(tx, {
      workspaceId: local.workspaceId,
      subscriptionId: local.id,
      orderId: initial ? local.initialOrderId : null,
      stripeInvoiceId: id,
      stripePaymentIntentId: pi,
      stripeChargeId: null,
      status,
      amount: money(status === 'SUCCEEDED' ? invoice.amount_paid : invoice.amount_due),
      currency: z
        .string()
        .regex(/^[a-z]{3}$/)
        .parse(invoice.currency),
      paidAt,
    });
    if (initial && status === 'SUCCEEDED' && local.initialOrderId)
      await this.paid(tx, local.initialOrderId, paidAt ?? new Date(), false);
  }
  async submitRefund(id: string) {
    await this.db.$transaction(
      async (tx) => {
        const local = await tx.refund.findUniqueOrThrow({
          where: { id },
          include: { payment: true },
        });
        await lock(tx, `commerce-reconcile:${local.workspaceId}`);
        await lock(tx, `payment:${local.paymentId}`);
        const current = await tx.refund.findUniqueOrThrow({ where: { id } });
        if (current.stripeRefundId || current.status !== 'PENDING') return;
        const remote = await this.provider.call(
          'refunds',
          'create',
          {
            amount: local.amount,
            ...(local.payment.stripePaymentIntentId
              ? { payment_intent: local.payment.stripePaymentIntentId }
              : { charge: local.payment.stripeChargeId }),
          },
          `refund-${local.id}`,
        );
        await tx.refund.update({ where: { id }, data: { stripeRefundId: remote.id } });
      },
      { timeout: 60000 },
    );
  }
  async refund(tx: Tx, id: string) {
    const local = await tx.refund.findUnique({
      where: { stripeRefundId: id },
      include: { payment: true },
    });
    // Dashboard-created refunds need an audited allocation command; do not guess access effects.
    if (!local) throw new Error('Unmapped refund requires operations reconciliation');
    await lock(tx, `commerce-reconcile:${local.workspaceId}`);
    await lock(tx, `payment:${local.paymentId}`);
    const remote = await this.provider.call('refunds', 'retrieve', {}, undefined, id);
    if (
      money(remote.amount) !== local.amount ||
      remote.currency !== local.currency ||
      !(
        (local.payment.stripePaymentIntentId &&
          stripeId(remote.payment_intent) === local.payment.stripePaymentIntentId) ||
        (local.payment.stripeChargeId && stripeId(remote.charge) === local.payment.stripeChargeId)
      )
    )
      throw new Error('Refund mapping mismatch');
    const state =
      remote.status === 'succeeded'
        ? 'SUCCEEDED'
        : remote.status === 'failed'
          ? 'FAILED'
          : remote.status === 'canceled'
            ? 'CANCELED'
            : 'PENDING';
    const updated = await tx.refund.updateMany({
      where: { id: local.id, status: { not: 'SUCCEEDED' } },
      data: { status: state, ...(state === 'SUCCEEDED' ? { completedAt: new Date() } : {}) },
    });
    if (state !== 'SUCCEEDED' || !updated.count) return;
    if (local.payment.orderId) {
      await lock(tx, `order:${local.payment.orderId}`);
      const o = await tx.order.findUniqueOrThrow({
        where: { id: local.payment.orderId },
        include: { payments: { include: { refunds: true } } },
      });
      const refunded = o.payments
        .flatMap((p) => p.refunds)
        .filter((r) => r.status === 'SUCCEEDED')
        .reduce((sum, r) => sum + BigInt(r.amount), 0n);
      await tx.order.update({
        where: { id: o.id },
        data: { status: refunded >= BigInt(o.grandTotal) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
    }
    await this.outbox.append(tx, {
      workspaceId: local.workspaceId,
      type: 'refund.succeeded.v1',
      aggregateType: 'Refund',
      aggregateId: local.id,
      payload: { refundId: local.id },
    });
    await this.audit.append(tx, {
      workspaceId: local.workspaceId,
      actorId: null,
      requestId: `refund:${local.id}`,
      action: 'commerce.refund.succeeded',
      resourceType: 'Refund',
      resourceId: local.id,
      changes: { amount: local.amount, currency: local.currency },
    });
  }
  async reconcile() {
    if (!this.provider.enabled) return;
    // Bounded scans; each failure is isolated so a poison event cannot starve other aggregates.
    const inbox = await this.db.stripeWebhook.findMany({
      where: { status: { in: ['RECEIVED', 'FAILED'] }, attempts: { lt: 20 } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const e of inbox)
      try {
        await this.process(e.id);
      } catch {
        /* Persisted sanitized failure supports operations replay. */
      }
    const orders = await this.db.order.findMany({
      where: { status: 'PENDING', stripeCheckoutSessionId: { not: null } },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    for (const o of orders)
      try {
        await this.db.$transaction((tx) => this.session(tx, o.stripeCheckoutSessionId!), {
          timeout: 60000,
        });
      } catch {
        /* Retried by next scan. */
      } finally {
        await this.db.order.update({ where: { id: o.id }, data: { updatedAt: new Date() } });
      }
    const subs = await this.db.subscription.findMany({
      where: { status: { notIn: ['CANCELED', 'EXPIRED'] } },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    for (const s of subs)
      try {
        await this.db.$transaction((tx) => this.subscription(tx, s.stripeSubscriptionId), {
          timeout: 60000,
        });
      } catch {
        /* Retried by next scan. */
      } finally {
        await this.db.subscription.update({ where: { id: s.id }, data: { updatedAt: new Date() } });
      }
    const refunds = await this.db.refund.findMany({
      where: { status: 'PENDING' },
      orderBy: { updatedAt: 'asc' },
      take: 25,
    });
    for (const r of refunds)
      try {
        await this.submitRefund(r.id);
        const mapped = await this.db.refund.findUniqueOrThrow({ where: { id: r.id } });
        await this.db.$transaction((tx) => this.refund(tx, mapped.stripeRefundId!), {
          timeout: 60000,
        });
      } catch {
        /* Retried by next scan. */
      } finally {
        await this.db.refund.update({ where: { id: r.id }, data: { updatedAt: new Date() } });
      }
    // Free checkouts complete synchronously; orphan reservations expire by timestamp predicates.
  }
}
@Injectable()
export class CommerceReconcileTask implements BackgroundTaskHandler {
  readonly name = 'commerce.reconcile';
  readonly everyMs = 15000;
  constructor(private readonly worker: CommerceWorkerService) {}
  async handle(): Promise<void> {
    await this.worker.reconcile();
  }
}
