import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { EventConsumerRegistry } from '../events/consumer-registry';
import { EventConsumerRunnerService } from '../events/event-consumer-runner.service';
import { resolveEventsOptions } from '../events/events.options';
import { CohortCapacityService } from '../content/cohort-capacity.service';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { EnrollmentGrantService } from '../learning/enrollment-grant.service';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentConsumer } from './fulfillment.consumer';
import { FulfillmentReconcileTask } from './fulfillment-reconcile.task';

const suite = process.env.FULFILLMENT_TEST_DATABASE_URL ? describe : describe.skip;
suite('fulfillment PostgreSQL security, concurrency and provenance', () => {
  const schema = `fulfillment_test_${randomUUID().replaceAll('-', '')}`;
  let pool: Pool,
    db: PrismaClient,
    service: FulfillmentService,
    grants: EnrollmentGrantService,
    runner: EventConsumerRunnerService,
    outbox: OutboxService,
    task: FulfillmentReconcileTask,
    capacity: CohortCapacityService;
  let w: string, user: string, course: string, product: string, price: string, customer: string;
  const now = new Date();
  const start = new Date(now.getTime() - 86400000);
  const end = new Date(now.getTime() + 86400000);
  beforeAll(async () => {
    const connectionString = process.env.FULFILLMENT_TEST_DATABASE_URL!;
    const url = new URL(connectionString);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432')
      throw new Error('Use local LMS PostgreSQL on 55432');
    pool = new Pool({ connectionString, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}"`);
    const root = join(__dirname, '../../../prisma/migrations');
    for (const dir of readdirSync(root)
      .filter((p) => /^\d/.test(p))
      .sort())
      await pool.query(
        readFileSync(join(root, dir, 'migration.sql'), 'utf8').replace(
          'CREATE SCHEMA IF NOT EXISTS "public";',
          '',
        ),
      );
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}`, max: 12 },
        { schema },
      ),
    });
    const prisma = db as PrismaService;
    const contracts = new SharedEventContracts();
    outbox = new OutboxService(contracts);
    capacity = new CohortCapacityService();
    grants = new EnrollmentGrantService(
      prisma,
      capacity,
      outbox,
      new AuditService(prisma, { nodeEnv: 'test' }),
    );
    service = new FulfillmentService(grants);
    const consumer = new FulfillmentConsumer(service);
    runner = new EventConsumerRunnerService(
      prisma,
      contracts,
      new EventConsumerRegistry([consumer], contracts),
      resolveEventsOptions({
        autoStart: false,
        queuePrefix: `fulfill_${randomUUID().slice(0, 16)}`,
      }),
    );
    task = new FulfillmentReconcileTask(prisma, service);
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });
  beforeEach(async () => {
    user = (
      await db.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Buyer' } })
    ).id;
    w = (
      await db.workspace.create({
        data: { ownerId: user, slug: randomUUID(), name: 'Shop', kind: 'PERSONAL' },
      })
    ).id;
    course = (
      await db.course.create({
        data: {
          workspaceId: w,
          createdById: user,
          slug: randomUUID(),
          title: 'Course',
          summary: 'Test',
          status: 'PUBLISHED',
        },
      })
    ).id;
    product = (
      await db.product.create({
        data: { workspaceId: w, slug: randomUUID(), name: 'Offer', type: 'COURSE' },
      })
    ).id;
    price = (
      await db.price.create({
        data: { workspaceId: w, productId: product, currency: 'usd', amount: 1000 },
      })
    ).id;
    customer = (
      await db.billingCustomer.create({
        data: { workspaceId: w, userId: user, stripeCustomerId: `fixture:${randomUUID()}` },
      })
    ).id;
  });
  const snapshot = (ids = [course], cohortId: string | null = null) => ({
    courses: ids.map((courseId) => ({ courseId, cohortId, accessDurationDays: 30 })),
  });
  async function purchase(ids = [course], cohortId: string | null = null) {
    return db.order.create({
      data: {
        workspaceId: w,
        userId: user,
        number: randomUUID(),
        status: 'PAID',
        currency: 'usd',
        subtotal: 1000,
        grandTotal: 1000,
        paidAt: start,
        orderItems: {
          create: {
            productId: product,
            priceId: price,
            productSnapshot: { type: ids.length > 1 ? 'BUNDLE' : 'COURSE' },
            entitlementSnapshot: snapshot(ids, cohortId),
            unitAmount: 1000,
            totalAmount: 1000,
            orderItemCourses: {
              create: ids.map((courseId) => ({ courseId, cohortId, accessDurationDays: 30 })),
            },
          },
        },
      },
      include: { orderItems: true },
    });
  }
  async function subscription() {
    return db.subscription.create({
      data: {
        workspaceId: w,
        userId: user,
        customerId: customer,
        productId: product,
        priceId: price,
        stripeSubscriptionId: `fixture:${randomUUID()}`,
        status: 'ACTIVE',
        currentPeriodStart: start,
        currentPeriodEnd: end,
        entitlementSnapshot: snapshot(),
      },
    });
  }
  async function paidEvent(id: string, workspaceId = w) {
    return db.$transaction((tx) =>
      outbox.append(tx, {
        workspaceId,
        aggregateType: 'Order',
        aggregateId: id,
        type: 'order.paid.v1',
        payload: { orderId: id },
      }),
    );
  }
  const deliver = (id: string) => runner.deliver({ eventId: id, consumer: 'fulfillment.billing' });
  const order = (id: string) =>
    db.$transaction((tx) => service.order(tx, w, id, 'test'), { timeout: 30000 });
  const sub = (id: string) =>
    db.$transaction((tx) => service.subscription(tx, w, id, 'test'), { timeout: 30000 });
  async function refund(
    orderId: string | null,
    itemId: string | null,
    subscriptionId: string | null = null,
    revokeAccess = true,
  ) {
    const payment = await db.payment.create({
      data: {
        workspaceId: w,
        orderId,
        subscriptionId,
        currency: 'usd',
        amount: 1000,
        status: 'SUCCEEDED',
        paidAt: start,
      },
    });
    return db.refund.create({
      data: {
        workspaceId: w,
        paymentId: payment.id,
        requestedById: user,
        amount: 500,
        currency: 'usd',
        status: 'SUCCEEDED',
        completedAt: now,
        reason: 'Test refund',
        revokeAccess,
        ...(itemId
          ? { refundItems: { create: { orderItemId: itemId, amount: 500, revokeAccess } } }
          : {}),
      },
    });
  }
  it('racing receipts and different paid events create one source grant', async () => {
    const o = await purchase(),
      e = await paidEvent(o.id);
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => deliver(e.id)));
    expect(outcomes.filter((v) => v === 'processed')).toHaveLength(1);
    await deliver((await paidEvent(o.id)).id);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(1);
    const g = await db.enrollmentGrant.findFirstOrThrow({ where: { workspaceId: w } });
    expect(g.startsAt).toEqual(start);
    expect(g.expiresAt?.getTime()).toBe(start.getTime() + 30 * 86400000);
    expect(await db.eventReceipt.count({ where: { eventId: e.id } })).toBe(1);
  });
  it('rejects cross-tenant events with no receipt or grant', async () => {
    const o = await purchase();
    const foreign = await db.workspace.create({
      data: { ownerId: user, slug: randomUUID(), name: 'Foreign', kind: 'PERSONAL' },
    });
    const e = await paidEvent(o.id, foreign.id);
    await expect(deliver(e.id)).rejects.toThrow('workspace');
    expect(await db.eventReceipt.count({ where: { eventId: e.id } })).toBe(0);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(0);
  });
  it('standalone refund leaves subscription and overlapping bundle access intact under disorder', async () => {
    const a = await purchase(),
      b = await purchase(),
      s = await subscription();
    await order(a.id);
    await order(b.id);
    await sub(s.id);
    const r = await refund(a.id, a.orderItems[0]!.id);
    await db.order.update({ where: { id: a.id }, data: { status: 'PARTIALLY_REFUNDED' } });
    const event = await db.$transaction((tx) =>
      outbox.append(tx, {
        workspaceId: w,
        aggregateType: 'Refund',
        aggregateId: r.id,
        type: 'refund.succeeded.v1',
        payload: { refundId: r.id },
      }),
    );
    await Promise.all([deliver(event.id), deliver((await paidEvent(a.id)).id)]);
    const grants = await db.enrollmentGrant.findMany({ where: { workspaceId: w } });
    expect(grants.filter((g) => g.revokedAt)).toHaveLength(1);
    expect(grants.filter((g) => !g.revokedAt)).toHaveLength(2);
    const enrollment = await db.enrollment.findFirstOrThrow({ where: { workspaceId: w } });
    expect(
      await new LearnerAccessPolicy(db as PrismaService).evaluate({
        workspaceId: w,
        enrollmentId: enrollment.id,
        userId: user,
        at: now.toISOString(),
      }),
    ).toMatchObject({ allowed: true });
    expect(await db.enrollment.count({ where: { workspaceId: w } })).toBe(1);
  });
  it('refund delivered before paid never creates the revoked source', async () => {
    const o = await purchase();
    await refund(o.id, o.orderItems[0]!.id);
    await db.order.update({ where: { id: o.id }, data: { status: 'REFUNDED' } });
    await deliver((await paidEvent(o.id)).id);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(0);
  });
  it('partial non-revoking refunds preserve source access', async () => {
    const o = await purchase();
    await refund(o.id, o.orderItems[0]!.id, null, false);
    await db.order.update({ where: { id: o.id }, data: { status: 'PARTIALLY_REFUNDED' } });
    await order(o.id);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, revokedAt: null } })).toBe(1);
  });
  it('paid-period cancellation and renewal failure retain confirmed bounds; renewal extends the same source', async () => {
    const s = await subscription();
    await sub(s.id);
    await db.subscription.update({
      where: { id: s.id },
      data: { status: 'PAST_DUE', cancelAtPeriodEnd: true },
    });
    await sub(s.id);
    const g = await db.enrollmentGrant.findFirstOrThrow({ where: { workspaceId: w } });
    expect(g.expiresAt).toEqual(end);
    expect(g.revokedAt).toBeNull();
    const policy = new LearnerAccessPolicy(db as PrismaService);
    expect(
      await policy.evaluate({
        workspaceId: w,
        enrollmentId: g.enrollmentId,
        userId: user,
        at: new Date(end.getTime() - 1).toISOString(),
      }),
    ).toMatchObject({ allowed: true });
    expect(
      await policy.evaluate({
        workspaceId: w,
        enrollmentId: g.enrollmentId,
        userId: user,
        at: end.toISOString(),
      }),
    ).toMatchObject({ allowed: false, reason: 'ACCESS_EXPIRED' });
    const later = new Date(end.getTime() + 86400000);
    await db.subscription.update({
      where: { id: s.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: end,
        currentPeriodEnd: later,
        cancelAtPeriodEnd: false,
      },
    });
    await Promise.all([sub(s.id), sub(s.id)]);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(1);
    expect((await db.enrollmentGrant.findUniqueOrThrow({ where: { id: g.id } })).expiresAt).toEqual(
      later,
    );
  });
  it('immediate termination caps existing grants and stale events cannot restore them', async () => {
    const s = await subscription();
    await sub(s.id);
    await db.subscription.update({
      where: { id: s.id },
      data: { status: 'CANCELED', endedAt: now },
    });
    await sub(s.id);
    await sub(s.id);
    expect(
      (await db.enrollmentGrant.findFirstOrThrow({ where: { workspaceId: w } })).revokedAt,
    ).toEqual(now);
  });
  it('subscription refund revokes only its source and a later paid period can grant again', async () => {
    const s = await subscription(),
      o = await purchase();
    await sub(s.id);
    await order(o.id);
    const r = await refund(null, null, s.id);
    await db.$transaction((tx) => service.refund(tx, w, r.id, 'test'));
    await sub(s.id);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, revokedAt: null } })).toBe(1);
    await db.subscription.update({
      where: { id: s.id },
      data: { currentPeriodStart: end, currentPeriodEnd: new Date(end.getTime() + 86400000) },
    });
    await sub(s.id);
    await sub(s.id);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, revokedAt: null } })).toBe(2);
  });
  it('reconciliation repairs missed grants without changing progress or reopening staff revocation', async () => {
    const o = await purchase();
    await task.handle();
    const e = await db.enrollment.findFirstOrThrow({ where: { workspaceId: w } });
    await db.enrollment.update({
      where: { id: e.id },
      data: { completedAt: start, status: 'REVOKED' },
    });
    await task.handle();
    await order(o.id);
    const after = await db.enrollment.findUniqueOrThrow({ where: { id: e.id } });
    expect(after.completedAt).toEqual(start);
    expect(after.status).toBe('REVOKED');
  });
  it('snapshot corruption rolls back the receipt and all bundle grants', async () => {
    const o = await purchase();
    await db.orderItem.update({
      where: { id: o.orderItems[0]!.id },
      data: { entitlementSnapshot: snapshot([randomUUID()]) },
    });
    const event = await paidEvent(o.id);
    await expect(deliver(event.id)).rejects.toThrow('snapshot');
    expect(await db.eventReceipt.count({ where: { eventId: event.id } })).toBe(0);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(0);
  });
  it('cohort reservation converts exactly once under capacity lock; redeemed coupon stays unchanged', async () => {
    await db.course.update({ where: { id: course }, data: { deliveryMode: 'COHORT' } });
    const cohort = await db.cohort.create({
      data: {
        workspaceId: w,
        courseId: course,
        name: 'Seats',
        capacity: 1,
        startsAt: now,
        isPublished: true,
      },
    });
    const o = await purchase([course], cohort.id);
    const coupon = await db.coupon.create({
      data: {
        workspaceId: w,
        code: randomUUID().toUpperCase(),
        kind: 'FIXED',
        amountOff: 1,
        currency: 'usd',
        validFrom: start,
      },
    });
    const redeemed = await db.couponRedemption.create({
      data: { workspaceId: w, couponId: coupon.id, userId: user, orderId: o.id, redeemedAt: start },
    });
    await Promise.all([order(o.id), order(o.id)]);
    await db.$transaction(async (tx) => {
      expect(
        await capacity.occupied(tx, { workspaceId: w, courseId: course }, cohort.id, now),
      ).toBe(1);
    });
    expect(await db.couponRedemption.findUnique({ where: { id: redeemed.id } })).toEqual(redeemed);
  });
  it('overlapping bundles share enrollment while keeping independent per-course source grants', async () => {
    const courses = await Promise.all(
      [1, 2].map(() =>
        db.course.create({
          data: {
            workspaceId: w,
            createdById: user,
            slug: randomUUID(),
            title: 'Bundle course',
            summary: 'Test',
            status: 'PUBLISHED',
          },
        }),
      ),
    );
    const a = await purchase([course, courses[0]!.id]);
    const b = await purchase([courses[1]!.id, course]);
    await Promise.all([order(a.id), order(b.id)]);
    expect(await db.enrollment.count({ where: { workspaceId: w } })).toBe(3);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(4);
    const r = await refund(a.id, a.orderItems[0]!.id);
    await db.$transaction((tx) => service.refund(tx, w, r.id, 'test'));
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, revokedAt: null } })).toBe(2);
    expect(
      await db.enrollmentGrant.count({
        where: { workspaceId: w, revokedAt: null, enrollment: { courseId: course } },
      }),
    ).toBe(1);
  });
  it('initial plan refunds use item revoke decisions even when top-level flag differs', async () => {
    const o = await purchase();
    await db.orderItem.update({
      where: { id: o.orderItems[0]!.id },
      data: { productSnapshot: { type: 'SUBSCRIPTION_PLAN' } },
    });
    const s = await subscription();
    await db.subscription.update({ where: { id: s.id }, data: { initialOrderId: o.id } });
    await order(o.id);
    await sub(s.id);
    expect(
      await db.enrollmentGrant.count({ where: { workspaceId: w, source: 'ORDER_ITEM' } }),
    ).toBe(0);
    const r = await refund(o.id, o.orderItems[0]!.id, s.id, false);
    await db.refundItem.updateMany({ where: { refundId: r.id }, data: { revokeAccess: true } });
    await db.$transaction((tx) => service.refund(tx, w, r.id, 'test'));
    expect(
      await db.enrollmentGrant.count({
        where: { workspaceId: w, source: 'SUBSCRIPTION', revokedAt: null },
      }),
    ).toBe(0);
  });
  it('extends a missed subscription expiry without replacing enrollment or completion', async () => {
    const s = await subscription();
    await sub(s.id);
    const e = await db.enrollment.findFirstOrThrow({ where: { workspaceId: w } });
    await db.enrollment.update({ where: { id: e.id }, data: { completedAt: start } });
    const later = new Date(end.getTime() + 86400000);
    await db.subscription.update({ where: { id: s.id }, data: { currentPeriodEnd: later } });
    await task.handle();
    expect(
      (await db.enrollmentGrant.findFirstOrThrow({ where: { workspaceId: w } })).expiresAt,
    ).toEqual(later);
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: e.id } })).completedAt).toEqual(
      start,
    );
  });
  it('current product edits cannot add courses or change paid duration', async () => {
    const o = await purchase();
    await db.product.update({
      where: { id: product },
      data: { accessDurationDays: 1, type: 'BUNDLE' },
    });
    await order(o.id);
    const g = await db.enrollmentGrant.findFirstOrThrow({ where: { workspaceId: w } });
    expect(g.expiresAt?.getTime()).toBe(start.getTime() + 30 * 86400000);
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w } })).toBe(1);
  });
  it('unconfirmed refund is harmless even if a trigger exists', async () => {
    const o = await purchase();
    await order(o.id);
    const r = await refund(o.id, o.orderItems[0]!.id);
    await db.refund.update({ where: { id: r.id }, data: { status: 'PENDING', completedAt: null } });
    await db.$transaction((tx) => service.refund(tx, w, r.id, 'test'));
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, revokedAt: null } })).toBe(1);
  });
  it('a late paid event cannot restore access that a succeeded refund revoked', async () => {
    const o = await purchase();
    const itemId = o.orderItems[0]!.id;
    await refund(o.id, itemId, null, true);
    await db.order.update({ where: { id: o.id }, data: { status: 'REFUNDED' } });
    await deliver((await paidEvent(o.id)).id);
    expect(
      await db.enrollmentGrant.count({
        where: { workspaceId: w, orderItemId: itemId, revokedAt: null },
      }),
    ).toBe(0);
    const line = await db.orderItemCourse.findFirstOrThrow({ where: { orderItemId: itemId } });
    await expect(
      db.$transaction((tx) =>
        grants.grantFromCommerce(
          {
            workspaceId: w,
            userId: o.userId,
            courseId: line.courseId,
            source: 'ORDER_ITEM',
            orderItemId: itemId,
            sourceKey: `order-item:${itemId}:course:${line.courseId}`,
            startsAt: start,
            expiresAt: null,
          },
          tx,
        ),
      ),
    ).rejects.toThrow();
    expect(await db.enrollmentGrant.count({ where: { workspaceId: w, orderItemId: itemId } })).toBe(
      0,
    );
  });
  it('fulfills delayed paid delivery after a fully refunded access-preserving order', async () => {
    const o = await purchase();
    await refund(o.id, o.orderItems[0]!.id, null, false);
    await db.order.update({ where: { id: o.id }, data: { status: 'REFUNDED' } });
    const e = await paidEvent(o.id);
    await deliver(e.id);
    await deliver(e.id);
    expect(await db.eventReceipt.count({ where: { eventId: e.id } })).toBe(1);
    expect(
      await db.enrollmentGrant.count({
        where: { workspaceId: w, orderItemId: o.orderItems[0]!.id, revokedAt: null },
      }),
    ).toBe(1);
  });
});
