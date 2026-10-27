import { Prisma } from '@prisma/client';
import 'reflect-metadata';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { ContentPublicationService } from './publication.service';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentModule } from './content.module';
import { MediaModule } from '../media/media.module';
import { Pool } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { ContentSupport, ContentPagination, type Actor } from './content.support';
import { ContentService } from './content.service';
import { CohortCapacityService } from './cohort-capacity.service';
import { CatalogService } from '../catalog/catalog.service';
import { MediaService } from '../media/media.service';
import { MediaStorageService } from '../media/media-storage.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PublicCoverTask } from '../media/public-cover.task';
import { MediaProcessingTask } from '../media/media-processing.task';
import {
  courseResponseSchema,
  catalogCourseResponseSchema,
  previewLessonResponseSchema,
  lessonCreateSchema,
  type AccessPolicy,
} from '@lms/shared';

const integration = process.env.CONTENT_TEST_DATABASE_URL ? describe : describe.skip;
integration('Content isolated PostgreSQL + object storage', () => {
  const name = `lms_content_test_${randomUUID().replaceAll('-', '')}`;
  let s3: S3Client;
  let app: INestApplication;
  let baseUrl: string;
  let bearer: string;
  let admin: Pool;
  let prisma: PrismaService;
  let content: ContentService;
  let catalog: CatalogService;
  let support: ContentSupport;
  let capacity: CohortCapacityService;
  let media: MediaService;
  let objects: MediaStorageService;
  let storage: StorageService;
  let config: ConfigService;
  const clean = { scan: jest.fn().mockResolvedValue('CLEAN') };
  const access: AccessPolicy = {
    evaluate: jest
      .fn()
      .mockResolvedValue({ allowed: false, reason: 'ACCESS_EXPIRED', unlockAt: null }),
  };
  let owner: Actor;
  let ta: Actor;
  let workspaceId: string;
  let courseId: string;
  let sectionId: string;
  const scope = () => ({ workspaceId, courseId });
  const text = (position = 0) =>
    lessonCreateSchema.parse({
      title: 'Lesson',
      position,
      isRequired: true,
      isPreview: true,
      isPublished: true,
      estimatedMinutes: 5,
      completionRule: 'ACKNOWLEDGE',
      requiredWatchPercent: 90,
      release: { releaseType: 'IMMEDIATE' },
      payload: {
        type: 'TEXT',
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Safe lesson' }] }],
        },
      },
    });
  async function user() {
    return prisma.user.create({
      data: { email: `${randomUUID()}@example.test`, name: 'Test learner' },
    });
  }
  async function anotherCourse() {
    const row = await catalog.create(owner, workspaceId, {
      slug: `course-${randomUUID()}`,
      title: 'Other course',
      summary: 'Summary',
      description: { type: 'doc', content: [] },
      visibility: 'PUBLIC',
      deliveryMode: 'SELF_PACED',
      language: 'en',
      isFree: true,
      estimatedMinutes: 0,
    });
    return row.id;
  }
  beforeAll(async () => {
    const url = new URL(process.env.CONTENT_TEST_DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432')
      throw new Error('Tests require local LMS postgres on 55432');
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = `/${name}`;
    url.search = '';
    const bootstrap = new Pool({ connectionString: url.toString() });
    try {
      await bootstrap.query(
        readFileSync(resolve('prisma/migrations/20261026000000_initial/migration.sql'), 'utf8'),
      );
    } finally {
      await bootstrap.end();
    }
    const env = parse(readFileSync(resolve('../../.env')));
    config = new ConfigService({
      ...env,
      DATABASE_URL: url.toString(),
      JWT_ACCESS_SECRET: 'content-test-cursor-secret-at-least-32-chars',
      S3_PRIVATE_BUCKET: name.replaceAll('_', '-'),
      S3_PUBLIC_BUCKET: name.replaceAll('_', '-') + '-public',
      S3_FORCE_PATH_STYLE: true,
    });
    prisma = new PrismaService(config as never);
    await prisma.$connect();
    const policy = new PolicyService(prisma);
    support = new ContentSupport(
      prisma,
      policy,
      new AuditService(prisma, { nodeEnv: 'test' }),
      new ContentPublicationService(),
    );
    capacity = new CohortCapacityService();
    const pages = new ContentPagination(config);
    content = new ContentService(support, capacity, config, pages, access);
    catalog = new CatalogService(
      support,
      pages,
      new OutboxService(new SharedEventContracts()),
      new ContentPublicationService(),
      config,
    );
    s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
    await s3.send(new CreateBucketCommand({ Bucket: config.getOrThrow('S3_PRIVATE_BUCKET') }));
    await s3.send(new CreateBucketCommand({ Bucket: config.getOrThrow('S3_PUBLIC_BUCKET') }));
    storage = new StorageService(config as never);
    objects = new MediaStorageService(config, storage);
    media = new MediaService(support, objects, config, access);
    owner = await user();
    ta = await user();
    const w = await prisma.workspace.create({
      data: {
        kind: 'ACADEMY',
        name: 'Content tests',
        slug: randomUUID(),
        ownerId: owner.id,
      },
    });
    workspaceId = w.id;
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: owner.id, role: 'ADMIN' },
        { workspaceId, userId: ta.id, role: 'TEACHING_ASSISTANT' },
      ],
    });
    const testModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CatalogModule,
        ContentModule,
        MediaModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = testModule.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const session = await prisma.refreshSession.create({
      data: {
        userId: owner.id,
        familyId: randomUUID(),
        tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    bearer = await app.get(JwtService).signAsync(
      { sub: owner.id, sid: session.id, fid: session.familyId, jti: randomUUID() },
      {
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: 600,
        issuer: 'lms-api',
        audience: 'lms-web',
        algorithm: 'HS256',
      },
    );
  }, 30000);
  afterAll(async () => {
    let cleanupError: unknown;
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch (error) {
        cleanupError ??= error;
      }
    };
    if (app) await attempt(() => app.close());
    if (s3 && config) {
      for (const bucket of [
        config.getOrThrow<string>('S3_PRIVATE_BUCKET'),
        config.getOrThrow<string>('S3_PUBLIC_BUCKET'),
      ]) {
        await attempt(async () => {
          let token: string | undefined;
          do {
            const listed = await s3.send(
              new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }),
            );
            if (listed.Contents?.length)
              await s3.send(
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key! })), Quiet: true },
                }),
              );
            token = listed.NextContinuationToken;
          } while (token);
          await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
        });
      }
      s3.destroy();
    }
    objects?.onModuleDestroy();
    storage?.onModuleDestroy();
    if (prisma) await attempt(() => prisma.$disconnect());
    if (admin) {
      await attempt(() => admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
      await attempt(() => admin.end());
    }
    if (cleanupError) throw cleanupError;
  }, 30000);
  beforeEach(async () => {
    courseId = await anotherCourse();
    const section = await content.section(owner, scope(), { title: 'Section', position: 0 });
    sectionId = section!.id;
  });
  it('boots real modules and enforces HTTP authentication, UUID/body validation, envelopes and OpenAPI paths', async () => {
    const prefix = `${baseUrl}/api/v1/workspaces/${workspaceId}/courses/${courseId}`;
    expect((await fetch(`${prefix}/sections`)).status).toBe(401);
    const headers = { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
    const response = await fetch(`${prefix}/sections/${sectionId}/lessons`, {
      method: 'POST',
      headers,
      body: JSON.stringify(text()),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: string } };
    expect(body.data.id).toBeDefined();
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(
      (
        await fetch(`${prefix}/sections/${sectionId}/lessons`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...text(1), script: 'unsafe' }),
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${baseUrl}/api/v1/catalog/courses/not-a-uuid`)).status).toBe(400);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Content').setVersion('1').build(),
    );
    expect(
      doc.paths['/api/v1/workspaces/{workspaceId}/courses/{courseId}/sections/{sectionId}/lessons'],
    ).toBeDefined();
    expect(
      doc.paths[
        '/api/v1/me/enrollments/{enrollmentId}/lessons/{lessonId}/assets/{assetId}/download'
      ],
    ).toBeDefined();
  });
  it('requires the explicit assessment publication validator and correct lesson/assessment kinds', async () => {
    const l = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      completionRule: 'ASSESSMENT_PASS',
      payload: { type: 'QUIZ', body: {} },
    });
    await prisma.assessment.create({
      data: { ...scope(), lessonId: l.id, kind: 'QUIZ', title: 'Quiz' },
    });
    await expect(catalog.transition(owner, scope(), 'publish', 1)).rejects.toMatchObject({
      status: 503,
    });
    const validateCourse = jest.fn().mockResolvedValue(undefined);
    const withHook = new CatalogService(
      support,
      new ContentPagination(config),
      new OutboxService(new SharedEventContracts()),
      new ContentPublicationService({ validateCourse }),
    );
    await withHook.transition(owner, scope(), 'publish', 1);
    expect(validateCourse).toHaveBeenCalledTimes(1);
    await expect(media.previewLesson(courseId, l.id)).rejects.toMatchObject({ status: 404 });
  });
  it('enforces active TA flags and canonical tenant scope', async () => {
    await prisma.courseStaff.create({
      data: {
        ...scope(),
        userId: ta.id,
        role: 'TEACHING_ASSISTANT',
        canGrade: true,
        canEditContent: false,
      },
    });
    await expect(content.createLesson(ta, scope(), sectionId, text())).rejects.toMatchObject({
      status: 404,
    });
    await expect(content.outline(ta, scope())).resolves.toHaveLength(1);
    await prisma.courseStaff.update({
      where: { courseId_userId: { courseId, userId: ta.id } },
      data: { canEditContent: true },
    });
    await expect(content.createLesson(ta, scope(), sectionId, text())).resolves.toHaveProperty(
      'id',
    );
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: ta.id } },
      data: { status: 'SUSPENDED' },
    });
    await expect(content.outline(ta, scope())).rejects.toMatchObject({ status: 404 });
    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: ta.id } },
      data: { status: 'ACTIVE' },
    });
    await expect(
      content.outline(owner, { workspaceId: randomUUID(), courseId }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('rejects cross-course parents and atomically resolves optimistic edit contention', async () => {
    await expect(
      content.createLesson(
        owner,
        { workspaceId, courseId: await anotherCourse() },
        sectionId,
        text(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    const l = await content.createLesson(owner, scope(), sectionId, text());
    const results = await Promise.allSettled([
      content.updateLesson(owner, scope(), l.id, { version: 1, title: 'One' }),
      content.updateLesson(owner, scope(), l.id, { version: 1, title: 'Two' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: l.id } })).version).toBe(2);
  });
  it('serializes graph edits so two individually valid concurrent edges cannot create a cycle', async () => {
    const a = await content.createLesson(owner, scope(), sectionId, text(0));
    const b = await content.createLesson(owner, scope(), sectionId, text(1));
    const results = await Promise.allSettled([
      content.prerequisites(owner, scope(), a.id, [b.id]),
      content.prerequisites(owner, scope(), b.id, [a.id]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(content.prerequisites(owner, scope(), a.id, [randomUUID()])).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it('reorders siblings without unique collisions and rolls back incomplete input', async () => {
    const a = await content.createLesson(owner, scope(), sectionId, text(0));
    const b = await content.createLesson(owner, scope(), sectionId, text(1));
    await content.reorder(owner, scope(), [b.id, a.id], sectionId);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: b.id } })).position).toBe(0);
    await expect(content.reorder(owner, scope(), [b.id], sectionId)).rejects.toMatchObject({
      status: 400,
    });
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: a.id } })).position).toBe(1);
  });
  it('resolves exact public slugs and refuses ambiguous, hidden and suspended matches', async () => {
    const original = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await expect(catalog.publicCourseBySlug(original.slug, ws.slug)).rejects.toMatchObject({
      status: 404,
    });
    await prisma.course.update({
      where: { id: courseId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    expect((await catalog.publicCourseBySlug(original.slug, ws.slug)).id).toBe(courseId);
    expect(
      (
        await fetch(
          `${baseUrl}/api/v1/catalog/courses/by-slug/${original.slug}?workspace=${ws.slug}`,
        )
      ).status,
    ).toBe(200);
    const otherWorkspace = await prisma.workspace.create({
      data: {
        name: 'Other slug tenant',
        slug: `other-${randomUUID()}`,
        ownerId: owner.id,
        kind: 'ACADEMY',
      },
    });
    const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = original;
    const duplicate = await prisma.course.create({
      data: {
        ...copy,
        workspaceId: otherWorkspace.id,
        status: 'PUBLISHED',
        description: original.description as Prisma.InputJsonValue,
        publishedAt: new Date(),
      },
    });
    await expect(catalog.publicCourseBySlug(original.slug)).rejects.toMatchObject({ status: 404 });
    expect((await catalog.publicCourseBySlug(original.slug, otherWorkspace.slug)).id).toBe(
      duplicate.id,
    );
    await prisma.course.update({ where: { id: duplicate.id }, data: { visibility: 'UNLISTED' } });
    await expect(
      catalog.publicCourseBySlug(original.slug, otherWorkspace.slug),
    ).rejects.toMatchObject({ status: 404 });
    await prisma.workspace.update({
      where: { id: otherWorkspace.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      catalog.publicCourseBySlug(original.slug, otherWorkspace.slug),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('publishes safe course DTOs once with outbox and prevents preview escape', async () => {
    const l = await content.createLesson(owner, scope(), sectionId, text());
    const row = await catalog.transition(owner, scope(), 'publish', 1);
    expect(courseResponseSchema.safeParse({ data: row }).success).toBe(true);
    expect(
      catalogCourseResponseSchema.safeParse({ data: await catalog.publicCourse(courseId) }).success,
    ).toBe(true);
    expect(
      previewLessonResponseSchema.safeParse({ data: await media.previewLesson(courseId, l.id) })
        .success,
    ).toBe(true);
    await catalog.transition(owner, scope(), 'publish', row.version);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateId: courseId, type: 'course.published.v1' },
      }),
    ).toBe(1);
    await expect(media.publicDownload(courseId, l.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    await prisma.enrollment.create({ data: { ...scope(), userId: (await user()).id } });
    await expect(
      content.updateLesson(owner, scope(), l.id, { version: 1, isPublished: false }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not publish video without ready assets or paid courses without prices', async () => {
    await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'VIDEO', body: {} },
    });
    await expect(catalog.transition(owner, scope(), 'publish', 1)).rejects.toMatchObject({
      status: 400,
    });
    expect((await prisma.course.findUniqueOrThrow({ where: { id: courseId } })).status).toBe(
      'DRAFT',
    );
    expect(await prisma.outboxEvent.count({ where: { aggregateId: courseId } })).toBe(0);
  });
  it('exposes capacity reservation under row locks: exactly one contender gets the final seat', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { deliveryMode: 'COHORT' } });
    const cohort = await content.cohort(owner, scope(), {
      name: 'One seat',
      startsAt: new Date().toISOString(),
      endsAt: null,
      enrollmentOpensAt: null,
      enrollmentClosesAt: null,
      capacity: 1,
      isPublished: true,
      timezone: 'UTC',
    });
    const users = await Promise.all([user(), user()]);
    const results = await Promise.allSettled(
      users.map((u) =>
        prisma.$transaction((tx) =>
          capacity.reserve(tx, { ...scope(), cohortId: cohort.id }, () =>
            tx.enrollment.create({ data: { ...scope(), cohortId: cohort.id, userId: u.id } }),
          ),
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date())).toBe(1);
    await expect(
      content.cohort(owner, scope(), { capacity: 1 }, cohort.id),
    ).resolves.toHaveProperty('capacity', 1);
  });
  it('counts order reservations through the paid-to-fulfillment gap and excludes their conversion', async () => {
    await prisma.course.update({ where: { id: courseId }, data: { deliveryMode: 'COHORT' } });
    const cohort = await content.cohort(owner, scope(), {
      name: 'Order seats',
      startsAt: new Date().toISOString(),
      endsAt: null,
      enrollmentOpensAt: null,
      enrollmentClosesAt: null,
      capacity: 2,
      isPublished: true,
      timezone: 'UTC',
    });
    const learner = await user();
    const product = await prisma.product.create({
      data: { workspaceId, type: 'COURSE', slug: `prod-${randomUUID()}`, name: 'Course product' },
    });
    const price = await prisma.price.create({
      data: { workspaceId, productId: product.id, currency: 'usd', amount: 100 },
    });
    const order = await prisma.order.create({
      data: {
        workspaceId,
        userId: learner.id,
        number: randomUUID(),
        currency: 'usd',
        subtotal: 100,
        grandTotal: 100,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        workspaceId,
        orderId: order.id,
        productId: product.id,
        priceId: price.id,
        unitAmount: 100,
        totalAmount: 100,
        productSnapshot: {},
        entitlementSnapshot: {},
      },
    });
    await prisma.orderItemCourse.create({
      data: { ...scope(), orderItemId: item.id, cohortId: cohort.id },
    });
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date())).toBe(1);
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date(Date.now() + 120000))).toBe(
      0,
    );
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date())).toBe(1);
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date(), order.id)).toBe(0);
    await prisma.enrollment.create({
      data: { ...scope(), userId: learner.id, cohortId: cohort.id },
    });
    expect(await capacity.occupied(prisma, scope(), cohort.id, new Date())).toBe(1);
  });
  it('supports real multipart upload signing and completion with ordered ETags', async () => {
    const l = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'VIDEO', body: {} },
    });
    const bytes = Buffer.alloc(16777216 + 1024, 1);
    bytes.write('ftyp', 4);
    const upload = await media.upload(
      owner,
      workspaceId,
      {
        purpose: 'PRIMARY_VIDEO',
        parentId: l.id,
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        sizeBytes: String(bytes.length),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      },
      true,
    );
    const parts: { partNumber: number; etag: string }[] = [];
    for (const partNumber of [1, 2]) {
      const signed = await media.part(owner, workspaceId, upload.assetId, partNumber);
      const response = await fetch(signed.url, {
        method: 'PUT',
        body: bytes.subarray((partNumber - 1) * 16777216, partNumber * 16777216),
      });
      expect(response.ok).toBe(true);
      parts.push({ partNumber, etag: response.headers.get('etag')! });
    }
    await media.complete(owner, workspaceId, upload.assetId, { parts });
    expect((await media.poll(owner, workspaceId, upload.assetId)).status).toBe('SCANNING');
    await media.complete(owner, workspaceId, upload.assetId, { parts });
  }, 30000);
  it('denies signing before invoking object storage for expired access or wrong relationship', async () => {
    const l = await content.createLesson(owner, scope(), sectionId, text());
    const learner = await user();
    const e = await prisma.enrollment.create({ data: { ...scope(), userId: learner.id } });
    await expect(media.learnerDownload(learner, e.id, l.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    await expect(media.evaluate(learner, workspaceId, e.id, l.id)).rejects.toMatchObject({
      status: 404,
    });
    const absent = new MediaService(support, objects, config);
    await expect(absent.evaluate(learner, workspaceId, e.id, l.id)).rejects.toMatchObject({
      status: 503,
    });
  });
  it('rechecks current access when a short-lived live join capability is redeemed', async () => {
    const lesson = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'LIVE_SESSION', body: {} },
    });
    const session = await prisma.liveSession.create({
      data: {
        ...scope(),
        lessonId: lesson.id,
        title: 'Live',
        provider: 'custom',
        joinUrl: 'https://meeting.example.test/join/private',
        startsAt: new Date(Date.now() - 60000),
        endsAt: new Date(Date.now() + 3600000),
      },
    });
    const learner = await user();
    const enrollment = await prisma.enrollment.create({ data: { ...scope(), userId: learner.id } });
    (access.evaluate as jest.Mock).mockResolvedValueOnce({ allowed: true, expiresAt: null });
    const capability = await media.join(learner, enrollment.id, session.id);
    expect(capability.url).not.toContain('meeting.example.test');
    await expect(
      media.redeemJoin(new URL(capability.url).searchParams.get('capability')!),
    ).rejects.toMatchObject({ status: 404 });
    await expect(media.join(owner, enrollment.id, session.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rolls back live-session scheduling until the frozen durable notification event is integrated', async () => {
    const lesson = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'LIVE_SESSION', body: {} },
    });
    await expect(
      content.session(
        owner,
        scope(),
        {
          title: 'Live',
          provider: 'custom',
          joinUrl: 'https://meeting.example.test/join/private',
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3600000).toISOString(),
        },
        lesson.id,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(await prisma.liveSession.count({ where: { ...scope(), lessonId: lesson.id } })).toBe(0);
    config.set('CONTENT_HOST_KEY', 'a'.repeat(64));
    const encrypted = content.encryptHost('https://meeting.example.test/host/private');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(encrypted).not.toContain('meeting');
  });
  it('rejects mismatched actual size, spoofed MIME and infected media before READY', async () => {
    const lesson = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'DOCUMENT', body: {} },
    });
    for (const code of ['SIZE_MISMATCH', 'MIME_MISMATCH', 'MALWARE'] as const) {
      const bytes = Buffer.from(
        code === 'MIME_MISMATCH' ? '<html>not a PDF</html>' : '%PDF-1.7 test',
      );
      const upload = await media.upload(owner, workspaceId, {
        purpose: 'PRIMARY_DOCUMENT',
        parentId: lesson.id,
        filename: 'check.pdf',
        mimeType: 'application/pdf',
        sizeBytes: String(bytes.length + (code === 'SIZE_MISMATCH' ? 1 : 0)),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      if (!('url' in upload) || !upload.url) throw new Error('Single URL required');
      expect(
        (await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes })).ok,
      ).toBe(true);
      await media.complete(owner, workspaceId, upload.assetId);
      await new MediaProcessingTask(prisma, objects, {
        scan: async () => (code === 'MALWARE' ? 'INFECTED' : 'CLEAN'),
      }).process(upload.assetId, workspaceId);
      const result = await media.poll(owner, workspaceId, upload.assetId);
      expect(result.status).toBe('REJECTED');
      expect(result.rejectionCode).toBe(code);
      await expect(
        content.attach(owner, scope(), lesson.id, {
          assetId: upload.assetId,
          purpose: 'PRIMARY_DOCUMENT',
          position: 0,
        }),
      ).rejects.toMatchObject({ status: 404 });
    }
  }, 30000);
  it('publishes a verified course cover as a separate public object and returns only an HTTPS marketing URL', async () => {
    await content.createLesson(owner, scope(), sectionId, text());
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = await media.upload(owner, workspaceId, {
      purpose: 'COURSE_COVER',
      parentId: courseId,
      filename: 'cover.png',
      mimeType: 'image/png',
      sizeBytes: String(bytes.length),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    if (!('url' in upload) || !upload.url) throw new Error('Single URL required');
    expect(
      (await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes })).ok,
    ).toBe(true);
    await media.complete(owner, workspaceId, upload.assetId);
    await new MediaProcessingTask(prisma, objects, clean).process(upload.assetId, workspaceId);
    expect(
      (await prisma.asset.findUniqueOrThrow({ where: { id: upload.assetId } })).visibility,
    ).toBe('PRIVATE');
    await catalog.update(owner, scope(), { version: 1, coverId: upload.assetId });
    await catalog.transition(owner, scope(), 'publish', 2);
    await new PublicCoverTask(
      prisma,
      objects,
      new AuditService(prisma, { nodeEnv: 'test' }),
    ).process(workspaceId, courseId, upload.assetId);
    const original = await prisma.asset.findUniqueOrThrow({ where: { id: upload.assetId } });
    expect(original.visibility).toBe('PRIVATE');
    const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    const approved = await prisma.asset.findUniqueOrThrow({ where: { id: course.coverId! } });
    const key = approved.objectKey;
    expect(approved.visibility).toBe('PUBLIC');
    expect(key).toContain('marketing/');
    expect(
      (
        await s3.send(
          new HeadObjectCommand({ Bucket: config.getOrThrow('S3_PUBLIC_BUCKET'), Key: key }),
        )
      ).ContentLength,
    ).toBe(bytes.length);
    config.set('CONTENT_PUBLIC_ORIGIN', 'https://cdn.example.test');
    const c = await catalog.publicCourse(courseId);
    expect(c.coverUrl).toBe(`https://cdn.example.test/${key}`);
    expect(c.coverUrl).not.toContain('X-Amz-');
    expect(
      (await catalog.listPublic({ limit: 20, sort: 'publishedAt' })).data.find(
        (r) => r.id === courseId,
      )?.coverUrl,
    ).toBe(c.coverUrl);
  }, 30000);
  it('probes and transcodes real video into private HLS derivatives when ffmpeg is installed', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'content-video-'));
    try {
      const path = resolve(dir, 'source.mp4');
      await promisify(execFile)(
        'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=size=320x240:rate=5',
          '-t',
          '1',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          path,
        ],
        { timeout: 30000 },
      );
      const bytes = await readFile(path);
      const l = await content.createLesson(owner, scope(), sectionId, {
        ...text(),
        isPreview: false,
        payload: { type: 'VIDEO', body: {} },
      });
      const upload = await media.upload(owner, workspaceId, {
        purpose: 'PRIMARY_VIDEO',
        parentId: l.id,
        filename: 'clip.mp4',
        mimeType: 'video/mp4',
        sizeBytes: String(bytes.length),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
      if (!('url' in upload) || !upload.url) throw new Error('Single URL required');
      expect(
        (await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes })).ok,
      ).toBe(true);
      await media.complete(owner, workspaceId, upload.assetId);
      await new MediaProcessingTask(prisma, objects, clean).process(upload.assetId, workspaceId);
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: upload.assetId } });
      expect(asset.status).toBe('READY');
      const processing = (
        asset.metadata as { processing: { mode: string; hlsKeys: string[]; thumbnailKey: string } }
      ).processing;
      expect(processing.mode).toBe('PROGRESSIVE');
      expect(processing.hlsKeys.some((k) => k.endsWith('.m3u8'))).toBe(true);
      expect(processing.hlsKeys.some((k) => k.endsWith('.ts'))).toBe(true);
      expect(processing.thumbnailKey).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
  it('verifies real object bytes and promotes immutable clean PDFs; rejects checksum corruption', async () => {
    const l = await content.createLesson(owner, scope(), sectionId, {
      ...text(),
      isPreview: false,
      payload: { type: 'DOCUMENT', body: {} },
    });
    const bytes = Buffer.from('%PDF-1.7\ncontent-test\n%%EOF');
    for (const valid of [true, false]) {
      const upload = await media.upload(owner, workspaceId, {
        purpose: 'PRIMARY_DOCUMENT',
        parentId: l.id,
        filename: 'lesson.pdf',
        mimeType: 'application/pdf',
        sizeBytes: String(bytes.length),
        sha256: valid ? createHash('sha256').update(bytes).digest('hex') : '0'.repeat(64),
      });
      if (!('url' in upload) || !upload.url) throw new Error('Expected single upload');
      const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: bytes });
      if (!put.ok) throw new Error(await put.text());
      await media.complete(owner, workspaceId, upload.assetId);
      const before = await prisma.asset.findUniqueOrThrow({ where: { id: upload.assetId } });
      await new MediaProcessingTask(prisma, objects, clean).process(upload.assetId, workspaceId);
      const after = await prisma.asset.findUniqueOrThrow({ where: { id: upload.assetId } });
      expect(after.status).toBe(valid ? 'READY' : 'REJECTED');
      if (valid) {
        expect(after.objectKey).not.toBe(before.objectKey);
        expect(after.objectKey.startsWith('verified/')).toBe(true);
        await content.attach(owner, scope(), l.id, {
          assetId: after.id,
          purpose: 'PRIMARY_DOCUMENT',
          position: 0,
        });
        const capability = await media.staffDownload(owner, scope(), l.id, after.id);
        expect(new URL(capability.url).searchParams.get('X-Amz-Expires')).toBe('60');
        const download = await fetch(capability.url);
        expect(download.ok).toBe(true);
        expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
        expect(download.headers.get('content-disposition')).toContain('attachment');
      } else
        expect((after.metadata as { rejectionCode: string }).rejectionCode).toBe(
          'CHECKSUM_MISMATCH',
        );
    }
  }, 30000);
});
