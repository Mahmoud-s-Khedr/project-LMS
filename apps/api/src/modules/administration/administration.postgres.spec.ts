import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { JWT_AUDIENCE, JWT_ISSUER } from '../../common/authz/auth.types';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { EnrollmentGrantService } from '../learning/enrollment-grant.service';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { CohortCapacityService } from '../content/cohort-capacity.service';
import { PolicyService } from '../../common/authz/policy.service';
import { AdministrationModule } from './administration.module';
import { workspaceEtag } from './administration.service';
import {
  adminWorkspacesResponseSchema,
  auditLogsResponseSchema,
  operationsEventsResponseSchema,
  webhooksResponseSchema,
  replayAcceptedResponseSchema,
} from '@lms/shared';

const suite = process.env.ADMINISTRATION_TEST_DATABASE_URL ? describe : describe.skip;
suite('Administration PostgreSQL and authenticated HTTP', () => {
  const schema = `administration_test_${randomUUID().replaceAll('-', '')}`;
  const secret = 'administration-test-jwt-secret-at-least-32-characters';
  let pool: Pool;
  let db: PrismaClient;
  let app: INestApplication;
  let base: string;
  let sa: string;
  let admin: string;
  let student: string;
  let ownerId: string;
  let w: string;
  let other: string;
  const reason = 'Investigate and recover failed processing';
  async function identity(role: 'STUDENT' | 'SUPER_ADMIN' = 'STUDENT') {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        name: 'Operations tester',
        passwordHash: 'unused',
        platformRole: role,
      },
    });
    const session = await db.refreshSession.create({
      data: {
        userId: user.id,
        familyId: randomUUID(),
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const token = await app
      .get(JwtService)
      .signAsync(
        { sub: user.id, sid: session.id, fid: session.familyId, jti: randomUUID() },
        { secret, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 600 },
      );
    return { user, token };
  }
  async function call(
    path: string,
    token: string | undefined = sa,
    method = 'GET',
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    return fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function event(workspaceId: string | null = w, type = 'course.published.v1') {
    return db.outboxEvent.create({
      data: {
        workspaceId,
        type,
        aggregateType: 'Course',
        aggregateId: randomUUID(),
        payload: { courseId: randomUUID() },
        status: 'DEAD',
        lastError: 'secret sk_test_secret and learner@example.test',
      },
    });
  }
  async function webhook() {
    return db.stripeWebhook.create({
      data: {
        stripeEventId: `evt_${randomUUID()}`,
        type: 'invoice.paid',
        stripeCreatedAt: new Date(),
        livemode: false,
        payload: { signedEvidence: 'never replace me' },
        status: 'FAILED',
        attempts: 20,
        lastError: 'private provider detail',
      },
    });
  }
  beforeAll(async () => {
    const connectionString = process.env.ADMINISTRATION_TEST_DATABASE_URL!;
    pool = new Pool({ connectionString, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}"`);
    const migrations = join(__dirname, '../../../prisma/migrations');
    for (const entry of readdirSync(migrations).sort()) {
      if (/^\d/.test(entry))
        await pool.query(
          readFileSync(join(migrations, entry, 'migration.sql'), 'utf8').replace(
            'CREATE SCHEMA IF NOT EXISTS "public";',
            '',
          ),
        );
    }
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}`, max: 10 },
        { schema },
      ),
    });
    await db.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: secret })],
        }),
        AdministrationModule,
        AuditModule,
        EventsProducerModule,
      ],
      providers: [EnrollmentGrantService, LearnerAccessPolicy, CohortCapacityService],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    sa = (await identity('SUPER_ADMIN')).token;
    const owner = await identity();
    admin = owner.token;
    ownerId = owner.user.id;
    student = (await identity()).token;
    for (const name of ['first', 'second']) {
      const workspace = await db.workspace.create({
        data: { name, slug: `${name}-${randomUUID()}`, kind: 'ACADEMY', ownerId },
      });
      if (name === 'first') w = workspace.id;
      else other = workspace.id;
    }
    await db.workspaceMember.create({ data: { workspaceId: w, userId: ownerId, role: 'ADMIN' } });
  }, 60000);
  afterAll(async () => {
    if (app) await app.close();
    if (db) await db.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  });

  it('requires live identity and platform privilege for inventory, mutation and webhook operations', async () => {
    expect((await call('/admin/workspaces', '')).status).toBe(401);
    for (const path of ['/admin/workspaces', '/admin/webhooks'])
      expect((await call(path, admin)).status).toBe(403);
    expect(
      (
        await call(`/admin/workspaces/${w}`, admin, 'PATCH', {
          status: 'ACTIVE',
          suspendedAt: null,
          reason,
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(`/admin/webhooks/${randomUUID()}/replay`, admin, 'POST', { reason })).status,
    ).toBe(403);
    const retired = await identity('SUPER_ADMIN');
    await db.user.update({ where: { id: retired.user.id }, data: { status: 'SUSPENDED' } });
    expect((await call('/admin/workspaces', retired.token)).status).toBe(401);
    const response = await call('/admin/workspaces?search=first');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(
      adminWorkspacesResponseSchema.parse(await response.json()).data.map((row) => row.id),
    ).toEqual([w]);
  });

  it('enforces tenant roles and redacts audit and event diagnostics with scope-bound pagination', async () => {
    await event(other);
    await event();
    await event();
    await db.auditLog.create({
      data: {
        workspaceId: w,
        actorId: ownerId,
        action: 'test.safe',
        resourceType: 'Workspace',
        resourceId: w,
        requestId: 'test',
        changes: { password: 'private', fields: ['status'], reason },
      },
    });
    for (const suffix of ['audit-logs', 'operations/events']) {
      expect((await call(`/workspaces/${other}/${suffix}`, admin)).status).toBe(404);
      expect((await call(`/workspaces/${w}/${suffix}`, student)).status).toBe(404);
    }
    const audit = auditLogsResponseSchema.parse(
      await (await call(`/workspaces/${w}/audit-logs`, admin)).json(),
    );
    expect(JSON.stringify(audit)).not.toContain('private');
    expect(audit.data.every((row) => row.workspaceId === w)).toBe(true);
    const events = operationsEventsResponseSchema.parse(
      await (await call(`/workspaces/${w}/operations/events?limit=1`, admin)).json(),
    );
    expect(events.data[0]?.errorCode).toBe('EVENT_PROCESSING_FAILED');
    expect(JSON.stringify(events)).not.toMatch(/secret|learner@|payload|lastError/);
    expect(events.meta.hasMore).toBe(true);
    const cursor = events.meta.nextCursor!;
    expect(
      (await call(`/workspaces/${w}/operations/events?limit=1&cursor=${cursor}`, admin)).status,
    ).toBe(200);
    expect(
      (await call(`/workspaces/${w}/operations/events?limit=1&status=DEAD&cursor=${cursor}`, admin))
        .status,
    ).toBe(400);
    expect(
      (await call(`/workspaces/${other}/operations/events?limit=1&cursor=${cursor}`)).status,
    ).toBe(400);
  });

  it('replays dead events once under concurrency and preserves successful consumer receipts', async () => {
    const row = await event();
    await db.eventReceipt.create({
      data: { workspaceId: w, eventId: row.id, consumer: 'successful-consumer' },
    });
    const path = `/workspaces/${w}/operations/events/${row.id}/replay`;
    const responses = await Promise.all([
      call(path, admin, 'POST', { reason }),
      call(path, admin, 'POST', { reason }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    replayAcceptedResponseSchema.parse(await responses.find((r) => r.status === 202)!.json());
    expect(await db.eventReceipt.count({ where: { eventId: row.id } })).toBe(1);
    expect(
      await db.auditLog.count({ where: { resourceId: row.id, action: 'events.replay' } }),
    ).toBe(1);
    const foreign = await event(other);
    expect(
      (
        await call(`/workspaces/${w}/operations/events/${foreign.id}/replay`, admin, 'POST', {
          reason,
        })
      ).status,
    ).toBe(404);
    const global = await event(null, 'identity.password-changed.v1');
    expect(
      (
        await call(`/workspaces/${w}/operations/events/${global.id}/replay`, admin, 'POST', {
          reason,
        })
      ).status,
    ).toBe(404);
    expect((await call(path, admin, 'POST', { reason, payload: {} })).status).toBe(400);
    const unsafe = await event(w, 'identity.password-changed.v1');
    expect(
      (
        await call(`/workspaces/${w}/operations/events/${unsafe.id}/replay`, admin, 'POST', {
          reason,
        })
      ).status,
    ).toBe(403);
  });

  it('schedules only failed verified inbox records and preserves evidence under concurrent retries', async () => {
    const row = await webhook();
    const listing = webhooksResponseSchema.parse(
      await (await call('/admin/webhooks?status=FAILED')).json(),
    );
    expect(listing.data.some((item) => item.id === row.id)).toBe(true);
    expect(JSON.stringify(listing)).not.toMatch(
      /signedEvidence|provider detail|payload|stripeEventId/,
    );
    const path = `/admin/webhooks/${row.id}/replay`;
    expect((await call(path, sa, 'POST', { reason, payload: { forged: true } })).status).toBe(400);
    const responses = await Promise.all([
      call(path, sa, 'POST', { reason }),
      call(path, sa, 'POST', { reason }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    const updated = await db.stripeWebhook.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.payload).toEqual(row.payload);
    expect(updated.stripeEventId).toBe(row.stripeEventId);
    expect(updated.status).toBe('RECEIVED');
    expect(updated.attempts).toBe(0);
    expect(await db.auditLog.count({ where: { resourceId: row.id } })).toBe(1);
    await db.stripeWebhook.update({ where: { id: row.id }, data: { status: 'PROCESSED' } });
    expect((await call(path, sa, 'POST', { reason })).status).toBe(409);
    const locked = await webhook();
    await db.stripeWebhook.update({
      where: { id: locked.id },
      data: { lockedUntil: new Date(Date.now() + 60000) },
    });
    expect((await call(`/admin/webhooks/${locked.id}/replay`, sa, 'POST', { reason })).status).toBe(
      409,
    );
  });

  it('rolls back inbox retry when its audit insert fails', async () => {
    const row = await webhook();
    await pool.query(
      `CREATE FUNCTION reject_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."resourceId" = '${row.id}' THEN RAISE EXCEPTION 'test audit unavailable'; END IF; RETURN NEW; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER reject_admin_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_admin_audit()',
    );
    try {
      expect((await call(`/admin/webhooks/${row.id}/replay`, sa, 'POST', { reason })).status).toBe(
        500,
      );
      expect((await db.stripeWebhook.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        'FAILED',
      );
    } finally {
      await pool.query('DROP TRIGGER reject_admin_audit ON "AuditLog"');
      await pool.query('DROP FUNCTION reject_admin_audit()');
    }
  });

  it('serializes workspace suspension, rejects stale writes and invalidates staff authorization immediately', async () => {
    const row = await db.workspace.findUniqueOrThrow({ where: { id: w } });
    const learner = await identity();
    const course = await db.course.create({
      data: {
        workspaceId: w,
        createdById: ownerId,
        title: 'Suspension fixture',
        slug: `suspension-${randomUUID()}`,
        summary: 'Access policy regression',
        status: 'PUBLISHED',
        isFree: true,
      },
    });
    const grants = app.get(EnrollmentGrantService);
    const enrollment = await db.$transaction(async (tx) => {
      const { enrollment } = await grants.ensureEnrollment(tx, {
        workspaceId: w,
        courseId: course.id,
        userId: learner.user.id,
        allowedCourseStatuses: ['PUBLISHED'],
      });
      await grants.createGrant(
        tx,
        {
          workspaceId: w,
          enrollmentId: enrollment.id,
          source: 'FREE',
          sourceKey: `free:${course.id}`,
          startsAt: new Date(Date.now() - 1000),
          expiresAt: null,
        },
        { actorId: learner.user.id },
      );
      return enrollment;
    });
    const access = () =>
      app
        .get(LearnerAccessPolicy)
        .evaluateNow({ workspaceId: w, enrollmentId: enrollment.id, userId: learner.user.id });
    expect((await access()).allowed).toBe(true);
    const path = `/admin/workspaces/${w}`;
    const input = { status: 'SUSPENDED', suspendedAt: new Date().toISOString(), reason };
    expect((await call(path, sa, 'PATCH', input)).status).toBe(428);
    const responses = await Promise.all([
      call(path, sa, 'PATCH', input, { 'If-Match': workspaceEtag(row) }),
      call(path, sa, 'PATCH', input, { 'If-Match': workspaceEtag(row) }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const actor = { id: ownerId, platformRole: 'STUDENT' as const };
    expect(await app.get(PolicyService).hasWorkspaceRole(actor, w, ['ADMIN'])).toBe(false);
    expect((await call(`/workspaces/${w}/audit-logs`, admin)).status).toBe(404);
    expect((await call(`/workspaces/${w}/audit-logs`)).status).toBe(200);
    const current = await db.workspace.findUniqueOrThrow({ where: { id: w } });
    expect(current.suspendedAt).not.toBeNull();
    expect(await access()).toMatchObject({ allowed: false, reason: 'WORKSPACE_SUSPENDED' });
    expect(
      (
        await call(
          path,
          sa,
          'PATCH',
          { status: 'ACTIVE', suspendedAt: null, reason },
          { 'If-Match': workspaceEtag(current) },
        )
      ).status,
    ).toBe(200);
    expect(await app.get(PolicyService).hasWorkspaceRole(actor, w, ['ADMIN'])).toBe(true);
    expect((await access()).allowed).toBe(true);
    await db.user.update({ where: { id: learner.user.id }, data: { status: 'SUSPENDED' } });
    expect((await access()).allowed).toBe(false);
    expect((await call('/admin/workspaces', learner.token)).status).toBe(401);
  });
});
