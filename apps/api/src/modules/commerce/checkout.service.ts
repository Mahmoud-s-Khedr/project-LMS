import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  checkoutQuoteSchema,
  checkoutSessionSchema,
  applicationPathSchema,
  type CheckoutQuoteInput,
  type CheckoutSessionInput,
} from '@lms/shared';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { AuditService } from '../audit/audit.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import {
  COHORT_RESERVATIONS,
  type CohortReservations,
  type Tx,
  type Selection,
  json,
  invalid,
  conflict,
  allocate,
  lock,
  beginIdempotent,
  completeIdempotent,
  hash,
} from './commerce.core';
import { supportedCurrency } from './commerce-admin.service';

export const CHECKOUT_INTENT_WINDOW_MS = 15 * 60 * 1000;
let checkoutIntentWindowMs = CHECKOUT_INTENT_WINDOW_MS;
export function setCheckoutIntentWindowForTests(ms: number) {
  checkoutIntentWindowMs = ms;
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly db: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Optional() @Inject(COHORT_RESERVATIONS) private readonly seats?: CohortReservations,
  ) {}
  async resolve(tx: Tx, w: string, userId: string, input: CheckoutQuoteInput) {
    const now = new Date();
    if (!(await tx.workspace.findFirst({ where: { id: w, status: 'ACTIVE', deletedAt: null } })))
      throw new NotFoundException();
    const prices = await tx.price.findMany({
      where: {
        id: { in: input.items.map((i) => i.priceId) },
        workspaceId: w,
        isActive: true,
        product: { status: 'ACTIVE', deletedAt: null },
      },
      include: {
        product: {
          include: { productCourses: { include: { course: true }, orderBy: { position: 'asc' } } },
        },
      },
    });
    if (prices.length !== input.items.length) invalid('Unavailable price');
    const rows = input.items.map((i) => prices.find((p) => p.id === i.priceId)!);
    if (new Set(rows.map((p) => p.productId)).size !== rows.length) invalid('Duplicate product');
    if (new Set(rows.map((p) => p.currency)).size !== 1) invalid('Mixed currencies');
    const currency = rows[0]!.currency;
    if (!supportedCurrency(currency)) invalid('Unsupported currency');
    const recurring = rows.some((p) => p.product.type === 'SUBSCRIPTION_PLAN');
    if (recurring && (rows.length !== 1 || !rows[0]!.interval))
      invalid('Plan must be checked out alone');
    const selections: Selection[] = [];
    for (const [index, p] of rows.entries()) {
      if (!p.product.productCourses.length) invalid('Empty product');
      const selectors = input.items[index]!.cohorts ?? [];
      if (selectors.some((s) => !p.product.productCourses.some((c) => c.courseId === s.courseId)))
        invalid('Foreign cohort selector');
      const selected: Selection = [];
      for (const link of p.product.productCourses) {
        const c = link.course;
        if (c.deletedAt || c.status !== 'PUBLISHED' || c.visibility === 'PRIVATE')
          invalid('Unavailable course');
        const selector = selectors.find((s) => s.courseId === c.id);
        if ((c.deliveryMode === 'COHORT') !== !!selector)
          invalid('Cohort selection does not match delivery mode');
        if (selector) {
          const cohort = await tx.cohort.findFirst({
            where: {
              id: selector.cohortId,
              workspaceId: w,
              courseId: c.id,
              isPublished: true,
              deletedAt: null,
            },
          });
          if (
            !cohort ||
            (cohort.enrollmentOpensAt && cohort.enrollmentOpensAt > now) ||
            (cohort.enrollmentClosesAt && cohort.enrollmentClosesAt <= now) ||
            (cohort.endsAt && cohort.endsAt <= now)
          )
            invalid('Cohort not open');
        }
        selected.push({
          courseId: c.id,
          cohortId: selector?.cohortId ?? null,
          accessDurationDays: p.product.accessDurationDays,
        });
      }
      selections.push(selected);
    }
    // Ambiguous overlapping products can reserve a seat twice and are rejected.
    const all = selections.flat();
    if (new Set(all.map((s) => s.courseId)).size !== all.length)
      invalid('Overlapping course products');
    const subtotal = rows.reduce((n, p) => n + p.amount, 0);
    if (subtotal > 2147483647) invalid('Order too large');
    let coupon: Prisma.CouponGetPayload<{ include: { couponProducts: true } }> | null = null;
    let discountTotal = 0;
    let eligible = rows.map(() => 0);
    if (input.couponCode) {
      coupon = await tx.coupon.findUnique({
        where: { workspaceId_code: { workspaceId: w, code: input.couponCode } },
        include: { couponProducts: true },
      });
      if (!coupon) invalid('Invalid coupon');
      await lock(tx, `coupon:${coupon.id}`);
      // Re-read after lock so concurrent admin edits cannot invalidate the reserved terms.
      coupon = await tx.coupon.findUniqueOrThrow({
        where: { id: coupon.id },
        include: { couponProducts: true },
      });
      if (
        !coupon.isActive ||
        coupon.deletedAt ||
        coupon.validFrom > now ||
        (coupon.validUntil && coupon.validUntil <= now) ||
        subtotal < coupon.minimumOrderAmount
      )
        invalid('Coupon not eligible');
      if (coupon.kind === 'FIXED' && coupon.currency !== currency)
        invalid('Coupon currency mismatch');
      const live = {
        couponId: coupon.id,
        workspaceId: w,
        releasedAt: null,
        OR: [{ redeemedAt: { not: null } }, { reservedUntil: { gt: now } }],
      };
      const uses = await tx.couponRedemption.count({ where: live });
      const own = await tx.couponRedemption.count({ where: { ...live, userId } });
      if (
        (coupon.maxRedemptions !== null && uses >= coupon.maxRedemptions) ||
        own >= coupon.maxPerUser
      )
        conflict('Coupon usage limit reached');
      eligible = rows.map((p) =>
        !coupon!.couponProducts.length ||
        coupon!.couponProducts.some((c) => c.productId === p.productId)
          ? p.amount
          : 0,
      );
      const eligibleTotal = eligible.reduce((a, b) => a + b, 0);
      if (!eligibleTotal) invalid('Coupon product scope mismatch');
      const [whole = '0', fraction = ''] = String(coupon.percentOff ?? '0').split('.');
      const basisPoints = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
      discountTotal =
        coupon.kind === 'PERCENT'
          ? Number((BigInt(eligibleTotal) * basisPoints) / 10000n)
          : Math.min(eligibleTotal, coupon.amountOff!);
    }
    if (recurring && rows[0]!.trialDays > 0) {
      if (input.couponCode) invalid('Coupons cannot be combined with a trial');
      // The trial's initial invoice is free; the recurring amount remains frozen in Stripe price_data.
      discountTotal = subtotal;
      eligible = rows.map((p) => p.amount);
    }
    const discounts = allocate(discountTotal, eligible);
    const quote = checkoutQuoteSchema.parse({
      currency,
      subtotal,
      discountTotal,
      taxTotal: 0,
      grandTotal: subtotal - discountTotal,
      items: rows.map((p, i) => ({
        priceId: p.id,
        productId: p.productId,
        name: p.product.name,
        quantity: 1,
        unitAmount: p.amount,
        discountAmount: discounts[i] ?? 0,
        taxAmount: 0,
        totalAmount: p.amount - (discounts[i] ?? 0),
      })),
    });
    return { rows, selections, quote, coupon, recurring };
  }
  async checkSeats(tx: Tx, w: string, courses: Selection, orderId?: string) {
    const selected = courses
      .filter((c) => c.cohortId)
      .sort((a, b) => a.cohortId!.localeCompare(b.cohortId!));
    if (selected.length && !this.seats)
      throw new ServiceUnavailableException('Cohort reservations not configured');
    for (const c of selected)
      await this.seats!.assertAvailable(tx, {
        workspaceId: w,
        courseId: c.courseId,
        cohortId: c.cohortId!,
        at: new Date(),
        excludeOrderId: orderId,
      });
  }
  async quote(actor: AuthenticatedUser, w: string, input: CheckoutQuoteInput) {
    return this.db.$transaction(async (tx) => {
      const resolved = await this.resolve(tx, w, actor.id, input);
      await this.checkSeats(tx, w, resolved.selections.flat());
      return { data: resolved.quote };
    });
  }
  async session(
    actor: AuthenticatedUser,
    w: string,
    input: CheckoutSessionInput,
    key: string | undefined,
    requestId: string,
  ) {
    if (!actor.emailVerifiedAt) throw new ForbiddenException('Verify email before checkout');
    const stripeScope = hash({ w, u: actor.id, key });
    const orderId = uuidFromHash(stripeScope);
    const phase = await this.db.$transaction(
      async (tx) => {
        const intent = await beginIdempotent(tx, w, actor.id, 'checkout', key, input);
        if (intent.kind === 'completed') return { done: true as const, response: intent.response };
        if (intent.kind === 'new') {
          const resolved = await this.resolve(tx, w, actor.id, input);
          const { quote, rows, selections, coupon, recurring } = resolved;
          if ((quote.grandTotal > 0 || recurring) && !this.provider.enabled)
            throw new ServiceUnavailableException('Payments disabled');
          // Stable IDs bridge provider success followed by DB rollback or process loss.
          const expiresAt = new Date(
            Date.now() +
              (quote.grandTotal > 0 || recurring ? checkoutIntentWindowMs : 24 * 60 * 60000),
          );
          await tx.order.create({
            data: {
              id: orderId,
              workspaceId: w,
              userId: actor.id,
              number: `LMS-${stripeScope.slice(0, 24)}`,
              currency: quote.currency,
              subtotal: quote.subtotal,
              discountTotal: quote.discountTotal,
              grandTotal: quote.grandTotal,
              couponId: coupon?.id ?? null,
              expiresAt,
              orderItems: {
                create: rows.map((p, i) => ({
                  productId: p.productId,
                  priceId: p.id,
                  unitAmount: p.amount,
                  discountAmount: quote.items[i]!.discountAmount,
                  totalAmount: quote.items[i]!.totalAmount,
                  accessDurationDays: p.product.accessDurationDays,
                  productSnapshot: json({
                    id: p.productId,
                    name: p.product.name,
                    type: p.product.type,
                    interval: p.interval,
                    intervalCount: p.intervalCount,
                    trialDays: p.trialDays,
                    position: i,
                  }),
                  entitlementSnapshot: json({ courses: selections[i] }),
                  orderItemCourses: { create: selections[i]!.map((c) => ({ ...c })) },
                })),
              },
            },
          });
          const cohortCourses = selections.flat().filter((c) => c.cohortId);
          await this.checkSeats(tx, w, cohortCourses, orderId);
          if (coupon)
            await tx.couponRedemption.create({
              data: {
                workspaceId: w,
                userId: actor.id,
                couponId: coupon.id,
                orderId,
                reservedUntil: expiresAt,
              },
            });
          if (!quote.grandTotal && !recurring) {
            const paidAt = new Date();
            await tx.order.update({
              where: { id: orderId },
              data: { status: 'PAID', paidAt, expiresAt: null },
            });
            await tx.couponRedemption.updateMany({
              where: { orderId },
              data: { redeemedAt: paidAt, reservedUntil: null },
            });
            await this.outbox.append(tx, {
              workspaceId: w,
              type: 'order.paid.v1',
              aggregateType: 'Order',
              aggregateId: orderId,
              payload: { orderId },
            });
            const response = { data: { orderId, checkoutUrl: null, expiresAt: null } };
            await this.audit.append(tx, {
              workspaceId: w,
              actorId: actor.id,
              requestId,
              action: 'commerce.checkout.created',
              resourceType: 'Order',
              resourceId: orderId,
              changes: { amount: quote.grandTotal, currency: quote.currency },
            });
            return {
              done: true as const,
              response: await completeIdempotent(tx, intent.scope, 201, response),
            };
          }
        }
        const order = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          include: { orderItems: true },
        });
        if (order.status !== 'PENDING') conflict('Order is no longer pending');
        return { done: false as const, order, scope: intent.scope };
      },
      { timeout: 10000, maxWait: 10000 },
    );
    if (phase.done) return phase.response;
    const { order, scope } = phase;
    const customer = await this.customer(w, actor);
    const items = order.orderItems
      .map((item) => ({
        item,
        snapshot: item.productSnapshot as {
          name: string;
          type: string;
          interval: string | null;
          intervalCount: number;
          trialDays: number;
          position: number;
        },
      }))
      .sort((a, b) => a.snapshot.position - b.snapshot.position);
    const recurring = items[0]!.snapshot.type === 'SUBSCRIPTION_PLAN';
    const trialDays = items[0]!.snapshot.trialDays;
    const lineItems = items.map(({ item, snapshot }) => ({
      price_data: {
        currency: order.currency,
        unit_amount: recurring ? item.unitAmount : item.totalAmount,
        product_data: { name: snapshot.name },
        ...(recurring
          ? {
              recurring: {
                interval: snapshot.interval!.toLowerCase(),
                interval_count: snapshot.intervalCount,
              },
            }
          : {}),
      },
      quantity: 1,
    }));
    let discount: Record<string, unknown> | undefined;
    if (recurring && order.discountTotal && !trialDays) {
      const c = await this.provider.call(
        'coupons',
        'create',
        { duration: 'once', amount_off: order.discountTotal, currency: order.currency },
        `coupon-${stripeScope}`,
      );
      discount = { coupon: c.id };
    }
    const session = await this.provider.call(
      'checkout.sessions',
      'create',
      {
        mode: recurring ? 'subscription' : 'payment',
        customer: customer.stripeCustomerId,
        line_items: lineItems,
        success_url: this.url(input.successPath),
        cancel_url: this.url(input.cancelPath),
        ...(discount ? { discounts: [discount] } : {}),
        ...(recurring && trialDays ? { subscription_data: { trial_period_days: trialDays } } : {}),
      },
      `checkout-${stripeScope}`,
    );
    if (typeof session.url !== 'string' || typeof session.expires_at !== 'number')
      throw new Error('Invalid checkout response');
    const response = {
      data: {
        orderId,
        checkoutUrl: session.url,
        expiresAt: new Date(session.expires_at * 1000).toISOString(),
      },
    };
    checkoutSessionSchema.parse(response.data);
    return this.db.$transaction(
      async (tx) => {
        await lock(tx, `order:${orderId}`);
        const updated = await tx.order.updateMany({
          where: { id: orderId, status: 'PENDING', stripeCheckoutSessionId: null },
          data: {
            stripeCheckoutSessionId: session.id,
            expiresAt: new Date((session.expires_at as number) * 1000),
          },
        });
        if (!updated.count) {
          const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
          if (current.status !== 'PENDING' || current.stripeCheckoutSessionId !== session.id)
            conflict('Order changed during checkout');
        } else {
          await tx.couponRedemption.updateMany({
            where: { orderId, redeemedAt: null, releasedAt: null },
            data: { reservedUntil: new Date((session.expires_at as number) * 1000) },
          });
          await this.audit.append(tx, {
            workspaceId: w,
            actorId: actor.id,
            requestId,
            action: 'commerce.checkout.created',
            resourceType: 'Order',
            resourceId: orderId,
            changes: { amount: order.grandTotal, currency: order.currency },
          });
        }
        return completeIdempotent(tx, scope, 201, response);
      },
      { timeout: 10000 },
    );
  }
  async customer(w: string, a: AuthenticatedUser) {
    const where = { workspaceId_userId: { workspaceId: w, userId: a.id } };
    const existing = await this.db.billingCustomer.findUnique({ where });
    if (existing) return existing;
    const remote = await this.provider.call(
      'customers',
      'create',
      { metadata: { local_billing_scope: hash({ w, u: a.id }) } },
      `customer-${hash({ w, u: a.id })}`,
    );
    await this.db.billingCustomer.createMany({
      data: { workspaceId: w, userId: a.id, stripeCustomerId: remote.id },
      skipDuplicates: true,
    });
    return this.db.billingCustomer.findUniqueOrThrow({ where });
  }
  url(path: string) {
    applicationPathSchema.parse(path);
    return new URL(path, process.env.WEB_ORIGIN ?? 'http://localhost:3100').toString();
  }
}
function uuidFromHash(h: string): string {
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
