import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  UnauthorizedException,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import * as c from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MediaStorageService } from '../media/media-storage.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsReportsService } from './analytics-reports.service';
import { AnalyticsExportTask } from './analytics-export.task';
import type { Actor } from './analytics.support';
const integration = process.env.ANALYTICS_TEST_DATABASE_URL ? describe : describe.skip;
integration('analytics isolated PostgreSQL security and reconciliation', () => {
  const database = `lms_analytics_test_${randomUUID().replaceAll('-', '')}`;
  let root: Pool,
    db: PrismaService,
    app: INestApplication,
    service: AnalyticsService,
    reports: AnalyticsReportsService,
    task: AnalyticsExportTask,
    base: string;
  let owner: Actor, student: Actor, outsider: Actor, instructor: Actor, ta: Actor;
  let workspaceId: string,
    foreign: string,
    courseId: string,
    lessonId: string,
    enrollmentId: string,
    otherCourse: string,
    otherLesson: string,
    assessmentId: string,
    productId: string,
    secondProduct: string,
    usdPayment: string,
    usdItem: string;
  const stored = new Map<string, string>();
  const storage = {
    privateBucket: 'lms-private',
    createDownloadUrl: jest.fn(
      async (key: string) => `https://storage.example.test/${key}?signed=1`,
    ),
    deleteObject: jest.fn(async (key: string) => {
      stored.delete(key);
    }),
  };
  const files = {
    putFile: jest.fn(async (key: string, path: string) => {
      stored.set(key, await readFile(path, 'utf8'));
    }),
  };
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const query = {
    from: `${day}T00:00:00.000Z`,
    to: new Date(Date.parse(day) + 86400000).toISOString(),
  };
  const scope = () => ({ workspaceId, courseId });
  const path = (suffix: string) =>
    `/workspaces/${workspaceId}/courses/${courseId}/analytics/${suffix}`;
  const exportPath = () => `/workspaces/${workspaceId}/analytics/exports`;
  const input = () => ({ kind: 'LEARNERS' as const, parameters: { courseId, ...query } });
  const event = () => ({
    eventId: randomUUID(),
    occurredAt: now.toISOString(),
    courseId,
    lessonId,
    enrollmentId,
    type: 'lesson.playback' as const,
    properties: { positionSeconds: 20, elapsedSeconds: 20 },
  });
  async function request(
    path: string,
    actor: Actor | undefined = owner,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(actor ? { authorization: actor.id } : {}),
        'content-type': 'application/json',
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
      headers: response.headers,
    };
  }
  async function person(): Promise<Actor> {
    const user = await db.user.create({
      data: { email: `${randomUUID()}@example.test`, name: 'Test' },
    });
    return { id: user.id, platformRole: 'STUDENT' };
  }
  async function course(w = workspaceId) {
    const row = await db.course.create({
      data: {
        workspaceId: w,
        createdById: owner.id,
        slug: randomUUID(),
        title: 'Report course',
        summary: 'Report',
        status: 'PUBLISHED',
      },
    });
    const section = await db.section.create({
      data: { workspaceId: w, courseId: row.id, title: 'Section', position: 0 },
    });
    const lesson = await db.lesson.create({
      data: {
        workspaceId: w,
        courseId: row.id,
        sectionId: section.id,
        title: 'Video',
        type: 'VIDEO',
        body: {},
        position: 0,
        isPublished: true,
      },
    });
    return { course: row.id, lesson: lesson.id };
  }
  async function product() {
    const p = await db.product.create({
      data: { workspaceId, type: 'COURSE', name: 'Offer', slug: randomUUID(), description: {} },
    });
    const price = await db.price.create({
      data: { workspaceId, productId: p.id, currency: 'usd', amount: 1000 },
    });
    return { p, price };
  }
  async function order(
    currency: string,
    amount: number,
    status: 'SUCCEEDED' | 'PENDING' = 'SUCCEEDED',
  ) {
    const o = await db.order.create({
      data: {
        workspaceId,
        userId: student.id,
        number: randomUUID(),
        currency,
        subtotal: amount,
        grandTotal: amount,
        status: 'PAID',
      },
    });
    return db.payment.create({
      data: { workspaceId, orderId: o.id, status, currency, amount, paidAt: now },
    });
  }
  async function createExport(body: c.ExportRequest = input(), actor = owner) {
    return service.requestExport(actor, workspaceId, body, randomUUID(), 'test');
  }

  beforeAll(async () => {
    const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432')
      throw new Error('Analytics tests require LMS Postgres on localhost:55432');
    root = new Pool({ connectionString: url.toString() });
    await root.query(`CREATE DATABASE "${database}"`);
    url.pathname = `/${database}`;
    url.search = '';
    const boot = new Pool({ connectionString: url.toString() });
    try {
      for (const m of readdirSync(resolve('prisma/migrations'))
        .filter((m) => /^\d+_/.test(m))
        .sort())
        await boot.query(readFileSync(resolve('prisma/migrations', m, 'migration.sql'), 'utf8'));
    } finally {
      await boot.end();
    }
    db = new PrismaService(new ConfigService({ DATABASE_URL: url.toString() }) as never);
    await db.$connect();
    [owner, student, outsider, instructor, ta] = await Promise.all([
      person(),
      person(),
      person(),
      person(),
      person(),
    ]);
    const w = await db.workspace.create({
      data: { ownerId: owner.id, kind: 'ACADEMY', name: 'Analytics', slug: randomUUID() },
    });
    workspaceId = w.id;
    foreign = (
      await db.workspace.create({
        data: { ownerId: outsider.id, kind: 'ACADEMY', name: 'Foreign', slug: randomUUID() },
      })
    ).id;
    for (const [actor, wid, role] of [
      [owner, workspaceId, 'ADMIN'],
      [outsider, foreign, 'ADMIN'],
      [instructor, workspaceId, 'INSTRUCTOR'],
      [ta, workspaceId, 'TEACHING_ASSISTANT'],
    ] as const)
      await db.workspaceMember.create({ data: { workspaceId: wid, userId: actor.id, role } });
    const one = await course();
    courseId = one.course;
    lessonId = one.lesson;
    const two = await course();
    otherCourse = two.course;
    otherLesson = two.lesson;
    for (const [actor, role] of [
      [instructor, 'INSTRUCTOR'],
      [ta, 'TEACHING_ASSISTANT'],
    ] as const)
      await db.courseStaff.create({
        data: {
          workspaceId,
          courseId,
          userId: actor.id,
          role,
          canGrade: role === 'INSTRUCTOR',
          canManageLearners: role === 'TEACHING_ASSISTANT',
        },
      });
    const enrollment = await db.enrollment.create({
      data: {
        workspaceId,
        courseId,
        userId: student.id,
        enrolledAt: new Date(now.getTime() - 60000),
        completionPercent: 100,
        completedAt: now,
      },
    });
    enrollmentId = enrollment.id;
    await db.enrollmentGrant.create({
      data: {
        workspaceId,
        enrollmentId,
        source: 'FREE',
        sourceKey: 'test-free',
        startsAt: new Date(now.getTime() - 60000),
      },
    });
    await db.lessonProgress.create({
      data: {
        workspaceId,
        courseId,
        enrollmentId,
        lessonId,
        watchedSeconds: 45,
        completionPercent: 100,
        completedAt: now,
      },
    });
    const assessment = await db.assessment.create({
      data: { workspaceId, courseId, lessonId, kind: 'QUIZ', title: 'Quiz' },
    });
    assessmentId = assessment.id;
    const version = await db.assessmentVersion.create({
      data: { workspaceId, assessmentId, version: 1, status: 'PUBLISHED' },
    });
    for (const [i, status, percent, passed] of [
      [1, 'GRADED', 80, true],
      [2, 'GRADED', 40, false],
      [3, 'GRADING', null, null],
      [4, 'VOID', 100, true],
    ] as const)
      await db.assessmentAttempt.create({
        data: {
          workspaceId,
          courseId,
          enrollmentId,
          assessmentId,
          assessmentVersionId: version.id,
          number: i,
          status,
          randomSeed: randomUUID(),
          deliverySnapshot: {},
          startedAt: now,
          submittedAt: now,
          totalPoints: 100,
          awardedPoints: percent,
          percent,
          passed,
        },
      });
    const p1 = await product();
    productId = p1.p.id;
    const p2 = await product();
    secondProduct = p2.p.id;
    const payment = await order('usd', 1001);
    usdPayment = payment.id;
    for (const [product, price, amount] of [
      [productId, p1.price.id, 500],
      [secondProduct, p2.price.id, 500],
    ] as const) {
      const item = await db.orderItem.create({
        data: {
          workspaceId,
          orderId: payment.orderId!,
          productId: product,
          priceId: price,
          unitAmount: amount,
          totalAmount: amount,
          productSnapshot: {},
          entitlementSnapshot: {},
        },
      });
      if (product === productId) usdItem = item.id;
    }
    await order('eur', 700);
    await order('usd', 999, 'PENDING');
    const refund = await db.refund.create({
      data: {
        workspaceId,
        paymentId: payment.id,
        requestedById: owner.id,
        status: 'SUCCEEDED',
        amount: 200,
        currency: 'usd',
        reason: 'Test',
        completedAt: now,
      },
    });
    await db.refundItem.create({
      data: { workspaceId, refundId: refund.id, orderItemId: usdItem, amount: 200 },
    });
    await db.refund.create({
      data: {
        workspaceId,
        paymentId: payment.id,
        requestedById: owner.id,
        status: 'PENDING',
        amount: 50,
        currency: 'usd',
        reason: 'Pending',
      },
    });
    reports = new AnalyticsReportsService(db);
    service = new AnalyticsService(
      db,
      reports,
      new PolicyService(db),
      new AuditService(db, { nodeEnv: 'test' }),
      new OutboxService(new SharedEventContracts()),
      storage as unknown as StorageService,
      new LearnerAccessPolicy(db),
    );
    task = new AnalyticsExportTask(
      db,
      service,
      reports,
      storage as unknown as StorageService,
      files as unknown as MediaStorageService,
    );
    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: service },
        { provide: AnalyticsReportsService, useValue: reports },
        {
          provide: APP_GUARD,
          useValue: {
            canActivate(ctx: ExecutionContext) {
              const req = ctx
                .switchToHttp()
                .getRequest<{ headers: { authorization?: string }; user?: Actor }>();
              const actor = [owner, student, outsider, instructor, ta].find(
                (a) => a.id === req.headers.authorization,
              );
              if (!actor) throw new UnauthorizedException();
              req.user = actor;
              return true;
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (root) {
      await root.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await root.end();
    }
  }, 60000);

  it('rejects unauthenticated requests and malformed IDs', async () => {
    const response = await fetch(base + path('overview'));
    expect(response.status).toBe(401);
    expect((await request('/workspaces/bad/analytics/revenue')).status).toBe(400);
    expect((await request(exportPath(), owner, 'POST', input())).status).toBe(400);
  });
  it('hides tenant reports from learners, unrelated staff and foreign admins', async () => {
    expect((await request(path('overview'), student)).status).toBe(404);
    expect((await request(path('overview'), outsider)).status).toBe(404);
    expect(
      (
        await request(
          `/workspaces/${workspaceId}/courses/${otherCourse}/analytics/overview`,
          instructor,
        )
      ).status,
    ).toBe(404);
    expect(
      (await request(`/workspaces/${foreign}/courses/${courseId}/analytics/overview`)).status,
    ).toBe(404);
  });
  it('respects distinct TA roster and grade capabilities', async () => {
    expect((await request(path('learners'), ta)).status).toBe(200);
    expect((await request(path('assessments'), ta)).status).toBe(404);
    expect((await request(`/workspaces/${workspaceId}/analytics/revenue`, instructor)).status).toBe(
      404,
    );
  });
  it('rejects authoritative, injected and cross-course telemetry atomically', async () => {
    const url = `/workspaces/${workspaceId}/activity-events/batch`;
    expect(
      (await request(url, student, 'POST', { events: [{ ...event(), type: 'assessment.graded' }] }))
        .status,
    ).toBe(400);
    expect(
      (await request(url, student, 'POST', { events: [{ ...event(), userId: owner.id }] })).status,
    ).toBe(400);
    expect(
      (
        await request(url, student, 'POST', {
          events: [event(), { ...event(), lessonId: otherLesson }],
        })
      ).status,
    ).toBe(404);
    expect(await db.activityEvent.count()).toBe(0);
    await expect(service.ingest(outsider, workspaceId, { events: [event()] })).rejects.toThrow();
    await expect(service.ingest(student, foreign, { events: [event()] })).rejects.toThrow();
    await expect(
      service.ingest(student, workspaceId, {
        events: [
          {
            ...event(),
            type: 'lesson.navigation',
            properties: { destinationLessonId: otherLesson },
          },
        ],
      }),
    ).rejects.toThrow();
  });
  it('rejects expired access and spoofed timestamps', async () => {
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status: 'SUSPENDED' } });
    await expect(service.ingest(student, workspaceId, { events: [event()] })).rejects.toThrow();
    await db.enrollment.update({ where: { id: enrollmentId }, data: { status: 'ACTIVE' } });
    await expect(
      service.ingest(student, workspaceId, {
        events: [{ ...event(), occurredAt: new Date(Date.now() + 3600000).toISOString() }],
      }),
    ).rejects.toThrow();
  });
  it('deduplicates concurrent ingestion, including jsonb property reordering', async () => {
    const e = event();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.ingest(student, workspaceId, { events: [e] })),
    );
    expect(results.reduce((n, r) => n + r.accepted, 0)).toBe(1);
    expect(results.reduce((n, r) => n + r.duplicates, 0)).toBe(3);
    expect(
      await service.ingest(student, workspaceId, {
        events: [{ ...e, properties: { elapsedSeconds: 20, positionSeconds: 20 } }],
      }),
    ).toEqual({ accepted: 0, duplicates: 1 });
    await expect(
      service.ingest(student, workspaceId, {
        events: [{ ...e, properties: { elapsedSeconds: 30, positionSeconds: 30 } }],
      }),
    ).rejects.toThrow();
  });
  it('rebuilds metrics deterministically under concurrent execution and reconciles grades', async () => {
    await Promise.all([reports.recompute(scope(), query), reports.recompute(scope(), query)]);
    const row = await db.dailyCourseMetric.findUniqueOrThrow({
      where: { courseId_day: { courseId, day: new Date(day) } },
    });
    expect(row).toMatchObject({
      newEnrollments: 1,
      completions: 1,
      activeLearners: 1,
      learningSeconds: 20n,
      assessmentSubmissions: 3,
    });
    await reports.recompute(scope(), query);
    expect(
      (await db.dailyCourseMetric.findUniqueOrThrow({ where: { id: row.id } })).learningSeconds,
    ).toBe(20n);
    const reply = await request(path(`assessments?from=${query.from}&to=${query.to}`), instructor);
    expect(reply.status).toBe(200);
    expect(c.assessmentAnalyticsResponseSchema.parse(reply.body).data).toEqual([
      {
        assessmentId,
        attempts: '3',
        passed: '1',
        awaitingManualGrading: '1',
        averagePercent: '60.00',
      },
    ]);
    const overview = await request(path(`overview?from=${query.from}&to=${query.to}`));
    expect(c.courseAnalyticsResponseSchema.parse(overview.body).data).toMatchObject({
      enrollments: '1',
      completions: '1',
      learningSeconds: '20',
      completionRate: '100.00',
    });
    expect(overview.headers.get('cache-control')).toContain('no-store');
  });
  it('returns only the student’s own historical progress', async () => {
    const reply = await request('/me/analytics/progress', student);
    expect(c.studentAnalyticsResponseSchema.parse(reply.body).data).toMatchObject({
      enrolledCourses: 1,
      completedCourses: 1,
      learningSeconds: '45',
      currentStreakDays: 1,
      courses: [{ courseId, enrollmentId, completionPercent: '100' }],
    });
    expect(
      c.studentAnalyticsResponseSchema.parse(
        (await request('/me/analytics/progress', outsider)).body,
      ).data.enrolledCourses,
    ).toBe(0);
  });
  it('binds learner cursors to scope, cohort and date filters', async () => {
    const another = await person();
    await db.enrollment.create({
      data: { workspaceId, courseId, userId: another.id, enrolledAt: now },
    });
    const first = await reports.learners(scope(), { ...query, limit: 1 });
    expect(first.meta.hasMore).toBe(true);
    const second = await reports.learners(scope(), {
      ...query,
      limit: 1,
      cursor: first.meta.nextCursor!,
    });
    expect(second.data[0]?.enrollmentId).not.toBe(first.data[0]?.enrollmentId);
    await expect(
      reports.learners(
        { workspaceId, courseId: otherCourse },
        { ...query, limit: 1, cursor: first.meta.nextCursor! },
      ),
    ).rejects.toThrow();
    await expect(
      reports.learners(scope(), { ...query, limit: 1, cohortId: randomUUID() }),
    ).rejects.toThrow();
    expect((await request(path('overview?from=2020-01-01&to=2026-01-01'))).status).toBe(400);
  });
  it('reconciles successful ledgers per currency and ignores pending money', async () => {
    const reply = await request(
      `/workspaces/${workspaceId}/analytics/revenue?from=${query.from}&to=${query.to}`,
    );
    expect(c.revenueResponseSchema.parse(reply.body).data).toEqual([
      { currency: 'eur', paid: 700, refunded: 0, net: 700 },
      { currency: 'usd', paid: 1001, refunded: 200, net: 801 },
    ]);
    const a = await reports.revenue(workspaceId, { ...query, productId });
    const b = await reports.revenue(workspaceId, { ...query, productId: secondProduct });
    expect(a[0]!.paid + b[0]!.paid).toBe(1001);
    expect(a[0]!.refunded).toBe(200);
    expect(b[0]!.refunded).toBe(0);
    expect(await reports.revenue(foreign, query)).toEqual([]);
    expect(await reports.revenue(workspaceId, { ...query, currency: 'eur' })).toEqual([
      { currency: 'eur', paid: 700, refunded: 0, net: 700 },
    ]);
  });
  it('uses refund settlement dates independently of payment dates', async () => {
    await db.payment.update({
      where: { id: usdPayment },
      data: { paidAt: new Date(now.getTime() - 86400000) },
    });
    expect(await reports.revenue(workspaceId, { ...query, currency: 'usd' })).toEqual([
      { currency: 'usd', paid: 0, refunded: 200, net: -200 },
    ]);
    await db.payment.update({ where: { id: usdPayment }, data: { paidAt: now } });
  });
  it('rejects cross-course, foreign-tenant and revenue exports by instructors', async () => {
    await expect(
      createExport({ kind: 'LEARNERS', parameters: { courseId: otherCourse } }, instructor),
    ).rejects.toThrow();
    await expect(
      service.requestExport(
        instructor,
        workspaceId,
        { kind: 'REVENUE', parameters: {} },
        randomUUID(),
        'test',
      ),
    ).rejects.toThrow();
    await expect(
      service.requestExport(outsider, workspaceId, input(), randomUUID(), 'test'),
    ).rejects.toThrow();
    expect(await db.reportExport.count()).toBe(0);
  });
  it('atomically deduplicates export retries with one outbox record and checks request hashes', async () => {
    const key = randomUUID();
    const rows = await Promise.all(
      Array.from({ length: 3 }, () =>
        service.requestExport(owner, workspaceId, input(), key, 'test'),
      ),
    );
    expect(new Set(rows.map((r) => r.operationId)).size).toBe(1);
    expect(await db.outboxEvent.count({ where: { aggregateId: rows[0]!.operationId } })).toBe(1);
    await expect(
      service.requestExport(
        owner,
        workspaceId,
        { kind: 'PROGRESS', parameters: { courseId } },
        key,
        'test',
      ),
    ).rejects.toThrow();
    expect(
      (await db.reportExport.findUniqueOrThrow({ where: { id: rows[0]!.operationId } })).status,
    ).toBe('PENDING');
    await task.process(rows[0]!.operationId);
  });
  it('leases exports once, persists private assets, and binds polling to current permissions', async () => {
    const op = await createExport(input(), instructor);
    const uploads = files.putFile.mock.calls.length;
    await Promise.all([task.process(op.operationId), task.process(op.operationId)]);
    expect(files.putFile.mock.calls.length).toBe(uploads + 1);
    const row = await db.reportExport.findUniqueOrThrow({
      where: { id: op.operationId },
      include: { asset: true },
    });
    expect(row).toMatchObject({
      status: 'READY',
      lockedUntil: null,
      asset: { status: 'READY', visibility: 'PRIVATE', workspaceId, uploadedById: instructor.id },
    });
    expect(stored.get(row.asset!.objectKey)).toContain('"enrollmentId","userId"');
    expect(
      c.exportOperationSchema.parse(
        await service.operation(instructor, workspaceId, op.operationId, 'test'),
      ).status,
    ).toBe('READY');
    await expect(service.operation(student, workspaceId, op.operationId, 'test')).rejects.toThrow();
    await expect(service.operation(outsider, foreign, op.operationId, 'test')).rejects.toThrow();
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: instructor.id } },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      service.operation(instructor, workspaceId, op.operationId, 'test'),
    ).rejects.toThrow();
    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: instructor.id } },
      data: { status: 'ACTIVE' },
    });
    expect((await service.operation(owner, workspaceId, op.operationId, 'test')).status).toBe(
      'READY',
    );
    await db.reportExport.update({
      where: { id: op.operationId },
      data: { createdAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await service.operation(instructor, workspaceId, op.operationId, 'test')).status).toBe(
      'EXPIRED',
    );
    await task.expire();
    expect(stored.has(row.asset!.objectKey)).toBe(false);
  });
  it('recovers stale leases and fails safely when requester access is revoked', async () => {
    const op = await createExport();
    await db.reportExport.update({
      where: { id: op.operationId },
      data: { status: 'PROCESSING', lockedUntil: new Date(0) },
    });
    await task.handle();
    expect(
      (await db.reportExport.findUniqueOrThrow({ where: { id: op.operationId } })).status,
    ).toBe('READY');
    const denied = await createExport(input(), instructor);
    await db.courseStaff.delete({
      where: { courseId_userId: { courseId, userId: instructor.id } },
    });
    await task.process(denied.operationId);
    expect(
      (await db.reportExport.findUniqueOrThrow({ where: { id: denied.operationId } })).status,
    ).toBe('FAILED');
  });
  it('rolls back export, audit and idempotency when outbox insertion fails', async () => {
    const before = await db.reportExport.count();
    const outbox = new OutboxService(new SharedEventContracts());
    jest.spyOn(outbox, 'append').mockRejectedValueOnce(new Error('outbox unavailable'));
    const broken = new AnalyticsService(
      db,
      reports,
      new PolicyService(db),
      new AuditService(db, { nodeEnv: 'test' }),
      outbox,
      storage as unknown as StorageService,
      new LearnerAccessPolicy(db),
    );
    const key = randomUUID();
    await expect(broken.requestExport(owner, workspaceId, input(), key, 'test')).rejects.toThrow(
      'outbox unavailable',
    );
    expect(await db.reportExport.count()).toBe(before);
    expect(await db.idempotencyRecord.count({ where: { key } })).toBe(0);
  });
  it('reconciles initial and recurring subscriptions once, including itemless refunds', async () => {
    const product = await db.product.create({
      data: { workspaceId, type: 'SUBSCRIPTION_PLAN', name: 'Plan', slug: randomUUID() },
    });
    const price = await db.price.create({
      data: { workspaceId, productId: product.id, currency: 'gbp', amount: 300, interval: 'MONTH' },
    });
    const customer = await db.billingCustomer.create({
      data: { workspaceId, userId: student.id, stripeCustomerId: `cus_${randomUUID()}` },
    });
    const subscription = await db.subscription.create({
      data: {
        workspaceId,
        userId: student.id,
        productId: product.id,
        priceId: price.id,
        customerId: customer.id,
        status: 'ACTIVE',
        stripeSubscriptionId: `sub_${randomUUID()}`,
        entitlementSnapshot: {},
      },
    });
    const initial = await order('gbp', 300);
    await db.payment.update({
      where: { id: initial.id },
      data: { subscriptionId: subscription.id },
    });
    await db.orderItem.create({
      data: {
        workspaceId,
        orderId: initial.orderId!,
        productId: product.id,
        priceId: price.id,
        unitAmount: 300,
        totalAmount: 300,
        productSnapshot: {},
        entitlementSnapshot: {},
      },
    });
    const recurring = await db.payment.create({
      data: {
        workspaceId,
        subscriptionId: subscription.id,
        status: 'SUCCEEDED',
        currency: 'gbp',
        amount: 700,
        paidAt: now,
      },
    });
    await db.refund.create({
      data: {
        workspaceId,
        paymentId: recurring.id,
        requestedById: owner.id,
        status: 'SUCCEEDED',
        currency: 'gbp',
        amount: 100,
        completedAt: now,
        reason: 'Recurring adjustment',
      },
    });
    expect(await reports.revenue(workspaceId, { ...query, currency: 'gbp' })).toEqual([
      { currency: 'gbp', paid: 1000, refunded: 100, net: 900 },
    ]);
    expect(await reports.revenue(workspaceId, { ...query, productId: product.id })).toEqual([
      { currency: 'gbp', paid: 1000, refunded: 100, net: 900 },
    ]);
  });
  it('exports every report kind through the HTTP contracts and durable worker', async () => {
    for (const kind of ['PROGRESS', 'ASSESSMENTS', 'REVENUE'] as const) {
      const body = { kind, parameters: kind === 'REVENUE' ? query : { ...query, courseId } };
      const reply = await request(exportPath(), owner, 'POST', body, {
        'idempotency-key': randomUUID(),
      });
      expect(reply.status).toBe(202);
      const operation = c.exportAcceptedResponseSchema.parse(reply.body).data;
      await task.process(operation.operationId);
      const status = await request(`${exportPath()}/${operation.operationId}`);
      expect(c.exportOperationResponseSchema.parse(status.body).data.status).toBe('READY');
      const row = await db.reportExport.findUniqueOrThrow({
        where: { id: operation.operationId },
        include: { asset: true },
      });
      expect(stored.get(row.asset!.objectKey)).toContain(
        kind === 'PROGRESS' ? '"day"' : kind === 'ASSESSMENTS' ? '"averagePercent"' : '"currency"',
      );
    }
  });
  it('pages large learner exports without dropping or duplicating rows', async () => {
    const users = Array.from({ length: 103 }, () => ({
      id: randomUUID(),
      email: `${randomUUID()}@example.test`,
      name: 'Page test',
    }));
    await db.user.createMany({ data: users });
    await db.enrollment.createMany({
      data: users.map((u) => ({ workspaceId, courseId, userId: u.id, enrolledAt: now })),
    });
    const op = await createExport();
    await task.process(op.operationId);
    const row = await db.reportExport.findUniqueOrThrow({
      where: { id: op.operationId },
      include: { asset: true },
    });
    expect(row.status).toBe('READY');
    const lines = stored.get(row.asset!.objectKey)!.trim().split('\r\n');
    expect(lines).toHaveLength(106); // Header, 103 new learners and the two existing enrollments.
    expect(new Set(lines.slice(1).map((line) => line.split(',')[0])).size).toBe(105);
  });
  it('records failed uploads for durable cleanup without exposing a ready artifact', async () => {
    const op = await createExport();
    files.putFile.mockRejectedValueOnce(new Error('provider failure with secret URL'));
    await task.process(op.operationId);
    const row = await db.reportExport.findUniqueOrThrow({
      where: { id: op.operationId },
      include: { asset: true },
    });
    expect(row.status).toBe('FAILED');
    expect(row.asset?.status).toBe('DELETED');
    expect(row.lastError).not.toContain('secret');
    expect(await service.operation(owner, workspaceId, op.operationId, 'test')).not.toHaveProperty(
      'url',
    );
  });
  it('does not let an expired lease publish over a replacement worker', async () => {
    const op = await createExport();
    files.putFile.mockImplementationOnce(async (key: string, path: string) => {
      stored.set(key, await readFile(path, 'utf8'));
      await db.reportExport.update({
        where: { id: op.operationId },
        data: { lockedUntil: new Date(0) },
      });
    });
    await task.process(op.operationId);
    expect(
      (await db.reportExport.findUniqueOrThrow({ where: { id: op.operationId } })).status,
    ).toBe('PROCESSING');
    await task.process(op.operationId);
    expect(
      (await db.reportExport.findUniqueOrThrow({ where: { id: op.operationId } })).status,
    ).toBe('READY');
  });
  it('does not overwrite stored daily metrics with a partial-day rebuild', async () => {
    await expect(
      reports.recompute(scope(), {
        from: new Date(Date.parse(day) + 3600000).toISOString(),
        to: query.to,
      }),
    ).rejects.toThrow();
    const partial = await reports.daily(scope(), {
      from: new Date(now.getTime() + 1000).toISOString(),
      to: query.to,
    });
    expect(partial[0]).toMatchObject({ newEnrollments: 0, completions: 0, learningSeconds: '0' });
  });
  it('enforces a concurrency-safe actor ingestion rate limit', async () => {
    const rows = Array.from({ length: 999 }, () => ({
      ...event(),
      workspaceId,
      userId: student.id,
      occurredAt: now,
      receivedAt: new Date(),
      properties: { elapsedSeconds: 1, positionSeconds: 1 },
    }));
    await db.activityEvent.createMany({ data: rows });
    const result = await Promise.allSettled([
      service.ingest(student, workspaceId, { events: [event()] }),
      service.ingest(student, workspaceId, { events: [event()] }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(0); // Earlier deduped event fills slot 1000.
    expect(await db.activityEvent.count({ where: { userId: student.id } })).toBe(1000);
    const limited = await request(
      `/workspaces/${workspaceId}/activity-events/batch`,
      student,
      'POST',
      { events: [event()] },
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });
});
