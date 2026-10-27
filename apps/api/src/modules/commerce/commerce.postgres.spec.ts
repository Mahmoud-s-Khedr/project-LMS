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
import {
  CheckoutService,
  setCheckoutIntentWindowForTests,
  CHECKOUT_INTENT_WINDOW_MS,
} from './checkout.service';
import { canonical, setIdempotencyLeaseForTests } from './commerce.core';
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
        livemode: false,
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
        { connectionString, options: `-c search_path=${schema}`, max: 10 },
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
  it('keeps the database responsive during 30 slow concurrent checkouts', async () => {
    const originalWorkspace = w;
    const originalCourse = course;
    const offers: { workspaceId: string; priceId: string }[] = [];
    try {
      for (let i = 0; i < 3; i++) {
        w = (
          await db.workspace.create({
            data: {
              ownerId: owner.id,
              kind: 'ACADEMY',
              name: 'Load test',
              slug: `load-${randomUUID()}`,
            },
          })
        ).id;
        await db.workspaceMember.create({
          data: { workspaceId: w, userId: owner.id, role: 'ADMIN' },
        });
        course = (
          await db.course.create({
            data: {
              workspaceId: w,
              createdById: owner.id,
              slug: `load-${randomUUID()}`,
              title: 'Load',
              summary: 'Test',
              status: 'PUBLISHED',
              publishedAt: new Date(),
              description: { type: 'doc', content: [] },
            },
          })
        ).id;
        offers.push({ workspaceId: w, priceId: (await offer()).price });
      }
    } finally {
      w = originalWorkspace;
      course = originalCourse;
    }
    const buyers = await Promise.all(Array.from({ length: 30 }, () => person()));
    const realCall = provider.call.bind(provider);
    let started = 0;
    let signal!: () => void;
    const saturated = new Promise<void>((resolve) => {
      signal = resolve;
    });
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (++started === 10) signal();
      await new Promise((resolve) => setTimeout(resolve, 500));
      return realCall(...args);
    };
    try {
      const start = performance.now();
      const checkouts = buyers.map((actor, i) => {
        const selected = offers[i % offers.length]!;
        return checkout.session(
          actor,
          selected.workspaceId,
          payload(selected.priceId),
          randomUUID(),
          req,
        );
      });
      const resultsPromise = Promise.allSettled(checkouts);
      await Promise.race([saturated, new Promise<void>((resolve) => setTimeout(resolve, 2000))]);
      const queryStart = performance.now();
      await db.$queryRaw`SELECT 1`;
      const queryMs = performance.now() - queryStart;
      const results = await resultsPromise;
      const totalMs = performance.now() - start;
      console.log(
        `Checkout load: ${totalMs.toFixed(0)} ms; unrelated query: ${queryMs.toFixed(0)} ms; failed: ${results.filter((r) => r.status === 'rejected').length}`,
      );
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      expect(queryMs).toBeLessThan(1000);
    } finally {
      provider.call = realCall;
    }
  }, 30000);
  it('creates Stripe prices without the admin lock and retries provider success safely', async () => {
    const p = await admin.createProduct(
      owner,
      w,
      {
        type: 'COURSE',
        name: 'Retry offer',
        slug: `retry-${randomUUID()}`,
        description: { type: 'doc', content: [] },
        accessDurationDays: 30,
        courseIds: [course],
      },
      req,
    );
    const input = {
      currency: 'usd',
      amount: 1234,
      interval: null,
      intervalCount: 1,
      trialDays: 0,
      isActive: true,
    } as const;
    const key = randomUUID();
    const realCall = provider.call.bind(provider);
    let calls = 0;
    let loseResponse = true;
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (args[0] === 'products' || args[0] === 'prices') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await client.query<{ acquired: boolean }>(
            'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
            [`commerce:${w}`],
          );
          expect(result.rows[0]?.acquired).toBe(true);
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        calls++;
      }
      const response = await realCall(...args);
      if (args[0] === 'prices' && loseResponse) {
        loseResponse = false;
        throw new Error('lost response');
      }
      return response;
    };
    try {
      await expect(admin.createPrice(owner, w, p.data.id, input, req, key)).rejects.toThrow(
        'lost response',
      );
      const pending = await db.price.findFirstOrThrow({ where: { productId: p.data.id } });
      expect(pending.isActive).toBe(false);
      const result = await admin.createPrice(owner, w, p.data.id, input, req, key);
      expect(result.data.id).toBe(pending.id);
      expect(result.data.isActive).toBe(true);
      expect(await db.price.count({ where: { productId: p.data.id } })).toBe(1);
      expect([...provider.keys.keys()].filter((k) => k === `price-${pending.id}`)).toHaveLength(1);
      expect(
        [...provider.objects.values()].filter((object) => object.unit_amount === 1234),
      ).toHaveLength(1);
      expect(calls).toBe(3);
      await expect(
        admin.createPrice(owner, w, p.data.id, { ...input, amount: 99 }, req, key),
      ).rejects.toThrow();
    } finally {
      provider.call = realCall;
    }
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
    const before = provider.calls.filter((call) => call === 'checkout.sessions.create').length;
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
    expect(
      provider.calls.filter((call) => call === 'checkout.sessions.create').length - before,
    ).toBe(1);
    await expect(session({ ...payload(), cancelPath: '/catalog' }, buyer, key)).rejects.toThrow(
      'Key already used',
    );
  });
  it('resumes a checkout after provider failure and after a lost provider response', async () => {
    for (const lostResponse of [false, true]) {
      const key = randomUUID();
      const realCall = provider.call.bind(provider);
      let failed = false;
      let firstParams = '';
      let stripeKey = '';
      provider.call = async (...args: Parameters<FakeProvider['call']>) => {
        if (args[0] === 'checkout.sessions' && args[1] === 'create') {
          if (!failed) {
            failed = true;
            firstParams = JSON.stringify(args[2]);
            stripeKey = args[3]!;
            if (lostResponse) await realCall(...args);
            throw new Error('simulated provider failure');
          }
          expect(JSON.stringify(args[2])).toBe(firstParams);
          expect(args[3]).toBe(stripeKey);
        }
        return realCall(...args);
      };
      try {
        await expect(session(payload(), buyer, key)).rejects.toThrow('simulated provider failure');
        const intent = await db.idempotencyRecord.findFirstOrThrow({
          where: { key, route: 'checkout' },
        });
        expect(intent.status).toBe('IN_PROGRESS');
        const pending = await db.order.findFirstOrThrow({
          where: { number: `LMS-${stripeKey.slice('checkout-'.length, 'checkout-'.length + 24)}` },
        });
        expect(pending.status).toBe('PENDING');
        setIdempotencyLeaseForTests(0);
        const result = await session(payload(), buyer, key);
        expect(result.orderId).toBe(pending.id);
        expect(
          (await db.idempotencyRecord.findUniqueOrThrow({ where: { id: intent.id } })).status,
        ).toBe('COMPLETED');
        expect(await db.order.count({ where: { id: pending.id } })).toBe(1);
      } finally {
        setIdempotencyLeaseForTests(30000);
        provider.call = realCall;
      }
    }
  });
  it('expires failed checkout reservations and allows a new checkout for the last seat and coupon', async () => {
    const c = await db.course.create({
      data: {
        workspaceId: w,
        createdById: owner.id,
        slug: `intent-${randomUUID()}`,
        title: 'Intent',
        summary: '',
        deliveryMode: 'COHORT',
        status: 'PUBLISHED',
      },
    });
    const o = await offer(1000, 'COURSE', [c.id]);
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
    const coupon = await admin.createCoupon(
      owner,
      w,
      {
        code: 'INTENT',
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
    const input = {
      ...payload(o.price),
      items: [{ priceId: o.price, cohorts: [{ courseId: c.id, cohortId: cohort.id }] }],
      couponCode: 'INTENT',
    };
    const capacityCheckout = new CheckoutService(
      db as PrismaService,
      provider,
      new OutboxService(new SharedEventContracts()),
      new AuditService(db as PrismaService, { nodeEnv: 'test' }),
      new CohortCapacityService(),
    );
    const realCall = provider.call.bind(provider);
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (args[0] === 'checkout.sessions' && args[1] === 'create')
        throw new Error('provider failed');
      return realCall(...args);
    };
    try {
      setCheckoutIntentWindowForTests(1000);
      await expect(capacityCheckout.session(buyer, w, input, randomUUID(), req)).rejects.toThrow(
        'provider failed',
      );
      const redemption = await db.couponRedemption.findFirstOrThrow({
        where: { couponId: coupon.data.id },
      });
      const orphan = await db.order.findUniqueOrThrow({ where: { id: redemption.orderId } });
      expect(redemption.reservedUntil).toEqual(orphan.expiresAt);
      await expect(capacityCheckout.session(buyer, w, input, randomUUID(), req)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await worker.reconcile();
      expect((await db.order.findUniqueOrThrow({ where: { id: orphan.id } })).status).toBe(
        'EXPIRED',
      );
      const released = await db.couponRedemption.findUniqueOrThrow({
        where: { id: redemption.id },
      });
      expect(released.releasedAt).not.toBeNull();
      expect(released.reservedUntil).toBeNull();
      provider.call = realCall;
      const result = (await capacityCheckout.session(buyer, w, input, randomUUID(), req)) as {
        data: CheckoutSession;
      };
      const order = await db.order.findUniqueOrThrow({ where: { id: result.data.orderId } });
      const reservation = await db.couponRedemption.findFirstOrThrow({
        where: { orderId: order.id },
      });
      const remote = provider.objects.get(order.stripeCheckoutSessionId!)!;
      expect(order.expiresAt).toEqual(new Date((remote.expires_at as number) * 1000));
      expect(reservation.reservedUntil).toEqual(order.expiresAt);
    } finally {
      setCheckoutIntentWindowForTests(CHECKOUT_INTENT_WINDOW_MS);
      provider.call = realCall;
    }
  });
  it('releases checkout and cancellation locks before provider calls and rejects a paid race', async () => {
    const actor = await person();
    const key = randomUUID();
    const realCall = provider.call.bind(provider);
    let orderId = '';
    const observed: string[] = [];
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (args[0] === 'customers' || args[0] === 'checkout.sessions') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const scope = { workspaceId: w, userId: actor.id, route: 'checkout', key };
          for (const name of [
            `idempotency:${canonical(scope)}`,
            ...(orderId ? [`order:${orderId}`] : []),
          ]) {
            const result = await client.query<{ acquired: boolean }>(
              'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
              [name],
            );
            expect(result.rows[0]?.acquired).toBe(true);
          }
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        observed.push(`${args[0]}.${args[1]}`);
      }
      if (args[0] === 'checkout.sessions' && args[1] === 'expire') {
        await db.order.update({
          where: { id: orderId },
          data: { status: 'PAID', paidAt: new Date() },
        });
      }
      return realCall(...args);
    };
    try {
      const created = await session(payload(), actor, key);
      orderId = created.orderId;
      await expect(billing.cancelOrder(actor, w, orderId, randomUUID(), req)).rejects.toThrow(
        'Order changed',
      );
      expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PAID');
      expect(observed).toEqual(
        expect.arrayContaining([
          'customers.create',
          'checkout.sessions.create',
          'checkout.sessions.retrieve',
          'checkout.sessions.expire',
        ]),
      );
    } finally {
      provider.call = realCall;
    }
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
    const realCall = provider.call.bind(provider);
    let checkedLookup = false;
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (args[0] === 'refunds' && args[1] === 'retrieve') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const lockKey of [`commerce-reconcile:${w}`, `payment:${p.id}`]) {
            const result = await client.query<{ acquired: boolean }>(
              'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
              [lockKey],
            );
            expect(result.rows[0]?.acquired).toBe(true);
          }
          checkedLookup = true;
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
      return realCall(...args);
    };
    try {
      await event('refund.updated', remote.id);
      expect(checkedLookup).toBe(true);
    } finally {
      provider.call = realCall;
    }
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
  it('does not regress a terminal refund when an older pending snapshot arrives', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    await event('checkout.session.completed', f.sessionId);
    const p = await db.payment.findFirstOrThrow({ where: { orderId: r.orderId } });
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: r.orderId } });
    const operation = (await billing.refund(
      owner,
      w,
      p.id,
      {
        amount: 100,
        reason: 'Stale refund snapshot',
        revokeAccess: false,
        items: [{ orderItemId: item.id, amount: 100, revokeAccess: false }],
      },
      randomUUID(),
      req,
    )) as { data: { operationId: string } };
    await worker.submitRefund(operation.data.operationId);
    const local = await db.refund.findUniqueOrThrow({ where: { id: operation.data.operationId } });
    const remote = provider.objects.get(local.stripeRefundId!)!;
    provider.objects.set(remote.id, { ...remote, status: 'failed' });
    await event('refund.updated', remote.id);
    provider.objects.set(remote.id, { ...remote, status: 'pending' });
    await event('refund.updated', remote.id);
    expect((await db.refund.findUniqueOrThrow({ where: { id: local.id } })).status).toBe('FAILED');
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
    const realCall = provider.call.bind(provider);
    const checked: string[] = [];
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (['subscriptions', 'invoices'].includes(args[0])) {
        checked.push(`${args[0]}.${args[1]}`);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const lockKey of [`commerce-reconcile:${w}`, `subscription:${subId}`]) {
            const result = await client.query<{ acquired: boolean }>(
              'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
              [lockKey],
            );
            expect(result.rows[0]?.acquired).toBe(true);
          }
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
      return realCall(...args);
    };
    try {
      await event('customer.subscription.updated', subId);
      await event('invoice.paid', invId);
      await worker.reconcile();
      expect(checked).toEqual(
        expect.arrayContaining(['subscriptions.retrieve', 'invoices.list', 'invoices.retrieve']),
      );
      const stale = await worker.subscriptionSnapshot(subId);
      await event('customer.subscription.updated', subId);
      await expect(db.$transaction((tx) => worker.subscription(tx, subId, stale))).rejects.toThrow(
        'stale',
      );
      expect(await db.payment.count({ where: { stripeInvoiceId: invId } })).toBe(1);
    } finally {
      provider.call = realCall;
    }
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
    const realChangeCall = provider.call.bind(provider);
    let observedChange = false;
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (args[0] === 'subscriptions' && args[1] === 'update') {
        observedChange = true;
        const result = await pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction' AND pid <> pg_backend_pid()",
        );
        expect(Number(result.rows[0]!.count)).toBe(0);
      }
      return realChangeCall(...args);
    };
    try {
      await billing.changeSubscription(buyer, local.id, randomUUID(), req, {});
      expect(observedChange).toBe(true);
    } finally {
      provider.call = realChangeCall;
    }
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
  it('fetches one-time checkout snapshots without holding reconciliation locks', async () => {
    const r = await session();
    const f = await capture(r.orderId);
    const realCall = provider.call.bind(provider);
    const lookups: string[] = [];
    provider.call = async (...args: Parameters<FakeProvider['call']>) => {
      if (
        args[1] === 'retrieve' &&
        ['checkout.sessions', 'paymentIntents', 'charges'].includes(args[0])
      ) {
        lookups.push(args[0]);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const lockKey of [`commerce-reconcile:${w}`, `order:${r.orderId}`]) {
            const result = await client.query<{ acquired: boolean }>(
              'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
              [lockKey],
            );
            expect(result.rows[0]?.acquired).toBe(true);
          }
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
      return realCall(...args);
    };
    try {
      await event('checkout.session.completed', f.sessionId);
      expect(lookups).toEqual(
        expect.arrayContaining(['checkout.sessions', 'paymentIntents', 'charges']),
      );
    } finally {
      provider.call = realCall;
    }
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
      if (args[0] === 'refunds' && args[1] === 'create') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const lockKey of [`commerce-reconcile:${w}`, `payment:${p.id}`]) {
            const result = await client.query<{ acquired: boolean }>(
              'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired',
              [lockKey],
            );
            expect(result.rows[0]?.acquired).toBe(true);
          }
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
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
