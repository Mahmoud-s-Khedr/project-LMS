import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { AssessmentResultReader, EffectiveAssessmentResult } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { CohortCapacityService } from '../content/cohort-capacity.service';
import { ContentPagination } from '../content/content.support';
import { LearnerAccessPolicy } from './learner-access-policy';
import { EnrollmentGrantService } from './enrollment-grant.service';
import { LearningCompletionService } from './completion.service';
import { LearnerService } from './learner.service';
import { EnrollmentService } from './enrollment.service';
import { LearnerController, RosterController } from './learning.controller';
import { LearningCompletionConsumer } from './learning-completion.consumer';
import { etagOf, type LearningClock } from './learning.support';

const url = process.env.LEARNING_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;

interface Reply {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
}

integration('Learning on isolated PostgreSQL', () => {
  const dbName = `lms_learning_test_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool;
  let prisma: PrismaService;
  let app: INestApplication;
  let base = '';
  let now = new Date('2026-03-01T00:00:00.000Z');
  const clock: LearningClock = { now: () => new Date(now) };
  const setNow = (iso: string) => {
    now = new Date(iso);
  };
  let reader: AssessmentResultReader;
  let nextResult: EffectiveAssessmentResult = { finalized: false, passed: false, percent: null };
  let policy: LearnerAccessPolicy;
  let grants: EnrollmentGrantService;
  let completion: LearningCompletionService;
  let learner: LearnerService;
  let enrollments: EnrollmentService;
  let consumer: LearningCompletionConsumer;
  let outbox: OutboxService;

  let wsId: string;
  let otherWsId: string;
  let adminUser: { id: string };
  let instructor: { id: string };
  let ta: { id: string };
  let outsiderAdmin: { id: string };
  const users = new Map<string, { id: string; platformRole: 'STUDENT' }>();

  const richText = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
  };

  async function user(name = 'Learner') {
    const u = await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name } });
    users.set(u.id, { id: u.id, platformRole: 'STUDENT' });
    return u;
  }
  async function workspace(owner: { id: string }) {
    const w = await prisma.workspace.create({
      data: { kind: 'ACADEMY', name: 'W', slug: randomUUID(), ownerId: owner.id },
    });
    await prisma.workspaceMember.create({
      data: { workspaceId: w.id, userId: owner.id, role: 'ADMIN' },
    });
    return w.id;
  }
  async function course(
    over: Partial<{
      isFree: boolean;
      visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
      deliveryMode: 'SELF_PACED' | 'COHORT';
      status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
      workspaceId: string;
    }> = {},
  ) {
    const workspaceId = over.workspaceId ?? wsId;
    const c = await prisma.course.create({
      data: {
        workspaceId,
        slug: randomUUID(),
        title: 'Course',
        summary: 'Summary',
        status: over.status ?? 'PUBLISHED',
        visibility: over.visibility ?? 'PUBLIC',
        deliveryMode: over.deliveryMode ?? 'SELF_PACED',
        isFree: over.isFree ?? false,
        createdById: adminUser.id,
      },
    });
    const section = await prisma.section.create({
      data: { workspaceId, courseId: c.id, title: 'S1', position: 0 },
    });
    await prisma.courseStaff
      .create({
        data: {
          workspaceId,
          courseId: c.id,
          userId: instructor.id,
          role: 'INSTRUCTOR',
        },
      })
      .catch(() => undefined);
    return { courseId: c.id, sectionId: section.id, workspaceId };
  }
  let lessonPos = 0;
  async function lesson(
    c: { courseId: string; sectionId: string; workspaceId: string },
    over: Record<string, unknown> = {},
  ) {
    return prisma.lesson.create({
      data: {
        workspaceId: c.workspaceId,
        courseId: c.courseId,
        sectionId: c.sectionId,
        title: 'Lesson',
        type: 'TEXT',
        position: lessonPos++,
        body: richText,
        isRequired: true,
        isPublished: true,
        completionRule: 'ACKNOWLEDGE',
        ...over,
      },
    });
  }
  async function cohort(
    courseId: string,
    capacity: number | null,
    over: Record<string, unknown> = {},
  ) {
    return prisma.cohort.create({
      data: {
        workspaceId: wsId,
        courseId,
        name: 'Cohort',
        startsAt: new Date('2026-03-10T00:00:00Z'),
        capacity,
        isPublished: true,
        ...over,
      },
    });
  }
  async function paidItem(
    userId: string,
    courseId: string,
    cohortId: string | null,
    status = 'PAID',
  ) {
    const product = await prisma.product.create({
      data: { workspaceId: wsId, type: 'COURSE', status: 'ACTIVE', slug: randomUUID(), name: 'P' },
    });
    const price = await prisma.price.create({
      data: { workspaceId: wsId, productId: product.id, currency: 'usd', amount: 1000 },
    });
    const order = await prisma.order.create({
      data: {
        workspaceId: wsId,
        number: `T-${randomUUID().slice(0, 14)}`,
        status: status as 'PAID',
        currency: 'usd',
        subtotal: 1000,
        grandTotal: 1000,
        userId,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        workspaceId: wsId,
        orderId: order.id,
        productId: product.id,
        priceId: price.id,
        unitAmount: 1000,
        totalAmount: 1000,
        productSnapshot: {},
        entitlementSnapshot: {},
      },
    });
    await prisma.orderItemCourse.create({
      data: { workspaceId: wsId, orderItemId: item.id, courseId, cohortId },
    });
    return { order, item };
  }
  async function commerceGrant(
    userId: string,
    courseId: string,
    cohortId: string | null = null,
    expiresAt: Date | null = null,
  ) {
    const { item } = await paidItem(userId, courseId, cohortId);
    const input = {
      workspaceId: wsId,
      userId,
      courseId,
      source: 'ORDER_ITEM' as const,
      orderItemId: item.id,
      sourceKey: `order-item:${item.id}:course:${courseId}`,
      startsAt: new Date(now.getTime() - 1000),
      expiresAt,
      cohortId,
    };
    return { item, input, result: await grants.grantFromCommerce(input) };
  }
  async function http(
    method: string,
    path: string,
    who: { id: string } | null,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    const res = await fetch(`${base}/${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-user': who.id } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }
  const key = () => randomUUID();
  const ack = (eventId = randomUUID()) => ({ type: 'ACKNOWLEDGE', eventId });
  const events = (type: string, aggregateId?: string) =>
    prisma.outboxEvent.count({
      where: { type, ...(aggregateId ? { aggregateId } : {}) },
    });

  beforeAll(async () => {
    const base0 = new URL(url!);
    if (!['localhost', '127.0.0.1'].includes(base0.hostname) || base0.port !== '55432')
      throw new Error('Learning integration tests require the local LMS postgres on 55432');
    admin = new Pool({ connectionString: base0.toString() });
    await admin.query(`CREATE DATABASE "${dbName}"`);
    base0.pathname = `/${dbName}`;
    base0.search = '';
    const boot = new Pool({ connectionString: base0.toString() });
    try {
      const dir = resolve('prisma/migrations');
      for (const m of readdirSync(dir)
        .filter((d) => /^\d+_/.test(d))
        .sort())
        await boot.query(readFileSync(resolve(dir, m, 'migration.sql'), 'utf8'));
    } finally {
      await boot.end();
    }
    const config = new ConfigService({
      DATABASE_URL: base0.toString(),
      JWT_ACCESS_SECRET: 'learning-test-cursor-secret-at-least-32-chars',
    });
    prisma = new PrismaService(config as never);
    await prisma.$connect();
    outbox = new OutboxService(new SharedEventContracts());
    const audit = new AuditService(prisma, { nodeEnv: 'test' });
    const pagination = new ContentPagination(config);
    reader = { effectiveResult: async () => nextResult };
    policy = new LearnerAccessPolicy(prisma, clock);
    grants = new EnrollmentGrantService(prisma, new CohortCapacityService(), outbox, audit, clock);
    completion = new LearningCompletionService(prisma, outbox, audit, reader, clock);
    learner = new LearnerService(prisma, policy, completion, pagination, undefined, clock);
    enrollments = new EnrollmentService(
      prisma,
      new PolicyService(prisma),
      grants,
      audit,
      pagination,
      clock,
    );
    consumer = new LearningCompletionConsumer(completion);

    adminUser = await user('Admin');
    instructor = await user('Instructor');
    ta = await user('TA');
    outsiderAdmin = await user('Outsider');
    wsId = await workspace(adminUser);
    otherWsId = await workspace(outsiderAdmin);
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: wsId, userId: instructor.id, role: 'INSTRUCTOR' },
        { workspaceId: wsId, userId: ta.id, role: 'TEACHING_ASSISTANT' },
      ],
    });

    class TestGuard implements CanActivate {
      async canActivate(ctx: ExecutionContext) {
        const req = ctx
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; user?: unknown }>();
        const id = req.headers['x-test-user'];
        if (!id) throw new UnauthorizedException();
        const u = await prisma.user.findUniqueOrThrow({ where: { id } });
        req.user = {
          id: u.id,
          email: u.email,
          name: u.name,
          platformRole: u.platformRole,
          emailVerifiedAt: null,
          sessionId: randomUUID(),
          familyId: randomUUID(),
        };
        return true;
      }
    }
    const moduleRef = await Test.createTestingModule({
      controllers: [LearnerController, RosterController],
      providers: [
        { provide: LearnerService, useValue: learner },
        { provide: EnrollmentService, useValue: enrollments },
        { provide: APP_GUARD, useClass: TestGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    const addr = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${addr.port}`;
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60000);
  beforeEach(() => {
    setNow('2026-03-01T00:00:00.000Z');
    nextResult = { finalized: false, passed: false, percent: null };
  });

  describe('cohort seat contention (real transaction races)', () => {
    it('never oversells a cohort under concurrent manual enrollments', async () => {
      const c = await course({ deliveryMode: 'COHORT' });
      const k = await cohort(c.courseId, 3);
      const learners = await Promise.all(Array.from({ length: 9 }, () => user()));
      const results = await Promise.allSettled(
        learners.map((l) =>
          enrollments.manual(
            { id: adminUser.id, platformRole: 'STUDENT' },
            { workspaceId: wsId, courseId: c.courseId },
            {
              userId: l.id,
              cohortId: k.id,
              startsAt: now.toISOString(),
              expiresAt: null,
              reason: 'seat race',
            },
            key(),
          ),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(rejected).toHaveLength(6);
      for (const r of rejected)
        expect(JSON.stringify(r.reason.getResponse())).toContain('COHORT_FULL');
      expect(await prisma.enrollment.count({ where: { cohortId: k.id } })).toBe(3);
    }, 60000);

    it('counts a paid order reservation as an occupied seat for other writers', async () => {
      const c = await course({ deliveryMode: 'COHORT' });
      const k = await cohort(c.courseId, 1);
      const payer = await user();
      const other = await user();
      const { item } = await paidItem(payer.id, c.courseId, k.id);
      await expect(
        enrollments.manual(
          { id: adminUser.id, platformRole: 'STUDENT' },
          { workspaceId: wsId, courseId: c.courseId },
          {
            userId: other.id,
            cohortId: k.id,
            startsAt: now.toISOString(),
            expiresAt: null,
            reason: 'x',
          },
          key(),
        ),
      ).rejects.toMatchObject({ response: { code: 'COHORT_FULL' } });
      // The payer's own grant consumes (not double counts) its reserved seat.
      const res = await grants.grantFromCommerce({
        workspaceId: wsId,
        userId: payer.id,
        courseId: c.courseId,
        source: 'ORDER_ITEM',
        orderItemId: item.id,
        sourceKey: `order-item:${item.id}:course:${c.courseId}`,
        startsAt: now,
        expiresAt: null,
      });
      expect(res).toMatchObject({ created: true, enrollmentCreated: true });
    });

    it('moves a learner between cohorts only with a free seat and preserves progress', async () => {
      const c = await course({ deliveryMode: 'COHORT' });
      const l1 = await lesson(c);
      const a = await cohort(c.courseId, 2);
      const b = await cohort(c.courseId, 1);
      const [u1, u2, u3] = await Promise.all([user(), user(), user()]);
      const ens = [] as string[];
      for (const [u, k] of [
        [u1, a],
        [u2, a],
        [u3, b],
      ] as const) {
        const r = await commerceGrant(u.id, c.courseId, k.id);
        ens.push(r.result.enrollmentId);
      }
      await http('PUT', `me/enrollments/${ens[0]}/lessons/${l1.id}/progress`, u1, ack());
      const detail = await http(
        'GET',
        `workspaces/${wsId}/courses/${c.courseId}/enrollments/${ens[0]}`,
        instructor,
      );
      expect(detail.status).toBe(200);
      const tag = detail.headers.get('etag')!;
      const full = await http(
        'PATCH',
        `workspaces/${wsId}/courses/${c.courseId}/enrollments/${ens[0]}`,
        instructor,
        { cohortId: b.id, reason: 'move' },
        { 'if-match': tag },
      );
      expect(full.status).toBe(409);
      expect(full.body.code).toBe('COHORT_FULL');
      // free a seat in B, then the move succeeds and progress is untouched
      await prisma.enrollment.update({ where: { id: ens[2]! }, data: { status: 'REVOKED' } });
      const fresh = (
        await http(
          'GET',
          `workspaces/${wsId}/courses/${c.courseId}/enrollments/${ens[0]}`,
          instructor,
        )
      ).headers.get('etag')!;
      const moved = await http(
        'PATCH',
        `workspaces/${wsId}/courses/${c.courseId}/enrollments/${ens[0]}`,
        instructor,
        { cohortId: b.id, reason: 'move' },
        { 'if-match': fresh },
      );
      expect(moved.status).toBe(200);
      expect(moved.body.data.cohortId).toBe(b.id);
      expect(moved.body.data.completionPercent).toBe('100');
      expect(await prisma.lessonProgress.count({ where: { enrollmentId: ens[0]! } })).toBe(1);
    }, 60000);
  });

  describe('trusted grant commands (fulfillment)', () => {
    it('is idempotent under concurrent identical commands', async () => {
      const c = await course();
      const l = await user();
      const { item } = await paidItem(l.id, c.courseId, null);
      const input = {
        workspaceId: wsId,
        userId: l.id,
        courseId: c.courseId,
        source: 'ORDER_ITEM' as const,
        orderItemId: item.id,
        sourceKey: `order-item:${item.id}:course:${c.courseId}`,
        startsAt: now,
        expiresAt: null,
      };
      const out = await Promise.all(
        Array.from({ length: 10 }, () => grants.grantFromCommerce(input)),
      );
      expect(out.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(out.map((r) => r.grantId)).size).toBe(1);
      expect(out.filter((r) => r.enrollmentCreated)).toHaveLength(1);
      expect(await prisma.enrollment.count({ where: { courseId: c.courseId } })).toBe(1);
      expect(await prisma.enrollmentGrant.count({ where: { orderItemId: item.id } })).toBe(1);
      expect(await events('enrollment.granted.v1', out[0]!.enrollmentId)).toBe(1);
    }, 60000);

    it('bundles lock in a global order so crossing bundles and seats do not deadlock', async () => {
      const [a, b] = [
        await course({ deliveryMode: 'COHORT' }),
        await course({ deliveryMode: 'COHORT' }),
      ];
      const [ka, kb] = [await cohort(a.courseId, 20), await cohort(b.courseId, 20)];
      const l = await user();
      const items = await Promise.all(
        [a, b].map((c, i) => paidItem(l.id, c.courseId, [ka, kb][i]!.id)),
      );
      const mk = (c: typeof a, k: typeof ka, item: { id: string }) => ({
        workspaceId: wsId,
        userId: l.id,
        courseId: c.courseId,
        source: 'ORDER_ITEM' as const,
        orderItemId: item.id,
        sourceKey: `order-item:${item.id}:course:${c.courseId}`,
        startsAt: now,
        expiresAt: null,
        cohortId: k.id,
      });
      const forward = [mk(a, ka, items[0]!.item), mk(b, kb, items[1]!.item)];
      const out = await Promise.all([
        grants.grantManyFromCommerce(forward),
        grants.grantManyFromCommerce([...forward].reverse()),
        grants.grantManyFromCommerce(forward),
      ]);
      expect(out.flat().filter((r) => r.created)).toHaveLength(2);
      expect(await prisma.enrollment.count({ where: { userId: l.id } })).toBe(2);
    }, 60000);

    it('refuses fabricated provenance', async () => {
      const c = await course();
      const other = await course();
      const owner = await user();
      const thief = await user();
      const { item, order } = await paidItem(owner.id, c.courseId, null);
      const base = {
        workspaceId: wsId,
        courseId: c.courseId,
        source: 'ORDER_ITEM' as const,
        orderItemId: item.id,
        sourceKey: `k:${randomUUID()}`,
        startsAt: now,
        expiresAt: null,
      };
      await expect(grants.grantFromCommerce({ ...base, userId: thief.id })).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        grants.grantFromCommerce({ ...base, userId: owner.id, courseId: other.courseId }),
      ).rejects.toMatchObject({
        response: { code: 'COURSE_NOT_ENTITLED' },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'PENDING', paidAt: null },
      });
      await expect(grants.grantFromCommerce({ ...base, userId: owner.id })).rejects.toMatchObject({
        response: { code: 'ORDER_NOT_FULFILLABLE' },
      });
      await expect(
        grants.grantFromCommerce({
          ...base,
          userId: owner.id,
          source: 'SUBSCRIPTION',
          orderItemId: undefined,
          subscriptionId: randomUUID(),
        }),
      ).rejects.toBeDefined();
      expect(await prisma.enrollment.count({ where: { courseId: c.courseId } })).toBe(0);
    });

    it('keeps independent sources alive across an unrelated revocation and never un-revokes on replay', async () => {
      const c = await course();
      const l = await user();
      const { item, input, result } = await commerceGrant(l.id, c.courseId);
      await http(
        'POST',
        `workspaces/${wsId}/courses/${c.courseId}/enrollments/${result.enrollmentId}/grants`,
        instructor,
        {
          startsAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 86400000).toISOString(),
          reason: 'goodwill',
        },
        { 'idempotency-key': key() },
      );
      const before = await learner.get(l, result.enrollmentId);
      expect(before.grants.map((g) => g.source).sort()).toEqual(['MANUAL', 'ORDER_ITEM']);

      const first = await grants.revokeGrants(
        { workspaceId: wsId, orderItemId: item.id },
        'refund',
        undefined,
        now,
      );
      expect(first.revoked).toHaveLength(1);
      const again = await grants.revokeGrants(
        { workspaceId: wsId, orderItemId: item.id },
        'refund',
        undefined,
        now,
      );
      expect(again).toMatchObject({ revoked: [], unchanged: first.revoked });
      expect((await learner.get(l, result.enrollmentId)).access.allowed).toBe(true);

      // A replayed order.paid after the refund must not resurrect the revoked grant.
      const replay = await grants.grantFromCommerce(input);
      expect(replay.created).toBe(false);
      const revoked = await prisma.enrollmentGrant.findUniqueOrThrow({
        where: { id: result.grantId },
      });
      expect(revoked.revokedAt).not.toBeNull();

      setNow('2026-03-03T00:00:00.000Z');
      expect((await learner.get(l, result.enrollmentId)).access).toMatchObject({
        allowed: false,
        reason: 'ACCESS_EXPIRED',
      });
    });

    it('extends monotonically, never touches revoked grants, and survives concurrent renewals', async () => {
      const c = await course();
      const l = await user();
      const t1 = new Date('2026-04-01T00:00:00Z');
      const { result } = await (async () => {
        const { item } = await paidItem(l.id, c.courseId, null);
        const sub = {
          workspaceId: wsId,
          userId: l.id,
          courseId: c.courseId,
          source: 'ORDER_ITEM' as const,
          orderItemId: item.id,
          sourceKey: `order-item:${item.id}:course:${c.courseId}`,
          startsAt: now,
          expiresAt: t1,
        };
        return { item, result: await grants.grantFromCommerce(sub) };
      })();
      const sel = { workspaceId: wsId, grantId: result.grantId };
      expect((await grants.extendGrant(sel, new Date('2026-03-15T00:00:00Z'))).changed).toEqual([]);
      const dates = [5, 3, 9, 7].map((m) => new Date(`2026-0${m}-01T00:00:00Z`));
      await Promise.all(dates.map((d) => grants.extendGrant(sel, d)));
      const row = await prisma.enrollmentGrant.findUniqueOrThrow({ where: { id: result.grantId } });
      expect(row.expiresAt?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      await grants.revokeGrants(sel, 'cancel', undefined, now);
      expect((await grants.extendGrant(sel, new Date('2027-01-01T00:00:00Z'))).changed).toEqual([]);
    });
  });

  describe('subscription grants and transactional composition', () => {
    async function subscription(userId: string, courseIds: string[]) {
      const product = await prisma.product.create({
        data: {
          workspaceId: wsId,
          type: 'SUBSCRIPTION_PLAN',
          status: 'ACTIVE',
          slug: randomUUID(),
          name: 'Plan',
        },
      });
      const price = await prisma.price.create({
        data: {
          workspaceId: wsId,
          productId: product.id,
          currency: 'usd',
          amount: 500,
          interval: 'MONTH',
        },
      });
      const customer = await prisma.billingCustomer.create({
        data: { workspaceId: wsId, userId, stripeCustomerId: `cus_${randomUUID()}` },
      });
      return prisma.subscription.create({
        data: {
          workspaceId: wsId,
          userId,
          productId: product.id,
          priceId: price.id,
          customerId: customer.id,
          status: 'ACTIVE',
          stripeSubscriptionId: `sub_${randomUUID()}`,
          entitlementSnapshot: {
            courses: courseIds.map((courseId) => ({ courseId, cohortId: null })),
          },
        },
      });
    }

    it('lets a subscription grant outlive a refunded standalone purchase of the same course', async () => {
      const c = await course();
      const other = await course();
      const l = await user();
      const sub = await subscription(l.id, [c.courseId]);
      const periodEnd = new Date('2026-04-01T00:00:00Z');
      const base = {
        workspaceId: wsId,
        userId: l.id,
        courseId: c.courseId,
        source: 'SUBSCRIPTION' as const,
        subscriptionId: sub.id,
        sourceKey: `subscription:${sub.id}:course:${c.courseId}`,
        startsAt: now,
        expiresAt: periodEnd,
      };
      await expect(
        grants.grantFromCommerce({ ...base, courseId: other.courseId, sourceKey: 'x:1' }),
      ).rejects.toMatchObject({
        response: { code: 'COURSE_NOT_ENTITLED' },
      });
      await expect(grants.grantFromCommerce({ ...base, expiresAt: null })).rejects.toMatchObject({
        status: 400,
      });
      const first = await grants.grantFromCommerce(base);
      const replay = await grants.grantFromCommerce(base);
      expect(replay).toMatchObject({ created: false, grantId: first.grantId });

      const standalone = await commerceGrant(l.id, c.courseId);
      expect(standalone.result.enrollmentId).toBe(first.enrollmentId); // one enrollment, two sources
      await grants.revokeGrants(
        { workspaceId: wsId, orderItemId: standalone.item.id },
        'refund',
        undefined,
        now,
      );
      expect((await learner.get(l, first.enrollmentId)).access).toMatchObject({ allowed: true });

      // renewal extends the same source grant; past-due (no extension) lapses exactly at period end
      const renewed = await grants.extendGrant(
        { workspaceId: wsId, subscriptionId: sub.id },
        new Date('2026-05-01T00:00:00Z'),
      );
      expect(renewed.changed).toEqual([first.grantId]);
      setNow('2026-04-15T00:00:00Z');
      expect((await learner.get(l, first.enrollmentId)).access).toMatchObject({
        allowed: true,
        expiresAt: '2026-05-01T00:00:00.000Z',
      });
      // immediate cancellation terminates at the effective time
      await grants.revokeGrants(
        { workspaceId: wsId, subscriptionId: sub.id },
        'canceled',
        undefined,
        new Date('2026-04-20T00:00:00Z'),
      );
      setNow('2026-04-19T23:59:59.999Z');
      expect((await learner.get(l, first.enrollmentId)).access.allowed).toBe(true);
      setNow('2026-04-20T00:00:00Z');
      expect((await learner.get(l, first.enrollmentId)).access.allowed).toBe(false);
    });

    it('composes into the caller transaction: a rollback leaves no enrollment, grant or event', async () => {
      const c = await course();
      const l = await user();
      const { item } = await paidItem(l.id, c.courseId, null);
      const input = {
        workspaceId: wsId,
        userId: l.id,
        courseId: c.courseId,
        source: 'ORDER_ITEM' as const,
        orderItemId: item.id,
        sourceKey: `order-item:${item.id}:course:${c.courseId}`,
        startsAt: now,
        expiresAt: null,
      };
      await expect(
        prisma.$transaction(async (tx) => {
          await grants.grantFromCommerce(input, tx);
          throw new Error('receipt write failed');
        }),
      ).rejects.toThrow('receipt write failed');
      expect(await prisma.enrollment.count({ where: { courseId: c.courseId } })).toBe(0);
      expect(await prisma.enrollmentGrant.count({ where: { orderItemId: item.id } })).toBe(0);
      const ok = await prisma.$transaction((tx) => grants.grantFromCommerce(input, tx));
      expect(ok.created).toBe(true);
    });

    it('a fresh purchase reopens a staff-revoked enrollment but never a suspended one', async () => {
      const c = await course();
      const l = await user();
      const first = await commerceGrant(l.id, c.courseId);
      await prisma.enrollment.update({
        where: { id: first.result.enrollmentId },
        data: { status: 'REVOKED' },
      });
      await commerceGrant(l.id, c.courseId);
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: first.result.enrollmentId } }))
          .status,
      ).toBe('ACTIVE');
      await prisma.enrollment.update({
        where: { id: first.result.enrollmentId },
        data: { status: 'SUSPENDED' },
      });
      await commerceGrant(l.id, c.courseId);
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: first.result.enrollmentId } }))
          .status,
      ).toBe('SUSPENDED');
    });
  });

  describe('free enrollment', () => {
    it('requires an Idempotency-Key, replays it, and rejects a different body under the same key', async () => {
      const c = await course({ isFree: true });
      const l = await user();
      const noKey = await http('POST', `courses/${c.courseId}/enroll`, l, {});
      expect(noKey.status).toBe(400);
      const k = key();
      const one = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': k },
      );
      const two = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': k },
      );
      expect(one.status).toBe(201);
      expect(two.status).toBe(201);
      expect(two.body).toEqual(one.body);
      expect(one.body.data.grants).toHaveLength(1);
      const mismatch = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        { cohortId: randomUUID() },
        { 'idempotency-key': k },
      );
      expect(mismatch.status).toBe(409);
      expect(mismatch.body.code).toBe('IDEMPOTENCY_CONFLICT');
      // a fresh key still yields the same enrollment/grant: one row each
      const three = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': key() },
      );
      expect(three.body.data.id).toBe(one.body.data.id);
      expect(
        await prisma.enrollmentGrant.count({ where: { enrollmentId: one.body.data.id } }),
      ).toBe(1);
    });

    it('a concurrent duplicate of the same key is told to retry, never double-applied', async () => {
      const c = await course({ isFree: true });
      const l = await user();
      const k = key();
      const replies = await Promise.all(
        Array.from({ length: 6 }, () =>
          http('POST', `courses/${c.courseId}/enroll`, l, {}, { 'idempotency-key': k }),
        ),
      );
      for (const r of replies) {
        expect([201, 409]).toContain(r.status);
        if (r.status === 409) {
          expect(r.body.code).toBe('OPERATION_IN_PROGRESS');
          expect(r.headers.get('retry-after')).toBe('2');
        }
      }
      expect(replies.some((r) => r.status === 201)).toBe(true);
      expect(await prisma.enrollment.count({ where: { courseId: c.courseId } })).toBe(1);
    }, 60000);

    it('concurrent self-enrollment yields exactly one enrollment', async () => {
      const c = await course({ isFree: true });
      const l = await user();
      const replies = await Promise.all(
        Array.from({ length: 8 }, () =>
          http('POST', `courses/${c.courseId}/enroll`, l, {}, { 'idempotency-key': key() }),
        ),
      );
      expect(replies.every((r) => r.status === 201)).toBe(true);
      expect(await prisma.enrollment.count({ where: { courseId: c.courseId } })).toBe(1);
      expect(
        await prisma.enrollmentGrant.count({ where: { enrollment: { courseId: c.courseId } } }),
      ).toBe(1);
    }, 60000);

    it('does not enroll into paid, private or unpublished courses and enforces cohort mode', async () => {
      const l = await user();
      for (const c of [
        await course({ isFree: false }),
        await course({ isFree: true, visibility: 'PRIVATE' }),
        await course({ isFree: true, status: 'DRAFT' }),
      ]) {
        const r = await http(
          'POST',
          `courses/${c.courseId}/enroll`,
          l,
          {},
          { 'idempotency-key': key() },
        );
        expect(r.status).toBe(404);
      }
      const cc = await course({ isFree: true, deliveryMode: 'COHORT' });
      const k = await cohort(cc.courseId, 1);
      const noCohort = await http(
        'POST',
        `courses/${cc.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': key() },
      );
      expect(noCohort.status).toBe(422);
      const ok = await http(
        'POST',
        `courses/${cc.courseId}/enroll`,
        l,
        { cohortId: k.id },
        { 'idempotency-key': key() },
      );
      expect(ok.status).toBe(201);
      const full = await http(
        'POST',
        `courses/${cc.courseId}/enroll`,
        await user(),
        { cohortId: k.id },
        { 'idempotency-key': key() },
      );
      expect(full.status).toBe(409);
      expect(full.body.code).toBe('COHORT_FULL');
    });

    it('does not undo a staff revocation', async () => {
      const c = await course({ isFree: true });
      const l = await user();
      const one = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': key() },
      );
      await prisma.enrollment.update({
        where: { id: one.body.data.id },
        data: { status: 'REVOKED' },
      });
      const again = await http(
        'POST',
        `courses/${c.courseId}/enroll`,
        l,
        {},
        { 'idempotency-key': key() },
      );
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ENROLLMENT_REVOKED');
    });
  });

  describe('learner access, drip, prerequisites', () => {
    it('applies release windows, lesson prerequisites and exact boundaries', async () => {
      const c = await course();
      const l1 = await lesson(c);
      const l2 = await lesson(c);
      const l3 = await lesson(c, { releaseType: 'ENROLLMENT_OFFSET', releaseOffsetDays: 7 });
      await prisma.lessonPrerequisite.create({
        data: { workspaceId: wsId, courseId: c.courseId, lessonId: l2.id, requiredLessonId: l1.id },
      });
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const e = result.enrollmentId;
      const outline = await http('GET', `me/enrollments/${e}/outline`, l);
      const lessons = outline.body.data.sections[0].lessons as Array<{
        lessonId: string;
        access: Record<string, unknown>;
      }>;
      const by = new Map(lessons.map((x) => [x.lessonId, x.access]));
      expect(by.get(l1.id)).toMatchObject({ allowed: true });
      expect(by.get(l2.id)).toMatchObject({ allowed: false, reason: 'PREREQUISITE_UNMET' });
      expect(by.get(l3.id)).toMatchObject({ allowed: false, reason: 'NOT_RELEASED' });

      const locked = await http('GET', `me/enrollments/${e}/lessons/${l2.id}`, l);
      expect(locked.status).toBe(403);
      expect(locked.body.code).toBe('PREREQUISITE_UNMET');
      expect(locked.headers.get('cache-control')).toContain('no-store');
      const drip = await http('GET', `me/enrollments/${e}/lessons/${l3.id}`, l);
      expect(drip.status).toBe(403);
      expect(drip.body.code).toBe('CONTENT_LOCKED');
      expect(drip.body.details).toMatchObject({
        reason: 'NOT_RELEASED',
        unlockAt: expect.any(String),
      });
      const unlockAt = Date.parse(drip.body.details.unlockAt);

      // progress on a locked lesson is rejected too (server-side, not just UI)
      expect(
        (await http('PUT', `me/enrollments/${e}/lessons/${l2.id}/progress`, l, ack())).status,
      ).toBe(403);

      expect(
        (await http('PUT', `me/enrollments/${e}/lessons/${l1.id}/progress`, l, ack())).status,
      ).toBe(200);
      expect((await http('GET', `me/enrollments/${e}/lessons/${l2.id}`, l)).status).toBe(200);

      now = new Date(unlockAt - 1);
      expect((await http('GET', `me/enrollments/${e}/lessons/${l3.id}`, l)).status).toBe(403);
      now = new Date(unlockAt);
      const open = await http('GET', `me/enrollments/${e}/lessons/${l3.id}`, l);
      expect(open.status).toBe(200);
      expect(open.body.data.payload.type).toBe('TEXT');
    });

    it('enforces course prerequisites by minimum completion percent', async () => {
      const pre = await course();
      const target = await course();
      const t1 = await lesson(target);
      await prisma.coursePrerequisite.create({
        data: {
          workspaceId: wsId,
          courseId: target.courseId,
          requiredCourseId: pre.courseId,
          minimumPercent: 50,
        },
      });
      const l = await user();
      const preGrant = await commerceGrant(l.id, pre.courseId);
      const { result } = await commerceGrant(l.id, target.courseId);
      const url = `me/enrollments/${result.enrollmentId}/lessons/${t1.id}`;
      expect((await http('GET', url, l)).body.code).toBe('PREREQUISITE_UNMET');
      await prisma.enrollment.update({
        where: { id: preGrant.result.enrollmentId },
        data: { completionPercent: 49.99 },
      });
      expect((await http('GET', url, l)).status).toBe(403);
      await prisma.enrollment.update({
        where: { id: preGrant.result.enrollmentId },
        data: { completionPercent: 50 },
      });
      expect((await http('GET', url, l)).status).toBe(200);
    });

    it('closes at the exact grant expiry but keeps outline and history readable', async () => {
      const c = await course();
      const l1 = await lesson(c);
      const l = await user();
      const expires = new Date('2026-03-01T12:00:00.000Z');
      const { result } = await commerceGrant(l.id, c.courseId, null, expires);
      const e = result.enrollmentId;
      now = new Date(expires.getTime() - 1);
      expect((await http('GET', `me/enrollments/${e}/lessons/${l1.id}`, l)).status).toBe(200);
      now = new Date(expires.getTime());
      const denied = await http('GET', `me/enrollments/${e}/lessons/${l1.id}`, l);
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('ACCESS_EXPIRED');
      expect(
        (await http('PUT', `me/enrollments/${e}/lessons/${l1.id}/progress`, l, ack())).status,
      ).toBe(403);
      const outline = await http('GET', `me/enrollments/${e}/outline`, l);
      expect(outline.status).toBe(200);
      expect(outline.body.data.sections[0].lessons[0].access).toMatchObject({
        allowed: false,
        reason: 'ACCESS_EXPIRED',
      });
      expect((await http('GET', `me/enrollments/${e}/results`, l)).status).toBe(200);
      expect((await http('GET', `me/enrollments/${e}`, l)).body.data.access.allowed).toBe(false);
    });

    it('AccessPolicy binds to enrollment owner and tenant (cross-tenant and cross-user probes)', async () => {
      const c = await course();
      const l1 = await lesson(c);
      const a = await user();
      const b = await user();
      const { result } = await commerceGrant(a.id, c.courseId);
      const at = now.toISOString();
      const base = { workspaceId: wsId, enrollmentId: result.enrollmentId, at };
      expect(await policy.evaluate({ ...base, userId: a.id, lessonId: l1.id })).toMatchObject({
        allowed: true,
      });
      expect(await policy.evaluate({ ...base, userId: b.id, lessonId: l1.id })).toMatchObject({
        allowed: false,
        reason: 'ENROLLMENT_REQUIRED',
      });
      expect(
        await policy.evaluate({ ...base, workspaceId: otherWsId, userId: a.id }),
      ).toMatchObject({ allowed: false });
      expect(
        await policy.evaluate({ ...base, userId: a.id, lessonId: randomUUID() }),
      ).toMatchObject({ allowed: false, reason: 'CONTENT_LOCKED' });
      await prisma.workspace.update({ where: { id: wsId }, data: { status: 'SUSPENDED' } });
      try {
        expect(await policy.evaluate({ ...base, userId: a.id })).toMatchObject({
          reason: 'WORKSPACE_SUSPENDED',
        });
      } finally {
        await prisma.workspace.update({ where: { id: wsId }, data: { status: 'ACTIVE' } });
      }
    });

    it('is owner-only for learner endpoints', async () => {
      const c = await course();
      const l1 = await lesson(c);
      const a = await user();
      const b = await user();
      const { result } = await commerceGrant(a.id, c.courseId);
      expect(
        (await http('GET', `me/enrollments/${result.enrollmentId}/lessons/${l1.id}`, b)).status,
      ).toBe(403);
      for (const p of ['', '/outline', '/results'])
        expect((await http('GET', `me/enrollments/${result.enrollmentId}${p}`, b)).status).toBe(
          404,
        );
      expect(
        (
          await http(
            'PUT',
            `me/enrollments/${result.enrollmentId}/lessons/${l1.id}/progress`,
            b,
            ack(),
          )
        ).status,
      ).toBe(404);
      expect((await http('GET', `me/enrollments/${result.enrollmentId}`, instructor)).status).toBe(
        404,
      );
      expect((await http('GET', `me/enrollments/${result.enrollmentId}`, null)).status).toBe(401);
      const list = await http('GET', 'me/enrollments', b);
      expect(list.body.data).toEqual([]);
    });
  });

  describe('progress and completion', () => {
    it('completes once under concurrent and replayed events and rejects client-awarded state', async () => {
      const c = await course();
      const only = await lesson(c);
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const e = result.enrollmentId;
      const url = `me/enrollments/${e}/lessons/${only.id}/progress`;
      const sharedEvent = randomUUID();
      const replies = await Promise.all([
        ...Array.from({ length: 6 }, () => http('PUT', url, l, ack())),
        http('PUT', url, l, ack(sharedEvent)),
        http('PUT', url, l, ack(sharedEvent)),
      ]);
      expect(replies.every((r) => r.status === 200)).toBe(true);
      expect(await events('lesson.completed.v1', e)).toBe(1);
      expect(await events('course.completed.v1', e)).toBe(1);
      const row = await prisma.enrollment.findUniqueOrThrow({ where: { id: e } });
      expect(row.completedAt).not.toBeNull();
      expect(row.completionPercent.toString()).toBe('100');
      expect(row.policySnapshot).toMatchObject({ version: 1, requiredLessonIds: [only.id] });

      // optional lessons added later do not dilute completion; completedAt is retained
      await lesson(c, { isRequired: true });
      await http('PUT', url, l, ack());
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: e } })).completedAt?.getTime(),
      ).toBe(row.completedAt!.getTime());
      expect(await events('course.completed.v1', e)).toBe(1);

      for (const forged of [
        { ...ack(), passed: true },
        { ...ack(), grade: 100 },
        { ...ack(), completionPercent: '100' },
        { type: 'COMPLETE', eventId: randomUUID() },
      ])
        expect((await http('PUT', url, l, forged)).status).toBe(400);
    }, 60000);

    it('does not let acknowledgements complete assessment/attendance lessons', async () => {
      const c = await course();
      const quiz = await lesson(c, { type: 'QUIZ', body: {}, completionRule: 'ASSESSMENT_PASS' });
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const r = await http(
        'PUT',
        `me/enrollments/${result.enrollmentId}/lessons/${quiz.id}/progress`,
        l,
        ack(),
      );
      expect(r.status).toBe(200);
      expect(r.body.data.completedAt).toBeNull();
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: result.enrollmentId } }))
          .completedAt,
      ).toBeNull();
    });

    it('bounds playback credit by server time and completes at the watch threshold', async () => {
      const c = await course();
      const video = await lesson(c, {
        type: 'VIDEO',
        body: { durationSeconds: 100 },
        completionRule: 'WATCH_PERCENT',
        requiredWatchPercent: 90,
      });
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const e = result.enrollmentId;
      const beat = (pos: number, elapsed: number) =>
        http('PUT', `me/enrollments/${e}/lessons/${video.id}/progress`, l, {
          type: 'PLAYBACK',
          eventId: randomUUID(),
          positionSeconds: pos,
          elapsedSeconds: elapsed,
          occurredAt: now.toISOString(),
        });
      const first = await beat(120, 120); // forged: first beat credit capped at 30, position clamped to duration
      expect(first.body.data).toMatchObject({ watchedSeconds: 30, positionSeconds: 100 });
      const burst = await beat(100, 120); // immediate replay with a fresh eventId earns only jitter
      expect(burst.body.data.watchedSeconds).toBe(35);
      now = new Date(now.getTime() + 50_000);
      const honest = await beat(60, 50);
      expect(honest.body.data.watchedSeconds).toBe(85);
      expect(honest.body.data.completedAt).toBeNull();
      now = new Date(now.getTime() + 10_000);
      const done = await beat(95, 10);
      expect(done.body.data.watchedSeconds).toBe(95);
      expect(done.body.data.completedAt).not.toBeNull();
      expect(done.body.data.completionPercent).toBe('100'); // a completed lesson is 100%
      expect(await events('lesson.completed.v1', e)).toBe(1);
      // deduped event id: replay does not move watch time
      const dup = randomUUID();
      const send = () =>
        http('PUT', `me/enrollments/${e}/lessons/${video.id}/progress`, l, {
          type: 'PLAYBACK',
          eventId: dup,
          positionSeconds: 1,
          elapsedSeconds: 5,
          occurredAt: now.toISOString(),
        });
      now = new Date(now.getTime() + 10_000);
      const a1 = await send();
      const a2 = await send();
      expect(a2.body.data.watchedSeconds).toBe(a1.body.data.watchedSeconds);
      // playback on a non-video lesson is refused
      const text = await lesson(c);
      const bad = await http('PUT', `me/enrollments/${e}/lessons/${text.id}/progress`, l, {
        type: 'PLAYBACK',
        eventId: randomUUID(),
        positionSeconds: 1,
        elapsedSeconds: 5,
        occurredAt: now.toISOString(),
      });
      expect(bad.status).toBe(422);
    }, 60000);

    it('derives assessment-pass and attendance completion server-side and never reverts it', async () => {
      const c = await course();
      const quiz = await lesson(c, { type: 'QUIZ', body: {}, completionRule: 'ASSESSMENT_PASS' });
      const live = await lesson(c, {
        type: 'LIVE_SESSION',
        body: {},
        completionRule: 'ATTENDANCE',
      });
      await prisma.assessment.create({
        data: {
          workspaceId: wsId,
          courseId: c.courseId,
          lessonId: quiz.id,
          kind: 'QUIZ',
          title: 'Quiz',
        },
      });
      const session = await prisma.liveSession.create({
        data: {
          workspaceId: wsId,
          courseId: c.courseId,
          lessonId: live.id,
          title: 'Live',
          provider: 'zoom',
          joinUrl: 'https://example.test/j',
          startsAt: new Date('2026-03-02T00:00:00Z'),
          endsAt: new Date('2026-03-02T01:00:00Z'),
        },
      });
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const e = result.enrollmentId;

      await completion.reconcile(e); // nothing authoritative yet
      expect(await events('lesson.completed.v1', e)).toBe(0);

      nextResult = { finalized: true, passed: true, percent: '90' };
      // The consumer is the event-driven path; redelivery is a no-op.
      const evt = {
        type: 'assessment.result.changed.v1',
        workspaceId: wsId,
        payload: { assessmentId: randomUUID(), enrollmentId: e },
      };
      await prisma.$transaction((tx) => consumer.handle(evt as never, tx));
      await prisma.$transaction((tx) => consumer.handle(evt as never, tx));
      expect(await events('lesson.completed.v1', e)).toBe(1);
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: e } })).completedAt,
      ).toBeNull();

      await prisma.attendance.create({
        data: {
          workspaceId: wsId,
          courseId: c.courseId,
          sessionId: session.id,
          enrollmentId: e,
          status: 'ATTENDED',
          durationSeconds: 600,
        },
      });
      const out = await completion.reconcile(e);
      expect(out).toMatchObject({ lessonsCompleted: 1, courseCompleted: true });
      await completion.reconcile(e);
      expect(await events('course.completed.v1', e)).toBe(1);

      nextResult = { finalized: true, passed: false, percent: '10' }; // regrade
      await completion.reconcile(e);
      const quizProgress = await prisma.lessonProgress.findUniqueOrThrow({
        where: { enrollmentId_lessonId: { enrollmentId: e, lessonId: quiz.id } },
      });
      expect(quizProgress.completedAt).not.toBeNull();
      expect(
        (await prisma.enrollment.findUniqueOrThrow({ where: { id: e } })).completedAt,
      ).not.toBeNull();
    }, 60000);
  });

  describe('roster management, RBAC and tenancy', () => {
    it('limits roster endpoints to staff with manageLearners and the owning tenant', async () => {
      const c = await course();
      await prisma.courseStaff.create({
        data: {
          workspaceId: wsId,
          courseId: c.courseId,
          userId: ta.id,
          role: 'TEACHING_ASSISTANT',
        },
      });
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const path = `workspaces/${wsId}/courses/${c.courseId}/enrollments`;
      expect((await http('GET', path, instructor)).body.data).toHaveLength(1);
      expect((await http('GET', path, adminUser)).status).toBe(200);
      for (const who of [ta, outsiderAdmin, l])
        expect((await http('GET', path, who)).status).toBe(404);
      expect((await http('GET', `${path}/${result.enrollmentId}`, ta)).status).toBe(404);
      // wrong path parents: right enrollment, other course / other workspace
      const c2 = await course();
      expect(
        (
          await http(
            'GET',
            `workspaces/${wsId}/courses/${c2.courseId}/enrollments/${result.enrollmentId}`,
            instructor,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await http(
            'GET',
            `workspaces/${otherWsId}/courses/${c.courseId}/enrollments/${result.enrollmentId}`,
            outsiderAdmin,
          )
        ).status,
      ).toBe(404);
      // a TA flagged canManageLearners may manage
      await prisma.courseStaff.update({
        where: { courseId_userId: { courseId: c.courseId, userId: ta.id } },
        data: { canManageLearners: true },
      });
      expect((await http('GET', path, ta)).status).toBe(200);
    });

    it('manual enrollment: validates input, is idempotent and audited, and cannot forge commerce sources', async () => {
      const c = await course();
      const l = await user();
      const path = `workspaces/${wsId}/courses/${c.courseId}/enrollments/manual`;
      const body = {
        userId: l.id,
        startsAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 86400000).toISOString(),
        reason: 'scholarship',
      };
      expect((await http('POST', path, instructor, body)).status).toBe(400); // no key
      expect(
        (
          await http(
            'POST',
            path,
            instructor,
            { ...body, reason: '' },
            { 'idempotency-key': key() },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await http(
            'POST',
            path,
            instructor,
            { ...body, source: 'ORDER_ITEM' },
            { 'idempotency-key': key() },
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await http(
            'POST',
            path,
            instructor,
            {
              ...body,
              startsAt: new Date(now.getTime() - 86400000).toISOString(),
              expiresAt: new Date(now.getTime() - 1).toISOString(),
            },
            { 'idempotency-key': key() },
          )
        ).status,
      ).toBe(422);
      expect(
        (
          await http(
            'POST',
            path,
            instructor,
            { ...body, userId: randomUUID() },
            { 'idempotency-key': key() },
          )
        ).status,
      ).toBe(404);
      const k = key();
      const one = await http('POST', path, instructor, body, { 'idempotency-key': k });
      const two = await http('POST', path, instructor, body, { 'idempotency-key': k });
      expect(one.status).toBe(201);
      expect(two.body).toEqual(one.body);
      expect(one.body.data.grants).toMatchObject([{ source: 'MANUAL' }]);
      const audit = await prisma.auditLog.count({
        where: { action: 'enrollment.grant.manual', workspaceId: wsId, actorId: instructor.id },
      });
      expect(audit).toBeGreaterThanOrEqual(1);
      expect((await http('POST', path, ta, body, { 'idempotency-key': key() })).status).toBe(404);
      const staff = await http(
        'GET',
        `workspaces/${wsId}/courses/${c.courseId}/enrollments/${one.body.data.id}`,
        instructor,
      );
      expect(staff.body.data.grantProvenance[0]).toMatchObject({
        source: 'MANUAL',
        grantedById: instructor.id,
        reason: 'scholarship',
        orderItemId: null,
      });
    });

    it('requires If-Match for edits, detects staleness, and suspension overrides every grant', async () => {
      const c = await course();
      const l1 = await lesson(c);
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const url = `workspaces/${wsId}/courses/${c.courseId}/enrollments/${result.enrollmentId}`;
      const body = { status: 'SUSPENDED', reason: 'investigation' };
      expect((await http('PATCH', url, instructor, body)).status).toBe(428);
      const get = await http('GET', url, instructor);
      const etag = get.headers.get('etag')!;
      expect(etag).toBe(etagOf(get.body.data.updatedAt));
      expect((await http('PATCH', url, instructor, body, { 'if-match': '"1"' })).status).toBe(409);
      expect((await http('PATCH', url, instructor, body, { 'if-match': etag })).status).toBe(200);
      const denied = await http('GET', `me/enrollments/${result.enrollmentId}/lessons/${l1.id}`, l);
      expect(denied.status).toBe(403);
      expect(denied.body.details.reason).toBe('ENROLLMENT_SUSPENDED');
      expect(
        (
          await http(
            'PUT',
            `me/enrollments/${result.enrollmentId}/lessons/${l1.id}/progress`,
            l,
            ack(),
          )
        ).status,
      ).toBe(403);
      const e2 = (await http('GET', url, instructor)).headers.get('etag')!;
      expect(
        (
          await http(
            'PATCH',
            url,
            instructor,
            { status: 'ACTIVE', reason: 'cleared' },
            { 'if-match': e2 },
          )
        ).status,
      ).toBe(200);
      expect(
        (await http('GET', `me/enrollments/${result.enrollmentId}/lessons/${l1.id}`, l)).status,
      ).toBe(200);
      expect(
        (
          await http(
            'PATCH',
            url,
            instructor,
            { reason: 'x' },
            { 'if-match': (await http('GET', url, instructor)).headers.get('etag')! },
          )
        ).status,
      ).toBe(400);
    });

    it('restricts commerce-grant revocation to workspace admins and allows idempotent manual revocation', async () => {
      const c = await course();
      const l = await user();
      const { result } = await commerceGrant(l.id, c.courseId);
      const base = `workspaces/${wsId}/courses/${c.courseId}/enrollments/${result.enrollmentId}`;
      const manual = await http(
        'POST',
        `${base}/grants`,
        instructor,
        {
          startsAt: now.toISOString(),
          expiresAt: null,
          reason: 'trial',
        },
        { 'idempotency-key': key() },
      );
      expect(manual.status).toBe(201);
      const commerceRevoke = await http(
        'POST',
        `${base}/grants/${result.grantId}/revoke`,
        instructor,
        { reason: 'abuse' },
      );
      expect(commerceRevoke.status).toBe(404);
      expect(
        (await prisma.enrollmentGrant.findUniqueOrThrow({ where: { id: result.grantId } }))
          .revokedAt,
      ).toBeNull();
      const byAdmin = await http('POST', `${base}/grants/${result.grantId}/revoke`, adminUser, {
        reason: 'abuse',
      });
      expect(byAdmin.status).toBe(200);
      expect(byAdmin.body.data.revokedAt).not.toBeNull();
      const m1 = await http('POST', `${base}/grants/${manual.body.data.id}/revoke`, instructor, {
        reason: 'ended',
      });
      const m2 = await http('POST', `${base}/grants/${manual.body.data.id}/revoke`, instructor, {
        reason: 'ended',
      });
      expect(m1.status).toBe(200);
      expect(m2.body.data.revokedAt).toBe(m1.body.data.revokedAt);
      expect(
        (await http('POST', `${base}/grants/${manual.body.data.id}/revoke`, instructor, {})).status,
      ).toBe(400);
    });

    it('paginates the roster with signed cursors bound to the filters', async () => {
      const c = await course();
      for (let i = 0; i < 3; i++) await commerceGrant((await user()).id, c.courseId);
      const base = `workspaces/${wsId}/courses/${c.courseId}/enrollments`;
      const p1 = await http('GET', `${base}?limit=2`, instructor);
      expect(p1.body.data).toHaveLength(2);
      expect(p1.body.meta.hasMore).toBe(true);
      const p2 = await http('GET', `${base}?limit=2&cursor=${p1.body.meta.nextCursor}`, instructor);
      expect(p2.body.data).toHaveLength(1);
      const ids = [...p1.body.data, ...p2.body.data].map((r: { id: string }) => r.id);
      expect(new Set(ids).size).toBe(3);
      expect(
        (
          await http(
            'GET',
            `${base}?limit=2&status=SUSPENDED&cursor=${p1.body.meta.nextCursor}`,
            instructor,
          )
        ).status,
      ).toBe(400);
      expect((await http('GET', `${base}?source=MANUAL`, instructor)).body.data).toHaveLength(0);
      expect((await http('GET', `${base}?source=ORDER_ITEM`, instructor)).body.data).toHaveLength(
        3,
      );
    });
  });
});
