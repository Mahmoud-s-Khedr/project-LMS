import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/env';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService, IS_PUBLIC } from '../../common/authz';
import { MailService } from '../../infrastructure/mail/mail.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { ContentPagination } from '../content/content.support';
import { AssessmentAttemptsService } from '../assessments/attempts.service';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsConsumer } from '../notifications/notifications.consumer';
import { NotificationDeliveryTask } from '../notifications/notification-delivery.task';
import { NotificationRemindersTask } from '../notifications/notification-reminders.task';
import { NotificationReleasesTask } from '../notifications/notification-releases.task';
import { CertificatesService } from './certificates.service';
import {
  CertificateStaffController,
  MyCertificatesController,
  CertificateVerificationController,
} from './certificates.controller';
import { CertificateCompletionConsumer, CertificateRenderTask } from './certificates.tasks';
import { CertificateRenderer } from './certificate-renderer';
import { EventConsumerRunnerService } from '../events/event-consumer-runner.service';
import { EventConsumerRegistry } from '../events/consumer-registry';
import { resolveEventsOptions } from '../events/events.options';

const url = process.env.ENGAGEMENT_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
const smtpIntegration = process.env.ENGAGEMENT_TEST_SMTP === '1' ? it : it.skip;
const storageIntegration = process.env.ENGAGEMENT_TEST_STORAGE === '1' ? it : it.skip;
integration('Engagement on isolated PostgreSQL', () => {
  const dbName = `lms_engagement_test_${randomUUID().replaceAll('-', '')}`;
  let admin: Pool,
    prisma: PrismaService,
    certificates: CertificatesService,
    notifications: NotificationsService,
    audit: AuditService,
    outbox: OutboxService,
    app: INestApplication,
    base: string;
  let ws: string,
    otherWs: string,
    course: string,
    lesson: string,
    owner: string,
    learner: string,
    outsider: string,
    ta: string,
    template: string;
  let runner: EventConsumerRunnerService;
  const sends = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
  const mail = { send: sends } as unknown as MailService;
  let delivery: NotificationDeliveryTask;
  let nextPass = true;
  const results = {
    effectiveResult: jest.fn(async () => ({ finalized: true, passed: nextPass, percent: '100' })),
  } as unknown as AssessmentAttemptsService;
  const actors = new Map<string, { id: string; platformRole: 'STUDENT' }>();
  const actor = (id: string) => ({ id, platformRole: 'STUDENT' as const });
  async function user(name: string) {
    const u = await prisma.user.create({ data: { email: `${randomUUID()}@example.test`, name } });
    actors.set(u.id, actor(u.id));
    return u.id;
  }
  async function enrollment(completed = true, who = learner) {
    const start = new Date(Date.now() - 86400000);
    return prisma.enrollment.create({
      data: {
        workspaceId: ws,
        courseId: course,
        userId: who,
        startedAt: start,
        enrolledAt: start,
        completedAt: completed ? new Date() : null,
        completionPercent: completed ? 100 : 0,
        policySnapshot: {
          version: 1,
          frozenAt: start.toISOString(),
          requiredLessonIds: [lesson],
          criteria: { [lesson]: { rule: 'ACKNOWLEDGE', requiredWatchPercent: 90 } },
        },
      },
    });
  }
  const scope = () => ({ workspaceId: ws, courseId: course });
  const request = async (
    method: string,
    path: string,
    who?: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const response = await fetch(`${base}/${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(who ? { 'x-test-user': who } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as Record<string, unknown>,
    };
  };
  beforeAll(async () => {
    admin = new Pool({ connectionString: url });
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const dbUrl = new URL(url!);
    dbUrl.pathname = `/${dbName}`;
    const migration = new Pool({ connectionString: dbUrl.toString() });
    try {
      for (const dir of readdirSync(resolve('prisma/migrations'))
        .filter((n) => /^\d/.test(n))
        .sort())
        await migration.query(
          readFileSync(resolve('prisma/migrations', dir, 'migration.sql'), 'utf8'),
        );
    } finally {
      await migration.end();
    }
    const config = new ConfigService<Environment, true>({
      DATABASE_URL: dbUrl.toString(),
      JWT_ACCESS_SECRET: 'engagement-test-secret-32-characters',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 51025,
      SMTP_SECURE: false,
      SMTP_FROM: 'LMS <noreply@lms.test>',
      S3_ENDPOINT: 'http://localhost:59000',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY_ID: 'lms',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_PRIVATE_BUCKET: 'lms-private',
      S3_PUBLIC_BUCKET: 'lms-public',
    });
    prisma = new PrismaService(config);
    await prisma.$connect();
    await prisma.$executeRawUnsafe('ALTER TABLE "Asset" ALTER COLUMN "uploadedById" DROP NOT NULL');
    audit = new AuditService(prisma);
    outbox = new OutboxService(new SharedEventContracts());
    const pagination = new ContentPagination(
      new ConfigService({ JWT_ACCESS_SECRET: 'engagement-test-secret-32-characters' }),
    );
    const storage = {
      privateBucket: 'lms-private',
      createDownloadUrl: jest.fn(async () => 'https://private.test/signed'),
    } as unknown as StorageService;
    notifications = new NotificationsService(prisma, pagination);
    certificates = new CertificatesService(
      prisma,
      new PolicyService(prisma),
      audit,
      outbox,
      storage,
      pagination,
      results,
      notifications,
    );
    delivery = new NotificationDeliveryTask(prisma, mail);
    const consumers = [
      new CertificateCompletionConsumer(certificates),
      new NotificationsConsumer(notifications),
    ];
    runner = new EventConsumerRunnerService(
      prisma,
      new SharedEventContracts(),
      new EventConsumerRegistry(consumers, new SharedEventContracts()),
      resolveEventsOptions({ autoStart: false }),
    );
    owner = await user('Owner');
    learner = await user('Ada PrivateSurname');
    outsider = await user('Outsider');
    ta = await user('TA');
    const workspace = await prisma.workspace.create({
      data: { ownerId: owner, slug: randomUUID(), name: 'Academy', kind: 'ACADEMY' },
    });
    ws = workspace.id;
    otherWs = (
      await prisma.workspace.create({
        data: { ownerId: outsider, slug: randomUUID(), name: 'Other', kind: 'ACADEMY' },
      })
    ).id;
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId: ws, userId: owner, role: 'ADMIN' },
        { workspaceId: ws, userId: ta, role: 'TEACHING_ASSISTANT' },
        { workspaceId: otherWs, userId: outsider, role: 'ADMIN' },
      ],
    });
    course = (
      await prisma.course.create({
        data: {
          workspaceId: ws,
          createdById: owner,
          slug: randomUUID(),
          title: 'Secure systems',
          summary: 'Secure systems training',
          status: 'PUBLISHED',
        },
      })
    ).id;
    await prisma.courseStaff.create({
      data: {
        workspaceId: ws,
        courseId: course,
        userId: ta,
        role: 'TEACHING_ASSISTANT',
        canEditContent: true,
        canGrade: true,
      },
    });
    const section = await prisma.section.create({
      data: { workspaceId: ws, courseId: course, title: 'Section', position: 0 },
    });
    lesson = (
      await prisma.lesson.create({
        data: {
          workspaceId: ws,
          courseId: course,
          sectionId: section.id,
          title: 'Lesson',
          type: 'TEXT',
          position: 0,
          body: {},
          isPublished: true,
          completionRule: 'ACKNOWLEDGE',
        },
      })
    ).id;
    template = (
      await certificates.createTemplate(
        actor(owner),
        scope(),
        {
          name: 'Default',
          issuerName: 'Academy',
          isActive: true,
          backgroundAssetId: null,
          layout: {
            orientation: 'LANDSCAPE',
            title: 'Certificate',
            body: 'Completed',
            accentColor: '#126978',
          },
        },
        'test',
      )
    ).data.id;
    const reflector = new Reflector();
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])],
      controllers: [
        CertificateStaffController,
        MyCertificatesController,
        CertificateVerificationController,
        NotificationsController,
      ],
      providers: [
        { provide: CertificatesService, useValue: certificates },
        { provide: NotificationsService, useValue: notifications },
        {
          provide: APP_GUARD,
          useValue: {
            canActivate(context: ExecutionContext) {
              if (
                reflector.getAllAndOverride(IS_PUBLIC, [context.getHandler(), context.getClass()])
              )
                return true;
              const req = context
                .switchToHttp()
                .getRequest<{ headers: Record<string, string>; user: unknown }>();
              const user = actors.get(req.headers['x-test-user'] ?? '');
              if (!user) throw new UnauthorizedException();
              req.user = user;
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
    await app?.close();
    await prisma?.$disconnect();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  }, 30000);
  beforeEach(() => {
    sends.mockClear();
    sends.mockResolvedValue(undefined);
  });
  it('rejects anonymous, other tenant, wrong parents and TA even with grading/edit flags', async () => {
    const path = `workspaces/${ws}/courses/${course}/certificate-templates`;
    expect((await request('GET', path)).status).toBe(401);
    expect((await request('GET', path, outsider)).status).toBe(404);
    expect((await request('GET', path, ta)).status).toBe(404);
    expect(
      (await request('GET', `workspaces/${otherWs}/courses/${course}/certificate-templates`, owner))
        .status,
    ).toBe(404);
  });
  it('serializes template versions and rejects cross-tenant backgrounds', async () => {
    const input = {
      name: 'Version',
      issuerName: 'Academy',
      isActive: true,
      backgroundAssetId: null,
      layout: {
        orientation: 'LANDSCAPE' as const,
        title: 'Certificate',
        body: 'Completed',
        accentColor: '#126978',
      },
    };
    const created = await Promise.all(
      Array.from({ length: 5 }, () =>
        certificates.createTemplate(actor(owner), scope(), input, 'test'),
      ),
    );
    expect(new Set(created.map((r) => r.data.version)).size).toBe(5);
    await expect(
      certificates.createTemplate(
        actor(owner),
        scope(),
        { ...input, backgroundAssetId: randomUUID() },
        'test',
      ),
    ).rejects.toThrow('background');
  });
  let certificateId: string, enrollmentId: string;
  it('issues exactly one certificate and event under eight concurrent commands and redelivery', async () => {
    const e = await enrollment();
    enrollmentId = e.id;
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        prisma.$transaction(
          (tx) => certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
          { timeout: 20000 },
        ),
      ),
    );
    certificateId = ids[0]!;
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.certificate.count()).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { type: 'certificate.issued.v1' } })).toBe(1);
    const event = await outbox.append(prisma, {
      type: 'course.completed.v1',
      workspaceId: ws,
      aggregateType: 'Enrollment',
      aggregateId: e.id,
      payload: { enrollmentId: e.id },
    });
    expect(await runner.deliver({ eventId: event.id, consumer: 'certificates.completion' })).toBe(
      'processed',
    );
    expect(await runner.deliver({ eventId: event.id, consumer: 'certificates.completion' })).toBe(
      'duplicate',
    );
    expect(await prisma.certificate.count()).toBe(1);
  });
  it('enforces HTTP issuance idempotency, mismatch conflict and required key', async () => {
    const key = randomUUID(),
      path = `workspaces/${ws}/courses/${course}/enrollments/${enrollmentId}/certificate`;
    expect((await request('POST', path, owner, { templateId: template })).status).toBe(400);
    const a = await request(
      'POST',
      path,
      owner,
      { templateId: template },
      { 'idempotency-key': key },
    );
    const b = await request(
      'POST',
      path,
      owner,
      { templateId: template },
      { 'idempotency-key': key },
    );
    expect(a.status).toBe(202);
    expect(b.body).toEqual(a.body);
    expect(
      (await request('POST', path, owner, { templateId: randomUUID() }, { 'idempotency-key': key }))
        .status,
    ).toBe(409);
  });
  it('blocks incomplete enrollment and same-course template mismatch', async () => {
    const u = await user('Incomplete'),
      e = await enrollment(false, u);
    await expect(
      prisma.$transaction((tx) =>
        certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
      ),
    ).rejects.toThrow('completion');
    await prisma.enrollment.update({ where: { id: e.id }, data: { completedAt: new Date() } });
    await expect(
      prisma.$transaction((tx) =>
        certificates.issueInTx(tx, scope(), e.id, randomUUID(), null, 'test'),
      ),
    ).rejects.toThrow('template');
  });
  it('requires a finalized current passing assessment, even after prior completion', async () => {
    const u = await user('Assessment learner'),
      e = await enrollment(true, u);
    const assessment = await prisma.assessment.create({
      data: {
        workspaceId: ws,
        courseId: course,
        lessonId: lesson,
        title: 'Required',
        kind: 'QUIZ',
      },
    });
    const snap = {
      version: 1,
      frozenAt: new Date().toISOString(),
      requiredLessonIds: [lesson],
      criteria: { [lesson]: { rule: 'ASSESSMENT_PASS', requiredWatchPercent: 90 } },
    };
    await prisma.enrollment.update({ where: { id: e.id }, data: { policySnapshot: snap } });
    nextPass = false;
    await expect(
      prisma.$transaction((tx) =>
        certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
      ),
    ).rejects.toThrow('passing');
    nextPass = true;
    await prisma.assessment.delete({ where: { id: assessment.id } });
  });
  it('owner history is private; public verification masks names and omits files, email, reason', async () => {
    expect((await request('GET', `me/certificates/${certificateId}`, outsider)).status).toBe(404);
    const own = await request('GET', `me/certificates/${certificateId}`, learner);
    expect(own.status).toBe(200);
    expect(own.headers.get('cache-control')).toBe('private, no-store');
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    const publicResult = await request('GET', `certificates/verify/${row.verificationCode}`);
    expect(publicResult.status).toBe(200);
    expect(publicResult.body.data).toEqual({
      status: 'VALID',
      courseTitle: 'Secure systems',
      issuerName: 'Academy',
      issuedAt: row.issuedAt.toISOString(),
      maskedRecipientName: 'A*** P***',
    });
    expect(JSON.stringify(publicResult.body)).not.toMatch(
      /PrivateSurname|example.test|recipientSnapshot|documentAssetId|revocationReason|url/,
    );
  });
  it('downloads privately after access expires and never through another recipient', async () => {
    const asset = await prisma.asset.create({
      data: {
        workspaceId: ws,
        objectKey: `test/${randomUUID()}.pdf`,
        bucket: 'lms-private',
        filename: 'certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        status: 'READY',
        uploadedById: learner,
      },
    });
    await prisma.certificate.update({
      where: { id: certificateId },
      data: { documentAssetId: asset.id },
    });
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: 'SUSPENDED' } });
    expect(
      (await request('POST', `me/certificates/${certificateId}/download`, learner)).status,
    ).toBe(200);
    expect(
      (await request('POST', `me/certificates/${certificateId}/download`, outsider)).status,
    ).toBe(404);
  });
  it('revokes once with an audit, private reason and notification', async () => {
    const path = `workspaces/${ws}/courses/${course}/certificates/${certificateId}/revoke`;
    expect((await request('POST', path, owner, { reason: '' })).status).toBe(400);
    expect(
      (await request('POST', path, owner, { reason: 'Private administrative review reason' }))
        .status,
    ).toBe(200);
    await request('POST', path, owner, { reason: 'Repeat' });
    expect(
      await prisma.auditLog.count({
        where: { action: 'certificate.revoked', resourceId: certificateId },
      }),
    ).toBe(1);
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    const result = await certificates.verify(row.verificationCode);
    expect(result.data.status).toBe('REVOKED');
    expect(JSON.stringify(result)).not.toContain('reason');
  });
  it('deduplicates notifications and channel rows under concurrent command/event redelivery', async () => {
    const input = {
      workspaceId: ws,
      userId: learner,
      type: 'enrollment.granted' as const,
      dedupeKey: 'concurrent',
      title: 'Access granted',
      body: 'Ready',
      data: { path: '/student/enrollments' },
    };
    await Promise.all(
      Array.from({ length: 8 }, () => prisma.$transaction((tx) => notifications.create(tx, input))),
    );
    const row = await prisma.notification.findUniqueOrThrow({
      where: { userId_dedupeKey: { userId: learner, dedupeKey: 'concurrent' } },
    });
    expect(await prisma.notificationDelivery.count({ where: { notificationId: row.id } })).toBe(2);
    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'certificate.issued.v1' },
    });
    await runner.deliver({ eventId: event.id, consumer: 'notifications.domain' });
    await runner.deliver({ eventId: event.id, consumer: 'notifications.domain' });
    expect(await prisma.notification.count({ where: { dedupeKey: `event:${event.id}` } })).toBe(1);
  });
  it('enforces notification recipient, read-all timestamp and scoped cursors', async () => {
    const row = await prisma.notification.findFirstOrThrow({ where: { userId: learner } });
    expect(
      (await request('PATCH', `me/notifications/${row.id}`, outsider, { read: true })).status,
    ).toBe(404);
    expect(
      (
        await request('PATCH', `me/notifications/${row.id}`, learner, {
          read: true,
          userId: outsider,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request('PATCH', `me/notifications/${row.id}`, learner, { read: true })).status,
    ).toBe(200);
    await notifications.readAll(learner, '2000-01-01T00:00:00Z');
    const page = await notifications.list(learner, { limit: 1 });
    expect(page.meta.hasMore).toBe(true);
    await expect(
      notifications.list(outsider, { limit: 1, cursor: page.meta.nextCursor! }),
    ).rejects.toThrow('cursor');
    await expect(
      notifications.list(learner, { limit: 1, cursor: page.meta.nextCursor!, unread: true }),
    ).rejects.toThrow('cursor');
  });
  it('scopes preference replacement and enforces mandatory transactional mail', async () => {
    await expect(
      notifications.replacePreferences(learner, {
        preferences: [
          { workspaceId: otherWs, type: 'live.reminder', channel: 'EMAIL', enabled: false },
        ],
      }),
    ).rejects.toThrow();
    const response = await request('PUT', 'me/notification-preferences', learner, {
      preferences: [{ workspaceId: ws, type: 'order.paid', channel: 'EMAIL', enabled: false }],
    });
    expect(response.status).toBe(400);
    await notifications.replacePreferences(learner, {
      preferences: [{ workspaceId: ws, type: 'live.reminder', channel: 'EMAIL', enabled: false }],
    });
    const row = await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: learner,
        type: 'live.reminder',
        title: 'Soon',
        body: 'Join your course',
        data: { path: '/student' },
        dedupeKey: 'suppressed',
      }),
    );
    expect(
      await prisma.notificationDelivery.findFirst({
        where: { notificationId: row!.id, channel: 'EMAIL' },
      }),
    ).toMatchObject({ status: 'SUPPRESSED' });
  });
  it('sends once under overlapping workers and repeated task executions; retries failures safely', async () => {
    await Promise.all([delivery.handle(), delivery.handle()]);
    const count = sends.mock.calls.length;
    expect(count).toBeGreaterThan(0);
    await delivery.handle();
    expect(sends).toHaveBeenCalledTimes(count);
    expect(JSON.stringify(sends.mock.calls)).not.toMatch(
      /answerKey|ciphertext|verificationCode|PrivateSurname/,
    );
    await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: learner,
        type: 'order.paid',
        title: 'Paid',
        body: 'Payment received',
        data: {},
        dedupeKey: 'retry',
      }),
    );
    sends.mockRejectedValueOnce(new Error('SMTP password secret must never be stored'));
    await delivery.handle();
    const failed = await prisma.notificationDelivery.findFirstOrThrow({
      where: { status: 'FAILED' },
    });
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toBe('Mail delivery failed');
    expect(failed.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    await prisma.notificationDelivery.update({
      where: { id: failed.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await delivery.handle();
    expect(
      await prisma.notificationDelivery.findUnique({ where: { id: failed.id } }),
    ).toMatchObject({ status: 'SENT', attempts: 2 });
  });
  it('scheduled live reminders dedupe, ignore canceled sessions and exclude secret join URLs', async () => {
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: 'ACTIVE' } });
    await prisma.enrollmentGrant.create({
      data: {
        workspaceId: ws,
        enrollmentId,
        source: 'FREE',
        sourceKey: `free:${randomUUID()}`,
        startsAt: new Date(Date.now() - 10000),
      },
    });
    const session = await prisma.liveSession.create({
      data: {
        workspaceId: ws,
        courseId: course,
        lessonId: lesson,
        title: 'Live',
        provider: 'zoom',
        joinUrl: 'https://secret.test/meeting-password',
        startsAt: new Date(Date.now() + 1800000),
        endsAt: new Date(Date.now() + 3600000),
      },
    });
    const reminders = new NotificationRemindersTask(
      prisma,
      notifications,
      new LearnerAccessPolicy(prisma),
    );
    await reminders.handle();
    await reminders.handle();
    const found = await prisma.notification.findMany({
      where: { type: 'live.reminder', dedupeKey: { startsWith: `live:${session.id}` } },
    });
    expect(found).toHaveLength(1);
    expect(JSON.stringify(found)).not.toContain('secret.test');
    await prisma.liveSession.update({
      where: { id: session.id },
      data: { status: 'CANCELED', startsAt: new Date(Date.now() + 2400000) },
    });
    await reminders.handle();
    expect(
      await prisma.notification.count({
        where: { type: 'live.reminder', dedupeKey: { startsWith: `live:${session.id}` } },
      }),
    ).toBe(1);
  });
  it('scheduled content release scans use real availability and stable keys', async () => {
    await prisma.lesson.update({
      where: { id: lesson },
      data: { releaseType: 'ABSOLUTE', releaseAt: new Date(Date.now() - 1000) },
    });
    const task = new NotificationReleasesTask(
      prisma,
      notifications,
      new LearnerAccessPolicy(prisma),
    );
    await task.handle();
    await task.handle();
    expect(
      await prisma.notification.count({ where: { userId: learner, type: 'course.released' } }),
    ).toBe(1);
  });
  smtpIntegration('real SMTP sends exactly once to Mailpit under task replay', async () => {
    const realMail = new MailService(
      new ConfigService({
        SMTP_HOST: 'localhost',
        SMTP_PORT: 51025,
        SMTP_SECURE: false,
        SMTP_FROM: 'noreply@lms.test',
      }),
    );
    const recipient = await user(`Mailpit ${randomUUID()}`),
      u = await prisma.user.findUniqueOrThrow({ where: { id: recipient } });
    const title = `Engagement SMTP ${randomUUID()}`;
    await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: recipient,
        type: 'order.paid',
        dedupeKey: randomUUID(),
        title,
        body: 'Your payment is confirmed.',
        data: {},
      }),
    );
    const task = new NotificationDeliveryTask(prisma, realMail);
    try {
      await task.handle();
      await task.handle();
      const response = await fetch('http://localhost:58025/api/v1/messages');
      const data = (await response.json()) as {
        messages: { To: { Address: string }[]; Subject: string }[];
      };
      expect(
        data.messages.filter(
          (m) => m.Subject === title && m.To.some((to) => to.Address === u.email),
        ),
      ).toHaveLength(1);
    } finally {
      realMail.onModuleDestroy();
    }
  });
  it('renders and attaches a private PDF once on worker replay (mock object transport)', async () => {
    const e = await enrollment(true, await user('Renderer'));
    const id = await prisma.$transaction((tx) =>
      certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
    );
    const storage = {
      privateBucket: 'lms-private',
      createUploadUrl: async () => 'http://storage.test/upload',
    } as unknown as StorageService;
    const renderer = {
      render: jest.fn(async () => Buffer.from('%PDF-fixture')),
    } as unknown as CertificateRenderer;
    const task = new CertificateRenderTask(prisma, storage, renderer);
    const original = global.fetch;
    global.fetch = jest.fn(async () => new Response('', { status: 200 }));
    try {
      await Promise.all([task.handle(), task.handle()]);
      await task.handle();
      expect(renderer.render).toHaveBeenCalledTimes(1);
      const row = await prisma.certificate.findUniqueOrThrow({ where: { id } });
      expect(row.documentAssetId).not.toBeNull();
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: row.documentAssetId! } });
      expect(asset).toMatchObject({
        uploadedById: null,
        status: 'READY',
        visibility: 'PRIVATE',
        bucket: 'lms-private',
      });
    } finally {
      global.fetch = original;
    }
  });
  storageIntegration(
    'renders a real Unicode PDF into a private isolated MinIO bucket and signs owner download',
    async () => {
      const bucket = `engagement-test-${randomUUID()}`;
      const cfg = new ConfigService<Environment, true>({
        ...process.env,
        S3_PRIVATE_BUCKET: bucket,
        S3_PUBLIC_BUCKET: bucket,
        S3_FORCE_PATH_STYLE: true,
      });
      const s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
        },
      });
      const realStorage = new StorageService(cfg);
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      try {
        const recipient = await user('أحمد علي');
        const e = await enrollment(true, recipient);
        const id = await prisma.$transaction((tx) =>
          certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
        );
        const task = new CertificateRenderTask(prisma, realStorage, new CertificateRenderer());
        await task.handle();
        const row = await prisma.certificate.findUniqueOrThrow({ where: { id } });
        expect(row.documentAssetId).not.toBeNull();
        const asset = await prisma.asset.findUniqueOrThrow({ where: { id: row.documentAssetId! } });
        expect(asset.uploadedById).toBeNull();
        expect(asset.sizeBytes).toBeGreaterThan(1000n);
        const signer = new CertificatesService(
          prisma,
          new PolicyService(prisma),
          audit,
          outbox,
          realStorage,
          new ContentPagination(new ConfigService({ JWT_ACCESS_SECRET: 'test-key' })),
          results,
          notifications,
        );
        const signed = await signer.download(recipient, id);
        const response = await fetch(signed.data.url);
        expect(response.status).toBe(200);
        expect(
          Buffer.from(await response.arrayBuffer())
            .subarray(0, 5)
            .toString(),
        ).toBe('%PDF-');
        const unsigned = new URL(signed.data.url);
        unsigned.search = '';
        expect((await fetch(unsigned)).status).toBe(403);
      } finally {
        const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
        if (objects.Contents?.length)
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) },
            }),
          );
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
        realStorage.onModuleDestroy();
        s3.destroy();
      }
    },
    60000,
  );
  it('audits rerender once, preserves certificate identity and rejects tenant/TA recovery probes', async () => {
    const key = randomUUID();
    const before = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    await expect(
      certificates.requestRender(actor(ta), scope(), certificateId, key, 'test'),
    ).rejects.toThrow();
    await expect(
      certificates.requestRender(actor(outsider), scope(), certificateId, key, 'test'),
    ).rejects.toThrow();
    await certificates.requestRender(actor(owner), scope(), certificateId, key, 'test');
    await certificates.requestRender(actor(owner), scope(), certificateId, key, 'test');
    const after = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    expect(after).toMatchObject({
      id: before.id,
      verificationCode: before.verificationCode,
      status: before.status,
      documentAssetId: null,
    });
    expect(
      await prisma.auditLog.count({
        where: { resourceId: certificateId, action: 'certificate.render.requested' },
      }),
    ).toBe(1);
  });
  it('rate-limits public verification without requiring authentication', async () => {
    const row = await prisma.certificate.findUniqueOrThrow({ where: { id: certificateId } });
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++)
      statuses.push((await request('GET', `certificates/verify/${row.verificationCode}`)).status);
    expect(statuses).toContain(200);
    expect(statuses).toContain(429);
  });
  it('keeps mandatory mail enabled even for a stale database opt-out; optional queued mail honors a later opt-out', async () => {
    const recipient = await user('Preference race');
    await prisma.notificationPreference.createMany({
      data: [
        {
          workspaceId: ws,
          userId: recipient,
          type: 'order.paid',
          channel: 'EMAIL',
          enabled: false,
        },
        {
          workspaceId: ws,
          userId: recipient,
          type: 'assessment.graded',
          channel: 'EMAIL',
          enabled: true,
        },
      ],
    });
    const required = await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: recipient,
        type: 'order.paid',
        title: 'Paid',
        body: 'Payment confirmed',
        data: {},
        dedupeKey: 'required',
      }),
    );
    const optional = await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: recipient,
        type: 'assessment.graded',
        title: 'Graded',
        body: 'Result ready',
        data: {},
        dedupeKey: 'optional',
      }),
    );
    await prisma.notificationPreference.updateMany({
      where: { userId: recipient, type: 'assessment.graded' },
      data: { enabled: false },
    });
    await delivery.handle();
    expect(
      await prisma.notificationDelivery.findFirst({
        where: { notificationId: required!.id, channel: 'EMAIL' },
      }),
    ).toMatchObject({
      status: 'SENT',
      providerMessageId: expect.stringContaining('lms-delivery-'),
    });
    expect(
      await prisma.notificationDelivery.findFirst({
        where: { notificationId: optional!.id, channel: 'EMAIL' },
      }),
    ).toMatchObject({ status: 'SUPPRESSED' });
  });
  it('suppresses optional in-app messages and never exposes the hidden record through own reads', async () => {
    await notifications.replacePreferences(learner, {
      preferences: [
        { workspaceId: ws, type: 'assessment.graded', channel: 'IN_APP', enabled: false },
      ],
    });
    const row = await prisma.$transaction((tx) =>
      notifications.create(tx, {
        workspaceId: ws,
        userId: learner,
        type: 'assessment.graded',
        title: 'Graded',
        body: 'Result ready',
        data: {},
        dedupeKey: 'hidden-in-app',
      }),
    );
    expect(row!.deletedAt).not.toBeNull();
    expect(
      (await request('PATCH', `me/notifications/${row!.id}`, learner, { read: true })).status,
    ).toBe(404);
  });
  it('persists render failure, retries through an audited command and preserves frozen content', async () => {
    // Drain the intentional rerender queued in the recovery test, so this task targets one certificate.
    await prisma.certificate.update({
      where: { id: certificateId },
      data: {
        documentAssetId: (
          await prisma.asset.findFirstOrThrow({
            where: { workspaceId: ws, mimeType: 'application/pdf' },
          })
        ).id,
      },
    });
    const recipient = await user('Retry renderer'),
      e = await enrollment(true, recipient);
    const id = await prisma.$transaction((tx) =>
      certificates.issueInTx(tx, scope(), e.id, template, null, 'test'),
    );
    const storage = {
      privateBucket: 'lms-private',
      createUploadUrl: async () => 'http://storage.test/upload',
    } as unknown as StorageService;
    const render = jest
      .fn()
      .mockRejectedValueOnce(new Error('Failed secret must not escape'))
      .mockResolvedValue(Buffer.from('%PDF-recovered'));
    const task = new CertificateRenderTask(prisma, storage, {
      render,
    } as unknown as CertificateRenderer);
    const original = global.fetch;
    global.fetch = jest.fn(async () => new Response('', { status: 200 }));
    try {
      await task.handle();
      const failed = await certificates.own(recipient, id);
      expect(failed.documentAssetId).toBeNull();
      expect(failed.templateSnapshot).toMatchObject({ renderFailed: true });
      await task.handle();
      expect(render).toHaveBeenCalledTimes(1);
      await certificates.requestRender(actor(owner), scope(), id, randomUUID(), 'test');
      await task.handle();
      const recovered = await certificates.own(recipient, id);
      expect(recovered.documentAssetId).not.toBeNull();
      expect(recovered.templateSnapshot).not.toHaveProperty('renderFailed');
      expect(recovered.templateSnapshot).toMatchObject({
        issuerName: 'Academy',
        layout: { title: 'Certificate' },
      });
    } finally {
      global.fetch = original;
    }
  });
  it('consumes live-session changes with tenant/cohort recipient scoping and no meeting capabilities', async () => {
    const session = await prisma.liveSession.findFirstOrThrow({ where: { workspaceId: ws } });
    const event = await outbox.append(prisma, {
      type: 'content.live-session.changed.v1',
      workspaceId: ws,
      aggregateType: 'LiveSession',
      aggregateId: session.id,
      payload: { courseId: course, sessionId: session.id },
    });
    await runner.deliver({ eventId: event.id, consumer: 'notifications.domain' });
    await runner.deliver({ eventId: event.id, consumer: 'notifications.domain' });
    const notices = await prisma.notification.findMany({
      where: { dedupeKey: { startsWith: `session-change:${session.id}` } },
    });
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n) => n.workspaceId === ws && n.userId !== outsider)).toBe(true);
    expect(JSON.stringify(notices)).not.toMatch(/secret.test|hostUrl|joinUrl/);
    const repeated = await outbox.append(prisma, {
      type: 'content.live-session.changed.v1',
      workspaceId: ws,
      aggregateType: 'LiveSession',
      aggregateId: session.id,
      payload: { courseId: course, sessionId: session.id },
    });
    await runner.deliver({ eventId: repeated.id, consumer: 'notifications.domain' });
    expect(
      await prisma.notification.count({
        where: { dedupeKey: { startsWith: `session-change:${session.id}` } },
      }),
    ).toBe(notices.length);
  });
  it('marks an expired final SMTP lease failed without sending another message', async () => {
    const row = await prisma.notificationDelivery.findFirstOrThrow({ where: { channel: 'EMAIL' } });
    await prisma.notificationDelivery.update({
      where: { id: row.id },
      data: { status: 'SENDING', attempts: 8, nextAttemptAt: new Date(0) },
    });
    await delivery.handle();
    expect(await prisma.notificationDelivery.findUnique({ where: { id: row.id } })).toMatchObject({
      status: 'FAILED',
      attempts: 8,
      lastError: 'Delivery lease expired after final attempt',
    });
  });
});
