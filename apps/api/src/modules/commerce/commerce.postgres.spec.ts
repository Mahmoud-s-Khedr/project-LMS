import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CommerceModule } from './commerce.module';
import { CohortCapacityService } from '../content/cohort-capacity.service';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
const hashForTest = () => createHash('sha256').update(randomUUID()).digest('hex');
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckoutSession, CheckoutSessionInput, RefundInput } from '@lms/shared';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PolicyService } from '../../common/authz/policy.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { AuditService } from '../audit/audit.service';
import { CommerceAdminService } from './commerce-admin.service';
import { CheckoutService } from './checkout.service';
import { BillingService } from './billing.service';
import { CommerceWorkerService } from './commerce-worker.service';
import { CommerceCatalogService } from './commerce-catalog.service';
import {
  PAYMENT_PROVIDER,
  stripeEvent,
  type PaymentProvider,
  type ProviderObject,
} from './payment-provider';

class FakeProvider implements PaymentProvider {
  enabled = true;
  serial = 0;
  readonly objects = new Map<string, ProviderObject>();
  readonly keys = new Map<string, ProviderObject>();
  readonly calls: string[] = [];
  verify(raw: Buffer) {
    return stripeEvent.parse(JSON.parse(raw.toString()));
  }
  async call(
    resource: string,
    action: string,
    params: Record<string, unknown>,
    key?: string,
    id?: string,
  ) {
    this.calls.push(`${resource}.${action}`);
    if (key && this.keys.has(key)) return this.keys.get(key)!;
    if (action === 'list' && resource === 'invoices')
      return {
        id: 'list',
        data: [...this.objects.values()].filter(
          (v) =>
            v.parent &&
            typeof v.parent === 'object' &&
            'subscription_details' in v.parent &&
            (v.parent.subscription_details as { subscription: string }).subscription ===
              params.subscription,
        ),
        has_more: false,
      };
    let response: ProviderObject;
    if (action === 'retrieve') {
      const row = this.objects.get(id!);
      if (!row) throw new Error(`No fixture ${id}`);
      return row;
    }
    if (action === 'expire') {
      response = { ...this.objects.get(id!)!, status: 'expired' };
      this.objects.set(id!, response);
      return response;
    }
    if (resource === 'subscriptions' && ['cancel', 'update'].includes(action)) {
      response = {
        ...this.objects.get(id!)!,
        ...(action === 'cancel'
          ? { status: 'canceled', ended_at: Math.floor(Date.now() / 1000) }
          : params),
      };
      this.objects.set(id!, response);
    } else if (resource === 'checkout.sessions')
      response = {
        id: `cs_${++this.serial}`,
        status: 'open',
        url: 'https://checkout.stripe.com/c/pay/test',
        expires_at: Math.floor(Date.now() / 1000) + 86400,
        ...params,
      };
    else if (resource === 'billingPortal.sessions')
      response = { id: `bps_${++this.serial}`, url: 'https://billing.stripe.com/p/session/test' };
    else if (resource === 'refunds')
      response = { id: `re_${++this.serial}`, ...params, status: 'pending', currency: 'usd' };
    else response = { id: `cus_${++this.serial}`, ...params };
    this.objects.set(response.id, response);
    if (key) this.keys.set(key, response);
    return response;
  }
}
const suite = process.env.COMMERCE_TEST_DATABASE_URL ? describe : describe.skip;
suite('commerce real PostgreSQL invariants', () => {
  const schema = `commerce_test_${randomUUID().replaceAll('-', '')}`;
  let app: INestApplication, baseUrl: string;
  let pool: Pool,
    db: PrismaClient,
    checkout: CheckoutService,
    billing: BillingService,
    worker: CommerceWorkerService,
    admin: CommerceAdminService,
    catalog: CommerceCatalogService,
    provider: FakeProvider;
  let owner: AuthenticatedUser,
    buyer: AuthenticatedUser,
    other: AuthenticatedUser,
    w: string,
    foreign: string,
    course: string,
    course2: string,
    product: string,
    price: string;
  const req = 'commerce-integration';
  const payload = (priceId = price): CheckoutSessionInput => ({
    items: [{ priceId }],
    successPath: '/student/orders',
    cancelPath: '/checkout',
  });
  const session = async (input = payload(), actor = buyer, key = randomUUID()) =>
    ((await checkout.session(actor, w, input, key, req)) as { data: CheckoutSession }).data;
  async function person(): Promise<AuthenticatedUser> {
    const row = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        name: 'Commerce test',
        emailVerifiedAt: new Date(),
      },
    });
    return { ...row, sessionId: randomUUID(), familyId: randomUUID() };
  }
  async function offer(
    amount = 1000,
    type: 'COURSE' | 'BUNDLE' | 'SUBSCRIPTION_PLAN' = 'COURSE',
    courses = [course],
  ) {
    const p = await admin.createProduct(
      owner,
      w,
      {
        type,
        name: 'Offer',
        slug: `offer-${randomUUID()}`,
        description: { type: 'doc', content: [] },
        accessDurationDays: 30,
        courseIds: courses,
      },
      req,
    );
    await admin.updateProduct(owner, w, p.data.id, { status: 'ACTIVE' }, req);
    const pr = await admin.createPrice(
      owner,
      w,
      p.data.id,
      {
        currency: 'usd',
        amount,
        interval: type === 'SUBSCRIPTION_PLAN' ? 'MONTH' : null,
        intervalCount: 1,
        trialDays: 0,
        isActive: true,
      },
      req,
    );
    return { product: p.data.id, price: pr.data.id };
  }
  async function event(type: string, id: string, eventId = randomUUID()) {
    await worker.accept(
      Buffer.from(
        JSON.stringify({
          id: `evt_${eventId}`,
          type,
          created: Math.floor(Date.now() / 1000),
          livemode: false,
          api_version: '2026-09-30.endive',
          data: { object: { id } },
        }),
      ),
      'fixture',
    );
    const e = await db.stripeWebhook.findUniqueOrThrow({
      where: { stripeEventId: `evt_${eventId}` },
    });
    await worker.process(e.id);
    return e.id;
  }
  async function capture(orderId: string, overrides: Record<string, unknown> = {}) {
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    const s = provider.objects.get(o.stripeCheckoutSessionId!)!;
    const pi = `pi_${randomUUID()}`,
      ch = `ch_${randomUUID()}`;
    provider.objects.set(pi, {
      id: pi,
      status: 'succeeded',
      amount_received: o.grandTotal,
      currency: o.currency,
      latest_charge: ch,
    });
    provider.objects.set(ch, { id: ch, created: 1700000000 });
    provider.objects.set(s.id, {
      ...s,
      status: 'complete',
      payment_status: 'paid',
      amount_total: o.grandTotal,
      currency: o.currency,
      payment_intent: pi,
      created: 1700000000,
      total_details: { amount_tax: 0 },
      ...overrides,
    });
    return { sessionId: s.id, pi, ch };
  }
  beforeAll(async () => {
    const connectionString = process.env.COMMERCE_TEST_DATABASE_URL!;
    if (new URL(connectionString).port !== '55432')
      throw new Error('Tests require isolated schema on local LMS port 55432');
    pool = new Pool({ connectionString, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}"`);
    await pool.query(
      readFileSync(
        join(__dirname, '../../../prisma/migrations/20261026000000_initial/migration.sql'),
        'utf8',
      ).replace('CREATE SCHEMA IF NOT EXISTS "public";', ''),
    );
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}`, max: 12 },
        { schema },
      ),
    });
    await db.$connect();
    const prisma = db as PrismaService;
    const policy = new PolicyService(prisma),
      audit = new AuditService(prisma, { nodeEnv: 'test' }),
      outbox = new OutboxService(new SharedEventContracts());
    provider = new FakeProvider();
    admin = new CommerceAdminService(prisma, policy, audit, provider);
    checkout = new CheckoutService(prisma, provider, outbox, audit);
    billing = new BillingService(prisma, admin, provider, checkout, audit);
    worker = new CommerceWorkerService(prisma, provider, outbox, audit);
    catalog = new CommerceCatalogService(prisma);
    owner = await person();
    buyer = await person();
    other = await person();
    const workspace = await db.workspace.create({
      data: {
        ownerId: owner.id,
        kind: 'ACADEMY',
        name: 'Commerce tests',
        slug: `commerce-${randomUUID()}`,
      },
    });
    w = workspace.id;
    foreign = (
      await db.workspace.create({
        data: {
          ownerId: other.id,
          kind: 'PERSONAL',
          name: 'Other',
          slug: `foreign-${randomUUID()}`,
        },
      })
    ).id;
    await db.workspaceMember.create({ data: { workspaceId: w, userId: owner.id, role: 'ADMIN' } });
    for (let i = 0; i < 2; i++) {
      const c = await db.course.create({
        data: {
          workspaceId: w,
          createdById: owner.id,
          slug: `course-${i}`,
          title: `Course ${i}`,
          summary: 'Test',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          description: { type: 'doc', content: [] },
        },
      });
      if (i === 0) course = c.id;
      else course2 = c.id;
    }
    ({ product, price } = await offer());
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: 'commerce-test-signing-key' })],
        }),
        CommerceModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(PAYMENT_PROVIDER)
      .useValue(provider)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });
  it('projects active public offers against strict shared response schemas', async () => {
    const result = await catalog.detail(product);
    expect(result.data.courses[0]?.id).toBe(course);
    expect(result.data).not.toHaveProperty('stripeProductId');
  });
  it('reads only an authorized same-workspace administrative product', async () => {
    expect((await admin.product(owner, w, product)).data.id).toBe(product);
    await expect(admin.product(buyer, w, product)).rejects.toMatchObject({ status: 404 });
    await expect(admin.product(owner, randomUUID(), product)).rejects.toMatchObject({
      status: 404,
    });
    await expect(admin.product(owner, w, randomUUID())).rejects.toMatchObject({ status: 404 });
  });
  it('rejects non-admin configuration and cross-tenant course membership', async () => {
    await expect(admin.products(buyer, w, { limit: 20 })).rejects.toThrow();
    await expect(
      admin.createProduct(
        owner,
        w,
        {
          type: 'COURSE',
          name: 'Bad',
          slug: 'bad',
          description: { type: 'doc', content: [] },
          accessDurationDays: null,
          courseIds: [randomUUID()],
        },
        req,
      ),
    ).rejects.toThrow('Invalid course');
    await expect(checkout.quote(buyer, foreign, { items: [{ priceId: price }] })).rejects.toThrow();
  });
  it('enforces verified email, money-only disabled mode, and a free trusted checkout without synthetic Payment', async () => {
    await expect(session(payload(), { ...buyer, emailVerifiedAt: null })).rejects.toThrow('Verify');
    const free = await offer(0);
    provider.enabled = false;
    try {
      await expect(session()).rejects.toThrow('Payments disabled');
      const r = await session(payload(free.price));
      expect(r.checkoutUrl).toBeNull();
      expect(await db.payment.count({ where: { orderId: r.orderId } })).toBe(0);
      expect(
        await db.outboxEvent.count({ where: { aggregateId: r.orderId, type: 'order.paid.v1' } }),
      ).toBe(1);
      expect(await db.enrollmentGrant.count()).toBe(0);
    } finally {
      provider.enabled = true;
    }
  });
  it('serializes duplicate checkout keys, replays response, rejects changed bodies', async () => {
    const key = randomUUID();
    const results = await Promise.allSettled([
      session(payload(), buyer, key),
      session(payload(), buyer, key),
    ]);
    const success = results.find(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<CheckoutSession>;
    expect(success).toBeDefined();
    expect(await session(payload(), buyer, key)).toEqual(success.value);
    expect(await db.order.count({ where: { id: success.value.orderId } })).toBe(1);
    await expect(session({ ...payload(), cancelPath: '/catalog' }, buyer, key)).rejects.toThrow(
      'Key already used',
    );
  });
  it('rejects missing keys and mixed currencies, duplicate products, and plan baskets', async () => {
    await expect(checkout.session(buyer, w, payload(), undefined, req)).rejects.toThrow(
      'Idempotency-Key',
    );
    const eur = await admin.createPrice(
      owner,
      w,
      product,
      {
        currency: 'eur',
        amount: 5,
        interval: null,
        intervalCount: 1,
        trialDays: 0,
        isActive: true,
      },
      req,
    );
    const second = await offer();
    await expect(
      checkout.quote(buyer, w, { items: [{ priceId: price }, { priceId: eur.data.id }] }),
    ).rejects.toThrow('Duplicate product');
    await db.price.update({ where: { id: second.price }, data: { currency: 'eur' } });
    await expect(
      checkout.quote(buyer, w, { items: [{ priceId: price }, { priceId: second.price }] }),
    ).rejects.toThrow('Mixed currencies');
    const plan = await offer(2000, 'SUBSCRIPTION_PLAN');
    await expect(
      checkout.quote(buyer, w, { items: [{ priceId: price }, { priceId: plan.price }] }),
    ).rejects.toThrow('Plan must');
  });
  it('atomically reserves a last coupon under concurrent requests and releases expired sessions', async () => {
    const coupon = await admin.createCoupon(
      owner,
      w,
      {
        code: 'LAST',
        kind: 'FIXED',
        amountOff: 100,
        currency: 'usd',
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: null,
        maxRedemptions: 1,
        maxPerUser: 1,
        minimumOrderAmount: 0,
        isActive: true,
      },
      req,
    );
    const input = { ...payload(), couponCode: 'LAST' };
    const results = await Promise.allSettled([session(input, buyer), session(input, other)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.couponRedemption.count({ where: { couponId: coupon.data.id } })).toBe(1);
    const success = results.find(
      (r) => r.status === 'fulfilled',
    ) as PromiseFulfilledResult<CheckoutSession>;
    const o = await db.order.findUniqueOrThrow({ where: { id: success.value.orderId } });
    const s = provider.objects.get(o.stripeCheckoutSessionId!)!;
    provider.objects.set(s.id, { ...s, status: 'expired' });
    await event('checkout.session.expired', s.id);
    expect(
      await db.couponRedemption.count({
        where: { couponId: coupon.data.id, releasedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it('supports percent rounding, product scoping, expiry, fixed currency and per-user limits', async () => {
    const c = await admin.createCoupon(
      owner,
      w,
      {
        code: 'PERCENT',
        kind: 'PERCENT',
        percentOff: '12.50',
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: null,
        maxRedemptions: null,
        maxPerUser: 1,
        minimumOrderAmount: 0,
        isActive: true,
      },
      req,
    );
    expect(
      (await checkout.quote(buyer, w, { items: [{ priceId: price }], couponCode: 'PERCENT' })).data
        .discountTotal,
    ).toBe(125);
    const another = await offer();
    await admin.replaceCouponProducts(owner, w, c.data.id, [another.product], req);
    await expect(
      checkout.quote(buyer, w, { items: [{ priceId: price }], couponCode: 'PERCENT' }),
    ).rejects.toThrow('scope mismatch');
    await admin.replaceCouponProducts(owner, w, c.data.id, [], req);
    await session({ ...payload(), couponCode: 'PERCENT' });
    await expect(session({ ...payload(), couponCode: 'PERCENT' })).rejects.toThrow('usage limit');
    await admin.updateCoupon(
      owner,
      w,
      c.data.id,
      { validUntil: new Date(Date.now() - 1000).toISOString() },
      req,
    );
    await expect(
      checkout.quote(other, w, { items: [{ priceId: price }], couponCode: 'PERCENT' }),
    ).rejects.toThrow('not eligible');
    await admin.createCoupon(
      owner,
      w,
      {
        code: 'EUR',
        kind: 'FIXED',
        currency: 'eur',
        amountOff: 10,
        validFrom: new Date(Date.now() - 10000).toISOString(),
        validUntil: null,
        maxRedemptions: null,
        maxPerUser: 1,
        minimumOrderAmount: 0,
        isActive: true,
      },
      req,
    );
    await expect(
      checkout.quote(buyer, w, { items: [{ priceId: price }], couponCode: 'EUR' }),
    ).rejects.toThrow('currency mismatch');
  });
  it('freezes bundle courses and durations despite later product edits', async () => {
    const bundle = await offer(2500, 'BUNDLE', [course, course2]);
    const r = await session(payload(bundle.price));
    await admin.replaceCourses(owner, w, bundle.product, [course2], req);
    await admin.updateProduct(owner, w, bundle.product, { accessDurationDays: 7 }, req);
    const o = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { orderItems: { include: { orderItemCourses: true } } },
    });
    expect(o.orderItems[0]!.orderItemCourses).toHaveLength(2);
    expect(o.orderItems[0]!.orderItemCourses.every((c) => c.accessDurationDays === 30)).toBe(true);
  });
  it('rejects foreign selectors, missing cohort selections and fails closed without seat service', async () => {
    await expect(
      checkout.quote(buyer, w, {
        items: [{ priceId: price, cohorts: [{ courseId: randomUUID(), cohortId: randomUUID() }] }],
      }),
    ).rejects.toThrow('Foreign');
    const courseRow = await db.course.create({
      data: {
        workspaceId: w,
        createdById: owner.id,
        slug: `cohort-${randomUUID()}`,
        title: 'Cohort',
        summary: '',
        deliveryMode: 'COHORT',
        status: 'PUBLISHED',
      },
    });
    const o = await offer(100, 'COURSE', [courseRow.id]);
    const cohort = await db.cohort.create({
      data: {
        workspaceId: w,
        courseId: courseRow.id,
        name: 'Cohort',
        startsAt: new Date(),
        isPublished: true,
        capacity: 1,
      },
    });
    await expect(checkout.quote(buyer, w, { items: [{ priceId: o.price }] })).rejects.toThrow(
      'Cohort selection',
    );
    await expect(
      session({
        ...payload(o.price),
        items: [{ priceId: o.price, cohorts: [{ courseId: courseRow.id, cohortId: cohort.id }] }],
      }),
    ).rejects.toThrow('reservations not configured');
  });
  it('handles asynchronous failure then success, duplicate and out-of-order events with one financial effect', async () => {
    const r = await session();
    const { sessionId } = await capture(r.orderId, { payment_status: 'unpaid' });
    await event('checkout.session.async_payment_failed', sessionId);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe('PENDING');
    provider.objects.set(sessionId, {
      ...provider.objects.get(sessionId)!,
      payment_status: 'paid',
    });
    const e = await event('checkout.session.async_payment_succeeded', sessionId);
    await worker.process(e);
    await event('checkout.session.completed', sessionId);
    await event('checkout.session.async_payment_failed', sessionId);
    expect(await db.payment.count({ where: { orderId: r.orderId } })).toBe(1);
    expect(
      await db.outboxEvent.count({ where: { aggregateId: r.orderId, type: 'order.paid.v1' } }),
    ).toBe(1);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).paidAt?.toISOString(),
    ).toBe('2023-11-14T22:13:20.000Z');
    expect(await db.enrollmentGrant.count()).toBe(0);
  });
  it('rejects untrusted metadata-only mappings, wrong totals and customer IDs', async () => {
    provider.objects.set('cs_foreign', {
      id: 'cs_foreign',
      status: 'complete',
      metadata: { workspaceId: w, userId: buyer.id },
    });
    await expect(event('checkout.session.completed', 'cs_foreign')).rejects.toThrow();
    const r = await session();
    const f = await capture(r.orderId, { amount_total: 1 });
    await expect(event('checkout.session.completed', f.sessionId)).rejects.toThrow();
    expect(await db.payment.count({ where: { orderId: r.orderId } })).toBe(0);
  });
  it('enforces owner receipts and scope-bound pagination', async () => {
    const r = await session();
    await expect(billing.order(other, r.orderId)).rejects.toThrow();
    await expect(billing.order(owner, r.orderId, foreign)).rejects.toThrow();
    const page = await billing.orders(buyer, { limit: 1 });
    expect(page.meta.hasMore).toBe(true);
    await expect(
      billing.orders(other, { limit: 1, cursor: page.meta.nextCursor! }),
    ).rejects.toThrow('scope mismatch');
  });
  it('serializes refunds against captured balance, confirms partial/full status and preserves allocations', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const p = await db.payment.findFirstOrThrow({ where: { orderId: r.orderId } }),
      item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    const request = (amount: number, revokeAccess = false): RefundInput => ({
      amount,
      reason: 'Test refund',
      revokeAccess,
      items: [{ orderItemId: item.id, amount, revokeAccess }],
    });
    const refunds = await Promise.allSettled([
      billing.refund(owner, w, p.id, request(600), randomUUID(), req),
      billing.refund(owner, w, p.id, request(600), randomUUID(), req),
    ]);
    expect(refunds.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    let local = await db.refund.findFirstOrThrow({ where: { paymentId: p.id } });
    await worker.submitRefund(local.id);
    local = await db.refund.findUniqueOrThrow({ where: { id: local.id } });
    expect(local.status).toBe('PENDING');
    const remote = provider.objects.get(local.stripeRefundId!)!;
    provider.objects.set(remote.id, { ...remote, status: 'succeeded' });
    await event('refund.updated', remote.id);
    await event('refund.created', remote.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe(
      'PARTIALLY_REFUNDED',
    );
    expect(
      await db.outboxEvent.count({ where: { aggregateId: local.id, type: 'refund.succeeded.v1' } }),
    ).toBe(1);
    const remaining = (await billing.refund(
      owner,
      w,
      p.id,
      request(400, true),
      randomUUID(),
      req,
    )) as { data: { operationId: string } };
    await worker.submitRefund(remaining.data.operationId);
    const last = await db.refund.findUniqueOrThrow({ where: { id: remaining.data.operationId } });
    provider.objects.set(last.stripeRefundId!, {
      ...provider.objects.get(last.stripeRefundId!)!,
      status: 'succeeded',
    });
    await event('refund.updated', last.stripeRefundId!);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe(
      'REFUNDED',
    );
    expect(await db.enrollmentGrant.count()).toBe(0);
  });
  it('rejects foreign and overallocated refunds, replays the original operation', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const p = await db.payment.findFirstOrThrow({ where: { orderId: r.orderId } }),
      item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    const b = {
      amount: 100,
      reason: 'Refund',
      revokeAccess: false,
      items: [{ orderItemId: item.id, amount: 100, revokeAccess: false }],
    };
    await expect(billing.refund(buyer, w, p.id, b, randomUUID(), req)).rejects.toThrow();
    await expect(
      billing.refund(
        owner,
        w,
        p.id,
        { ...b, items: [{ ...b.items[0]!, orderItemId: randomUUID() }] },
        randomUUID(),
        req,
      ),
    ).rejects.toThrow('Foreign');
    const key = randomUUID();
    expect(await billing.refund(owner, w, p.id, b, key, req)).toEqual(
      await billing.refund(owner, w, p.id, b, key, req),
    );
  });
  it('reconciles subscription creation, renewal, past_due, cancellation and duplicate invoices without extending unpaid time', async () => {
    const plan = await offer(2000, 'SUBSCRIPTION_PLAN');
    const r = await session(payload(plan.price));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    const s = provider.objects.get(order.stripeCheckoutSessionId!)!;
    const subId = `sub_${randomUUID()}`,
      invId = `in_${randomUUID()}`;
    const start = 1700000000,
      end = start + 2592000;
    const invoice = {
      id: invId,
      status: 'paid',
      amount_paid: 2000,
      amount_due: 2000,
      currency: 'usd',
      billing_reason: 'subscription_create',
      status_transitions: { paid_at: start },
      lines: {
        data: [
          {
            amount: 2000,
            parent: {
              subscription_item_details: { subscription_item: 'si_test', proration: false },
            },
            period: { start, end },
          },
        ],
      },
      parent: { subscription_details: { subscription: subId } },
    };
    provider.objects.set(invId, invoice);
    provider.objects.set(subId, {
      id: subId,
      customer: s.customer,
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            id: 'si_test',
            quantity: 1,
            price: {
              currency: 'usd',
              unit_amount: 2000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            current_period_start: start,
            current_period_end: end,
          },
        ],
      },
      latest_invoice: invoice,
    });
    provider.objects.set(s.id, {
      ...s,
      status: 'complete',
      payment_status: 'paid',
      subscription: subId,
      amount_total: 2000,
      currency: 'usd',
      total_details: { amount_tax: 0 },
    });
    await expect(event('invoice.paid', invId)).rejects.toThrow();
    await event('checkout.session.completed', s.id);
    await event('invoice.paid', invId);
    const local = await db.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
    });
    expect(local.currentPeriodEnd?.getTime()).toBe(end * 1000);
    expect(await db.payment.count({ where: { stripeInvoiceId: invId } })).toBe(1);
    expect(
      await db.outboxEvent.count({ where: { aggregateId: r.orderId, type: 'order.paid.v1' } }),
    ).toBe(0);
    const renewal = {
      ...invoice,
      id: `in_${randomUUID()}`,
      billing_reason: 'subscription_cycle',
      lines: {
        data: [
          {
            amount: 2000,
            parent: {
              subscription_item_details: { subscription_item: 'si_test', proration: false },
            },
            period: { start: end, end: end + 2592000 },
          },
        ],
      },
      payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_renewal' } }] },
      status_transitions: { paid_at: end },
    };
    provider.objects.set(renewal.id, renewal);
    provider.objects.set(subId, {
      ...provider.objects.get(subId)!,
      items: {
        data: [
          {
            id: 'si_test',
            quantity: 1,
            price: {
              currency: 'usd',
              unit_amount: 2000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            current_period_start: end,
            current_period_end: end + 2592000,
          },
        ],
      },
      latest_invoice: renewal,
    });
    await event('invoice.paid', renewal.id);
    expect(
      (
        await db.subscription.findUniqueOrThrow({ where: { id: local.id } })
      ).currentPeriodEnd?.getTime(),
    ).toBe((end + 2592000) * 1000);
    const missed = { ...renewal, id: `in_missed_${randomUUID()}`, payments: { data: [] } };
    provider.objects.set(missed.id, missed);
    await event('customer.subscription.updated', subId);
    expect(await db.payment.count({ where: { stripeInvoiceId: missed.id } })).toBe(1);
    const renewalPayment = await db.payment.findUniqueOrThrow({
      where: { stripeInvoiceId: renewal.id },
    });
    const refund = (await billing.refund(
      owner,
      w,
      renewalPayment.id,
      { amount: 500, reason: 'Renewal credit', revokeAccess: false },
      randomUUID(),
      req,
    )) as { data: { operationId: string } };
    await worker.submitRefund(refund.data.operationId);
    const refundRow = await db.refund.findUniqueOrThrow({ where: { id: refund.data.operationId } });
    provider.objects.set(refundRow.stripeRefundId!, {
      ...provider.objects.get(refundRow.stripeRefundId!)!,
      status: 'succeeded',
    });
    await event('refund.updated', refundRow.stripeRefundId!);
    expect(await db.refundItem.count({ where: { refundId: refundRow.id } })).toBe(0);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: local.id } })).status).toBe(
      'ACTIVE',
    );
    provider.objects.set(subId, {
      ...provider.objects.get(subId)!,
      status: 'past_due',
      items: {
        data: [
          {
            id: 'si_test',
            quantity: 1,
            price: {
              currency: 'usd',
              unit_amount: 2000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            current_period_start: end + 2592000,
            current_period_end: end + 5184000,
          },
        ],
      },
      latest_invoice: { ...renewal, status: 'open' },
    });
    await event('customer.subscription.updated', subId);
    const overdue = await db.subscription.findUniqueOrThrow({ where: { id: local.id } });
    expect(overdue.status).toBe('PAST_DUE');
    expect(overdue.currentPeriodEnd).toEqual(new Date((end + 2592000) * 1000));
    await billing.changeSubscription(buyer, local.id, randomUUID(), req, {});
    await event('customer.subscription.updated', subId);
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: local.id } })).cancelAtPeriodEnd,
    ).toBe(true);
    await billing.changeSubscription(buyer, local.id, randomUUID(), req, { resume: true });
    await event('customer.subscription.updated', subId);
    expect(
      (await db.subscription.findUniqueOrThrow({ where: { id: local.id } })).cancelAtPeriodEnd,
    ).toBe(false);
    await billing.changeSubscription(
      owner,
      local.id,
      randomUUID(),
      req,
      { immediate: true, reason: 'Test' },
      w,
    );
    await event('customer.subscription.deleted', subId);
    expect((await db.subscription.findUniqueOrThrow({ where: { id: local.id } })).status).toBe(
      'CANCELED',
    );
    expect(await db.enrollmentGrant.count()).toBe(0);
  });
  it('creates mapped immutable Stripe prices and permits owner-only portal and pending cancellation', async () => {
    expect(provider.calls).toContain('prices.create');
    expect((await db.price.findUniqueOrThrow({ where: { id: price } })).stripePriceId).toBeTruthy();
    const r = await session();
    const response = await billing.portal(buyer, w, '/student/subscriptions');
    expect(response.data.url).toContain('billing.stripe.com');
    await expect(billing.portal(owner, w, '/student/subscriptions')).rejects.toThrow();
    const result = (await billing.cancelOrder(buyer, w, r.orderId, randomUUID(), req)) as {
      data: { status: string };
    };
    expect(result.data.status).toBe('CANCELED');
    await expect(billing.cancelOrder(other, w, r.orderId, randomUUID(), req)).rejects.toThrow();
  });
  it('uses the real JWT guard and enforces HTTP tenant scope, strict inputs, ETags, raw webhook bodies and OpenAPI', async () => {
    const jwt = new JwtService();
    async function token(actor: AuthenticatedUser) {
      const row = await db.refreshSession.create({
        data: {
          userId: actor.id,
          familyId: randomUUID(),
          tokenHash: hashForTest(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return jwt.sign(
        { sub: actor.id, sid: row.id, fid: row.familyId, jti: randomUUID() },
        {
          secret: 'commerce-test-signing-key',
          issuer: 'lms-api',
          audience: 'lms-web',
          expiresIn: 600,
        },
      );
    }
    const adminToken = await token(owner),
      buyerToken = await token(buyer);
    const call = (
      path: string,
      method = 'GET',
      body?: unknown,
      access = adminToken,
      extra: Record<string, string> = {},
    ) =>
      fetch(`${baseUrl}/api/v1${path}`, {
        method,
        headers: {
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
          'Content-Type': 'application/json',
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    expect((await call('/me/orders', 'GET', undefined, '')).status).toBe(401);
    expect((await call(`/workspaces/${w}/products`, 'GET', undefined, buyerToken)).status).toBe(
      404,
    );
    expect(
      (
        await call(
          `/workspaces/${w}/checkout/quote`,
          'POST',
          { items: [{ priceId: price }], unitAmount: 1 },
          buyerToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (await call(`/workspaces/${w}/products/${product}`, 'PATCH', { name: 'HTTP edit' })).status,
    ).toBe(428);
    const row = await db.product.findUniqueOrThrow({ where: { id: product } });
    const tag = `"${row.updatedAt.getTime()}"`;
    const changed = await call(
      `/workspaces/${w}/products/${product}`,
      'PATCH',
      { name: 'HTTP edit' },
      adminToken,
      { 'If-Match': tag },
    );
    expect(changed.status).toBe(200);
    expect(changed.headers.get('etag')).toBeTruthy();
    expect(changed.headers.get('cache-control')).toContain('no-store');
    expect(
      (
        await call(
          `/workspaces/${w}/products/${product}`,
          'PATCH',
          { name: 'Stale edit' },
          adminToken,
          { 'If-Match': tag },
        )
      ).status,
    ).toBe(409);
    expect((await call('/webhooks/stripe', 'POST', { id: 'unsigned' }, '')).status).toBe(400);
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(doc.paths['/api/v1/workspaces/{workspaceId}/checkout/sessions']).toBeDefined();
    expect(doc.paths['/api/v1/me/subscriptions/{subscriptionId}/cancel']).toBeDefined();
  });
  it('contends on the actual content capacity service and keeps paid-but-unfulfilled seats reserved', async () => {
    const c = await db.course.create({
      data: {
        workspaceId: w,
        createdById: owner.id,
        slug: `seat-${randomUUID()}`,
        title: 'Seat test',
        summary: '',
        deliveryMode: 'COHORT',
        status: 'PUBLISHED',
      },
    });
    const o = await offer(100, 'COURSE', [c.id]);
    const cohort = await db.cohort.create({
      data: {
        workspaceId: w,
        courseId: c.id,
        name: 'Last seat',
        startsAt: new Date(),
        isPublished: true,
        capacity: 1,
      },
    });
    const prisma = db as PrismaService;
    const contentCheckout = new CheckoutService(
      prisma,
      provider,
      new OutboxService(new SharedEventContracts()),
      new AuditService(prisma, { nodeEnv: 'test' }),
      new CohortCapacityService(),
    );
    const input = {
      ...payload(o.price),
      items: [{ priceId: o.price, cohorts: [{ courseId: c.id, cohortId: cohort.id }] }],
    };
    const results = await Promise.allSettled([
      contentCheckout.session(buyer, w, input, randomUUID(), req),
      contentCheckout.session(other, w, input, randomUUID(), req),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const success = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{
      data: CheckoutSession;
    }>;
    const f = await capture(success.value.data.orderId);
    await event('checkout.session.completed', f.sessionId);
    await expect(contentCheckout.quote(other, w, { items: input.items })).rejects.toThrow('full');
  });
  it('records terminal async payment failure and releases its coupon reservation', async () => {
    const r = await session();
    const f = await capture(r.orderId, { payment_status: 'unpaid' });
    provider.objects.set(f.pi, {
      ...provider.objects.get(f.pi)!,
      status: 'requires_payment_method',
      amount: 1000,
    });
    await event('checkout.session.async_payment_failed', f.sessionId);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status).toBe(
      'CANCELED',
    );
    expect((await db.payment.findFirstOrThrow({ where: { orderId: r.orderId } })).status).toBe(
      'FAILED',
    );
  });
  it('records zero initial trial invoices without pretending the recurring amount was captured', async () => {
    const plan = await offer(2000, 'SUBSCRIPTION_PLAN');
    await db.price.update({ where: { id: plan.price }, data: { trialDays: 7 } });
    expect(
      (await checkout.quote(buyer, w, { items: [{ priceId: plan.price }] })).data.grandTotal,
    ).toBe(0);
    const r = await session(payload(plan.price));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    const s = provider.objects.get(order.stripeCheckoutSessionId!)!;
    const start = Math.floor(Date.now() / 1000),
      end = start + 604800,
      subId = `sub_${randomUUID()}`;
    provider.objects.set(subId, {
      id: subId,
      customer: s.customer,
      status: 'trialing',
      trial_start: start,
      trial_end: end,
      items: {
        data: [
          {
            id: 'si_test',
            quantity: 1,
            price: {
              currency: 'usd',
              unit_amount: 2000,
              recurring: { interval: 'month', interval_count: 1 },
            },
            current_period_start: start,
            current_period_end: end,
          },
        ],
      },
      latest_invoice: null,
    });
    provider.objects.set(s.id, {
      ...s,
      status: 'complete',
      payment_status: 'no_payment_required',
      subscription: subId,
      amount_total: 0,
      currency: 'usd',
      total_details: { amount_tax: 0 },
    });
    await event('checkout.session.completed', s.id);
    const local = await db.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: subId },
    });
    expect(local.status).toBe('TRIALING');
    expect(local.currentPeriodEnd?.getTime()).toBe(end * 1000);
    expect(await db.payment.count({ where: { orderId: r.orderId } })).toBe(0);
  });
  it('recovers a refund submission after provider success followed by database rollback', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const p = await db.payment.findFirstOrThrow({ where: { orderId: r.orderId } }),
      item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    const operation = (await billing.refund(
      owner,
      w,
      p.id,
      {
        amount: 100,
        reason: 'Recovery',
        revokeAccess: false,
        items: [{ orderItemId: item.id, amount: 100, revokeAccess: false }],
      },
      randomUUID(),
      req,
    )) as { data: { operationId: string } };
    const realCall = provider.call.bind(provider);
    let crash = true;
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      const result = await realCall(...args);
      if (crash && args[0] === 'refunds' && args[1] === 'create') {
        crash = false;
        throw new Error('Simulated process loss after provider response');
      }
      return result;
    };
    try {
      await expect(worker.submitRefund(operation.data.operationId)).rejects.toThrow('Simulated');
      expect(
        (await db.refund.findUniqueOrThrow({ where: { id: operation.data.operationId } }))
          .stripeRefundId,
      ).toBeNull();
      const count = provider.keys.size;
      await worker.submitRefund(operation.data.operationId);
      expect(provider.keys.size).toBe(count);
      expect(
        (await db.refund.findUniqueOrThrow({ where: { id: operation.data.operationId } }))
          .stripeRefundId,
      ).toBeTruthy();
    } finally {
      provider.call = realCall;
    }
  });
  it('adopts a dashboard refund only after explicit authorized allocation and never submits another provider refund', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    const id = `re_dashboard_${randomUUID()}`;
    provider.objects.set(id, {
      id,
      status: 'succeeded',
      amount: 100,
      currency: 'usd',
      payment_intent: f.pi,
      charge: f.ch,
    });
    await expect(event('refund.created', id)).rejects.toThrow();
    const input = {
      amount: 100,
      reason: 'Audited dashboard refund',
      revokeAccess: false,
      items: [{ orderItemId: item.id, amount: 100, revokeAccess: false }],
    };
    await expect(billing.adoptRefund(buyer, w, id, input, randomUUID(), req)).rejects.toThrow();
    await billing.adoptRefund(owner, w, id, input, randomUUID(), req);
    const count = provider.calls.filter((c) => c === 'refunds.create').length;
    await event('refund.updated', id);
    expect(provider.calls.filter((c) => c === 'refunds.create')).toHaveLength(count);
    expect((await db.refund.findUniqueOrThrow({ where: { stripeRefundId: id } })).status).toBe(
      'SUCCEEDED',
    );
  });
  it('keeps per-currency ledgers separate', async () => {
    const eurOffer = await offer(1200);
    await db.price.update({ where: { id: eurOffer.price }, data: { currency: 'eur' } });
    const r = await session(payload(eurOffer.price));
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const totals = await db.payment.groupBy({
      by: ['currency'],
      where: { status: 'SUCCEEDED' },
      _sum: { amount: true },
    });
    expect(totals.map((t) => t.currency).sort()).toEqual(['eur', 'usd']);
  });
});
