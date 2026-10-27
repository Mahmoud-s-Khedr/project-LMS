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
  idempotent,
  hash,
} from './commerce.core';
import { supportedCurrency } from './commerce-admin.service';

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
    return this.db.$transaction(
      async (tx) =>
        idempotent(tx, w, actor.id, 'checkout', key, input, 201, async () => {
          const resolved = await this.resolve(tx, w, actor.id, input);
          const { quote, rows, selections, coupon, recurring } = resolved;
          if ((quote.grandTotal > 0 || recurring) && !this.provider.enabled)
            throw new ServiceUnavailableException('Payments disabled');
          // Stable IDs bridge provider success followed by DB rollback or process loss.
          const scope = hash({ w, u: actor.id, key });
          const orderId = uuidFromHash(scope);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60000);
          await tx.order.create({
            data: {
              id: orderId,
              workspaceId: w,
              userId: actor.id,
              number: `LMS-${scope.slice(0, 24)}`,
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
          let response;
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
            response = { data: { orderId, checkoutUrl: null, expiresAt: null } };
          } else {
            const customer = await this.customer(tx, w, actor);
            const lineItems: Record<string, unknown>[] = [];
            for (const [i, p] of rows.entries()) {
              // Inline price_data freezes exact server-resolved one-time economics.
              const priceData: Record<string, unknown> = {
                currency: p.currency,
                unit_amount: recurring ? p.amount : quote.items[i]!.totalAmount,
                product_data: { name: p.product.name },
              };
              if (recurring)
                priceData.recurring = {
                  interval: p.interval!.toLowerCase(),
                  interval_count: p.intervalCount,
                };
              lineItems.push({ price_data: priceData, quantity: 1 });
            }
            let discount: Record<string, unknown> | undefined;
            if (recurring && quote.discountTotal && !rows[0]!.trialDays) {
              const c = await this.provider.call(
                'coupons',
                'create',
                { duration: 'once', amount_off: quote.discountTotal, currency: quote.currency },
                `coupon-${scope}`,
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
                ...(recurring && rows[0]!.trialDays
                  ? { subscription_data: { trial_period_days: rows[0]!.trialDays } }
                  : {}),
              },
              `checkout-${scope}`,
            );
            if (typeof session.url !== 'string' || typeof session.expires_at !== 'number')
              throw new Error('Invalid checkout response');
            await tx.order.update({
              where: { id: orderId },
              data: {
                stripeCheckoutSessionId: session.id,
                expiresAt: new Date(session.expires_at * 1000),
              },
            });
            response = {
              data: {
                orderId,
                checkoutUrl: session.url,
                expiresAt: new Date(session.expires_at * 1000).toISOString(),
              },
            };
          }
          await this.audit.append(tx, {
            workspaceId: w,
            actorId: actor.id,
            requestId,
            action: 'commerce.checkout.created',
            resourceType: 'Order',
            resourceId: orderId,
            changes: { amount: quote.grandTotal, currency: quote.currency },
          });
          checkoutSessionSchema.parse(response.data);
          return response;
        }),
      { timeout: 60000, maxWait: 10000 },
    );
  }
  async customer(tx: Tx, w: string, a: AuthenticatedUser) {
    await lock(tx, `customer:${w}:${a.id}`);
    const existing = await tx.billingCustomer.findUnique({
      where: { workspaceId_userId: { workspaceId: w, userId: a.id } },
    });
    if (existing) return existing;
    const remote = await this.provider.call(
      'customers',
      'create',
      { metadata: { local_billing_scope: hash({ w, u: a.id }) } },
      `customer-${hash({ w, u: a.id })}`,
    );
    return tx.billingCustomer.create({
      data: { workspaceId: w, userId: a.id, stripeCustomerId: remote.id },
    });
  }
  url(path: string) {
    applicationPathSchema.parse(path);
    return new URL(path, process.env.WEB_ORIGIN ?? 'http://localhost:3100').toString();
  }
}
function uuidFromHash(h: string): string {
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
