import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient, type Role, type Workspace } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AuthenticatedUser } from '../../common/authz/auth.types';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { hashToken } from '../auth/token.util';
import { TenancyModule } from './tenancy.module';
import { TenancyService } from './tenancy.service';
import { InvitationMailService } from './invitation-mail.service';
import { tenancyEtag } from './tenancy.util';
import { domainEventSchema } from '@lms/shared';
import { InvitationMailConsumer } from './invitation-mail.consumer';
import { InvitationMailModule } from './invitation-mail.module';

// Opt-in only. All migrations, fixtures and cleanup are confined to a random tenancy_test_* schema.
const integration = process.env.TENANCY_TEST_DATABASE_URL ? describe : describe.skip;
integration('Tenancy PostgreSQL and HTTP integration', () => {
  const schema = `tenancy_test_${randomUUID().replaceAll('-', '')}`;
  let adminPool: Pool;
  let prisma: PrismaClient;
  let app: INestApplication;
  let service: TenancyService;
  let baseUrl: string;
  let passwordHash: string;
  const password = 'tenancy-integration-password-123';
  const mail = { send: jest.fn().mockResolvedValue(undefined), onModuleDestroy: jest.fn() };
  const req = randomUUID();

  async function user(
    platformRole: 'STUDENT' | 'SUPER_ADMIN' = 'STUDENT',
  ): Promise<AuthenticatedUser> {
    const row = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: 'Tenancy test',
        passwordHash,
        platformRole,
        emailVerifiedAt: new Date(),
      },
    });
    return { ...row, sessionId: randomUUID(), familyId: randomUUID() };
  }
  async function workspace(owner: AuthenticatedUser, kind: 'PERSONAL' | 'ACADEMY' = 'ACADEMY') {
    return service.create(
      owner,
      {
        kind,
        name: 'Test workspace',
        slug: `test-${randomUUID()}`,
        timezone: 'UTC',
        defaultCurrency: 'usd',
      },
      req,
    );
  }
  async function member(workspaceId: string, actor: AuthenticatedUser, role: Role = 'ADMIN') {
    return prisma.workspaceMember.create({ data: { workspaceId, userId: actor.id, role } });
  }
  async function invite(
    owner: AuthenticatedUser,
    row: Workspace,
    invited: AuthenticatedUser,
    role: 'ADMIN' | 'INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'STUDENT' = 'INSTRUCTOR',
  ) {
    const result = await service.invite(owner, row.id, { email: invited.email, role }, req);
    const outbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: result.row.id },
      orderBy: { sequence: 'desc' },
    });
    const event = domainEventSchema.parse({
      id: outbox.id,
      workspaceId: outbox.workspaceId,
      type: outbox.type,
      schemaVersion: outbox.schemaVersion,
      aggregateType: outbox.aggregateType,
      aggregateId: outbox.aggregateId,
      payload: outbox.payload,
      sequence: outbox.sequence.toString(),
      timestamp: outbox.createdAt.toISOString(),
    });
    if (event.type !== 'workspace.invitation.created.v1')
      throw new Error('Unexpected fixture event');
    // Parse only the envelope's public fields; DB operational fields are intentionally not wire fields.
    const payload = outbox.payload as {
      mailCapability: { keyId: string; ciphertext: string; expiresAt: string };
    };
    const { token } = app
      .get(InvitationMailService)
      .open(row.id, result.row.id, payload.mailCapability);
    return { ...result, token, outbox, event };
  }
  beforeAll(async () => {
    const connectionString = process.env.TENANCY_TEST_DATABASE_URL!;
    adminPool = new Pool({ connectionString, max: 1 });
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    // Canonical SQL, including tenant CHECKs/composite FKs. Remove only the public-schema bootstrap line.
    const migration = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261026000000_initial/migration.sql'),
      'utf8',
    ).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await adminPool.query(`SET search_path TO "${schema}"`);
    await adminPool.query(migration);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}`, max: 10 },
        { schema },
      ),
    });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'tenancy-test-secret-at-least-32-characters',
              WEB_ORIGIN: 'http://localhost:3100',
              NODE_ENV: 'test',
              TENANCY_MAIL_KEY: randomBytes(32).toString('base64'),
              TENANCY_MAIL_KEY_ID: 'test-v1',
            }),
          ],
        }),
        AuthModule,
        TenancyModule,
        InvitationMailModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(StorageService)
      .useValue({ createDownloadUrl: jest.fn(), createUploadUrl: jest.fn() })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    service = app.get(TenancyService);
    passwordHash = await app.get(PasswordService).hash(password);
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (adminPool) {
      try {
        await adminPool.query('ROLLBACK');
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  });

  it('creates both workspace kinds with owner ADMIN and returns only own active workspaces and capabilities', async () => {
    const owner = await user();
    const other = await user();
    const personal = await workspace(owner, 'PERSONAL');
    const academy = await workspace(owner);
    await workspace(other);
    const listed = await service.mine(owner, { limit: 100 });
    expect(listed.data.map((row) => row.id).sort()).toEqual(
      [personal.row.id, academy.row.id].sort(),
    );
    expect(
      listed.data.every(
        (row) => row.membership.role === 'ADMIN' && row.permissions.includes('members.manage'),
      ),
    ).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).platformRole).toBe(
      'STUDENT',
    );
  });
  it('enforces ETags for workspace edits and reserves tombstoned slugs', async () => {
    const owner = await user();
    const created = await workspace(owner);
    await expect(
      service.update(owner, created.row.id, { name: 'Updated' }, undefined, req),
    ).rejects.toMatchObject({ status: 428 });
    const result = await service.update(
      owner,
      created.row.id,
      { name: 'Updated', timezone: 'Africa/Cairo', logoUrl: null },
      tenancyEtag(created.row),
      req,
    );
    expect(result.data.name).toBe('Updated');
    await expect(
      service.update(owner, created.row.id, { name: 'Stale' }, tenancyEtag(created.row), req),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.create(
        owner,
        {
          kind: 'ACADEMY',
          name: 'Duplicate',
          slug: created.row.slug,
          defaultCurrency: 'usd',
          timezone: 'UTC',
        },
        req,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('requires reauthentication, current ownership and an active local ADMIN for transfer; protects owner removal/demotion', async () => {
    const owner = await user();
    const next = await user();
    const outsider = await user();
    const created = await workspace(owner);
    const ownerMember = await prisma.workspaceMember.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: created.row.id, userId: owner.id } },
    });
    const nextMember = await member(created.row.id, next);
    await expect(
      service.removeMember(owner, created.row.id, ownerMember.id, tenancyEtag(ownerMember), req),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.updateMember(
        owner,
        created.row.id,
        ownerMember.id,
        { role: 'STUDENT' },
        tenancyEtag(ownerMember),
        req,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.transfer(
        owner,
        created.row.id,
        { userId: next.id, reason: 'Transfer business', password: 'wrong' },
        tenancyEtag(created.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      service.transfer(
        next,
        created.row.id,
        { userId: owner.id, reason: 'Not owner', password },
        tenancyEtag(created.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.transfer(
        owner,
        created.row.id,
        { userId: outsider.id, reason: 'Forged target', password },
        tenancyEtag(created.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const changed = await service.transfer(
      owner,
      created.row.id,
      { userId: next.id, reason: 'Transfer business', password },
      tenancyEtag(created.row),
      req,
    );
    expect(changed.data.ownerId).toBe(next.id);
    await service.removeMember(next, created.row.id, ownerMember.id, tenancyEtag(ownerMember), req);
    await expect(
      service.removeMember(next, created.row.id, nextMember.id, tenancyEtag(nextMember), req),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await prisma.auditLog.count({
        where: { workspaceId: created.row.id, action: 'workspace.ownership_transferred' },
      }),
    ).toBe(1);
  });
  it('serializes concurrent transfer/removal and keeps an active ADMIN owner', async () => {
    const owner = await user();
    const next = await user();
    const created = await workspace(owner);
    const target = await member(created.row.id, next);
    const results = await Promise.allSettled([
      service.transfer(
        owner,
        created.row.id,
        { userId: next.id, reason: 'Concurrent transfer', password },
        tenancyEtag(created.row),
        req,
      ),
      service.removeMember(owner, created.row.id, target.id, tenancyEtag(target), req),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const current = await prisma.workspace.findUniqueOrThrow({ where: { id: created.row.id } });
    expect(
      await prisma.workspaceMember.count({
        where: {
          workspaceId: current.id,
          userId: current.ownerId,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      }),
    ).toBe(1);
  });
  it('last-admin check also rejects removing the sole remaining effective ADMIN in inconsistent legacy data', async () => {
    const superAdmin = await user('SUPER_ADMIN');
    const missingOwner = await user();
    const sole = await user();
    const created = await workspace(missingOwner);
    const remaining = await member(created.row.id, sole);
    // Deliberately emulate legacy corruption to exercise the independent last-admin defence.
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: created.row.id, userId: missingOwner.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      service.updateMember(
        superAdmin,
        created.row.id,
        remaining.id,
        { status: 'SUSPENDED' },
        tenancyEtag(remaining),
        req,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({ code: 'LAST_ADMIN' }),
    });
  });
  it.each(['ADMIN', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT'] as const)(
    'invites and accepts tenant role %s, storing hashes and encrypted mail only',
    async (role) => {
      const owner = await user();
      const invited = await user();
      const created = await workspace(owner);
      const invitation = await invite(owner, created.row, invited, role);
      expect(invitation.row.tokenHash).toBe(hashToken(invitation.token));
      expect(
        invitation.row.expiresAt.getTime() - invitation.row.createdAt.getTime(),
      ).toBeGreaterThan(7 * 86400000 - 5000);
      expect(JSON.stringify(invitation.outbox.payload)).not.toContain(invitation.token);
      expect(JSON.stringify(invitation.data)).not.toMatch(/tokenHash|ciphertext/);
      const joined = await service.accept(invited, invitation.token, req);
      expect(joined.data.role).toBe(role);
      expect(joined.data.workspaceId).toBe(created.row.id);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: invited.id } })).platformRole,
      ).toBe('STUDENT');
      await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
        status: 409,
      });
    },
  );
  it('acceptance race consumes exactly once; forged/mismatched or unverified accounts cannot accept', async () => {
    const owner = await user();
    const invited = await user();
    const wrong = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited);
    await expect(service.accept(wrong, invitation.token, req)).rejects.toMatchObject({
      status: 403,
    });
    await prisma.user.update({ where: { id: invited.id }, data: { emailVerifiedAt: null } });
    await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
      status: 403,
    });
    await prisma.user.update({ where: { id: invited.id }, data: { emailVerifiedAt: new Date() } });
    const results = await Promise.allSettled([
      service.accept(invited, invitation.token, req),
      service.accept(invited, invitation.token, req),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.workspaceMember.count({
        where: { workspaceId: created.row.id, userId: invited.id },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { resourceId: invitation.row.id, action: 'workspace.invitation_accepted' },
      }),
    ).toBe(1);
  });
  it('expired/revoked invitations fail; resend rotates tokens and replacement revokes earlier invitations', async () => {
    const owner = await user();
    const invited = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited);
    const expired = await prisma.workspaceInvitation.update({
      where: { id: invitation.row.id },
      data: {
        createdAt: new Date(Date.now() - 9 * 86400000),
        expiresAt: new Date(Date.now() - 86400000),
      },
    });
    await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (
        await service.invitations(owner, created.row.id, { limit: 20, status: 'EXPIRED' }, req)
      ).data.map((row) => row.id),
    ).toContain(expired.id);
    const resent = await service.resendInvitation(
      owner,
      created.row.id,
      expired.id,
      tenancyEtag(expired),
      req,
    );
    expect(resent.row.tokenHash).not.toBe(expired.tokenHash);
    await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
      status: 404,
    });
    const replacement = await invite(owner, created.row, invited);
    expect(
      (await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: expired.id } })).revokedAt,
    ).not.toBeNull();
    await service.revokeInvitation(
      owner,
      created.row.id,
      replacement.row.id,
      tenancyEtag(replacement.row),
      req,
    );
    await expect(service.accept(invited, replacement.token, req)).rejects.toMatchObject({
      status: 409,
    });
    const revoked = await prisma.workspaceInvitation.findUniqueOrThrow({
      where: { id: replacement.row.id },
    });
    await expect(
      service.resendInvitation(owner, created.row.id, revoked.id, tenancyEtag(revoked), req),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('concurrent revoke/accept permits one terminal action and concurrent replacements leave one pending invitation', async () => {
    const owner = await user();
    const invited = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited);
    const results = await Promise.allSettled([
      service.accept(invited, invitation.token, req),
      service.revokeInvitation(
        owner,
        created.row.id,
        invitation.row.id,
        tenancyEtag(invitation.row),
        req,
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const other = await user();
    await Promise.all([
      service.invite(owner, created.row.id, { email: other.email, role: 'STUDENT' }, req),
      service.invite(owner, created.row.id, { email: other.email, role: 'INSTRUCTOR' }, req),
    ]);
    expect(
      await prisma.workspaceInvitation.count({
        where: {
          workspaceId: created.row.id,
          email: other.email,
          acceptedAt: null,
          revokedAt: null,
        },
      }),
    ).toBe(1);
  });
  it('invitation cannot reactivate a suspended member or change an existing member role', async () => {
    const owner = await user();
    const invited = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited, 'ADMIN');
    const existing = await member(created.row.id, invited, 'STUDENT');
    await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
      status: 409,
    });
    await prisma.workspaceMember.update({
      where: { id: existing.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(service.accept(invited, invitation.token, req)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await prisma.workspaceMember.findUniqueOrThrow({ where: { id: existing.id } })).role,
    ).toBe('STUDENT');
    await expect(
      service.invite(owner, created.row.id, { email: invited.email, role: 'ADMIN' }, req),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('rejects cross-tenant workspace/member/invitation/course/staff IDs and inaccessible lists', async () => {
    const owner = await user();
    const other = await user();
    const invited = await user();
    const a = await workspace(owner);
    const b = await workspace(other);
    const foreignMember = await member(b.row.id, invited);
    const foreignInvitation = await invite(other, b.row, await user());
    await expect(service.get(owner, b.row.id, req)).rejects.toMatchObject({ status: 404 });
    await expect(service.members(owner, b.row.id, { limit: 20 }, req)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.invitations(owner, b.row.id, { limit: 20 }, req)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      service.updateMember(
        owner,
        a.row.id,
        foreignMember.id,
        { role: 'STUDENT' },
        tenancyEtag(foreignMember),
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.removeMember(owner, a.row.id, foreignMember.id, tenancyEtag(foreignMember), req),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.revokeInvitation(
        owner,
        a.row.id,
        foreignInvitation.row.id,
        tenancyEtag(foreignInvitation.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.resendInvitation(
        owner,
        a.row.id,
        foreignInvitation.row.id,
        tenancyEtag(foreignInvitation.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const course = await prisma.course.create({
      data: {
        workspaceId: b.row.id,
        createdById: other.id,
        title: 'Foreign',
        slug: 'foreign',
        summary: 'Foreign course',
      },
    });
    await expect(
      service.staff(owner, a.row.id, course.id, { limit: 20 }, req),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.upsertStaff(
        owner,
        a.row.id,
        course.id,
        invited.id,
        { role: 'INSTRUCTOR', canEditContent: false, canGrade: true, canManageLearners: false },
        undefined,
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('TA defaults/flags require an assigned instructor; suspension and role demotion immediately invalidate assignment access', async () => {
    const owner = await user();
    const lead = await user();
    const ta = await user();
    const unassigned = await user();
    const created = await workspace(owner);
    const leadMember = await member(created.row.id, lead, 'INSTRUCTOR');
    const taMember = await member(created.row.id, ta, 'TEACHING_ASSISTANT');
    await member(created.row.id, unassigned, 'INSTRUCTOR');
    const course = await prisma.course.create({
      data: {
        workspaceId: created.row.id,
        createdById: owner.id,
        title: 'Local',
        slug: 'local',
        summary: 'Local course',
      },
    });
    await prisma.courseStaff.create({
      data: {
        workspaceId: created.row.id,
        courseId: course.id,
        userId: lead.id,
        role: 'INSTRUCTOR',
      },
    });
    const flags = {
      role: 'TEACHING_ASSISTANT' as const,
      canEditContent: false,
      canGrade: true,
      canManageLearners: false,
    };
    await expect(
      service.upsertStaff(unassigned, created.row.id, course.id, ta.id, flags, undefined, req),
    ).rejects.toMatchObject({ status: 403 });
    const assignment = await service.upsertStaff(
      lead,
      created.row.id,
      course.id,
      ta.id,
      flags,
      undefined,
      req,
    );
    expect(assignment.data).toMatchObject({
      canEditContent: false,
      canGrade: true,
      canManageLearners: false,
      memberId: taMember.id,
    });
    await expect(
      service.upsertStaff(
        ta,
        created.row.id,
        course.id,
        ta.id,
        { ...flags, canEditContent: true },
        tenancyEtag(assignment.row),
        req,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await service.upsertStaff(
      lead,
      created.row.id,
      course.id,
      ta.id,
      { ...flags, canEditContent: true },
      tenancyEtag(assignment.row),
      req,
    );
    const { PolicyService } = await import('../../common/authz/policy.service');
    expect(await app.get(PolicyService).canManageCourse(ta, course, 'edit')).toBe(true);
    const taWorkspaces = await service.mine(ta, { limit: 20 });
    expect(taWorkspaces.data[0]?.permissions).toEqual(
      expect.arrayContaining(['courses.edit', 'courses.grade', 'analytics.read']),
    );
    expect(taWorkspaces.data[0]?.permissions).not.toContain('members.manage');
    await service.updateMember(
      owner,
      created.row.id,
      taMember.id,
      { status: 'SUSPENDED' },
      tenancyEtag(taMember),
      req,
    );
    expect(await app.get(PolicyService).canManageCourse(ta, course, 'edit')).toBe(false);
    await service.updateMember(
      owner,
      created.row.id,
      leadMember.id,
      { role: 'STUDENT' },
      tenancyEtag(leadMember),
      req,
    );
    expect(
      await prisma.courseStaff.count({ where: { workspaceId: created.row.id, userId: lead.id } }),
    ).toBe(0);
  });
  it('mail consumer sends only the current verifier, scrubs encrypted material and skips stale/revoked capabilities', async () => {
    const owner = await user();
    const invited = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited);
    const consumer = app.get(InvitationMailConsumer);
    mail.send.mockClear();
    await prisma.$transaction((tx) => consumer.handle(invitation.event, tx));
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0]![0].text).toContain(invitation.token);
    const persisted = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: invitation.outbox.id },
    });
    expect(persisted.payload).not.toHaveProperty('mailCapability');
    await prisma.$transaction((tx) => consumer.handle(invitation.event, tx));
    expect(mail.send).toHaveBeenCalledTimes(1);
    const stale = await invite(owner, created.row, await user());
    await service.resendInvitation(
      owner,
      created.row.id,
      stale.row.id,
      tenancyEtag(stale.row),
      req,
    );
    await prisma.$transaction((tx) => consumer.handle(stale.event, tx));
    expect(mail.send).toHaveBeenCalledTimes(1);
  });
  it('rolls invitation replacement back when durable mail enqueue fails', async () => {
    const owner = await user();
    const invited = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, invited);
    const enqueue = jest
      .spyOn(app.get(InvitationMailService), 'enqueue')
      .mockRejectedValueOnce(new Error('Simulated encryption/outbox failure'));
    try {
      await expect(
        service.invite(owner, created.row.id, { email: invited.email, role: 'ADMIN' }, req),
      ).rejects.toThrow('Simulated');
      expect(
        (await prisma.workspaceInvitation.findUniqueOrThrow({ where: { id: invitation.row.id } }))
          .revokedAt,
      ).toBeNull();
      expect(
        await prisma.workspaceInvitation.count({
          where: { workspaceId: created.row.id, email: invited.email },
        }),
      ).toBe(1);
    } finally {
      enqueue.mockRestore();
    }
  });
  it('purges only expired capability material in bounded batches, including dead events', async () => {
    const owner = await user();
    const created = await workspace(owner);
    const invitation = await invite(owner, created.row, await user());
    const current = await invite(owner, created.row, await user());
    const capability = (
      invitation.outbox.payload as {
        mailCapability: { keyId: string; ciphertext: string; expiresAt: string };
      }
    ).mailCapability;
    await prisma.outboxEvent.update({
      where: { id: invitation.outbox.id },
      data: {
        status: 'DEAD',
        payload: {
          invitationId: invitation.row.id,
          mailCapability: { ...capability, expiresAt: '2020-01-01T00:00:00.000Z' },
        },
      },
    });
    expect(
      await prisma.$transaction((tx) => app.get(InvitationMailService).purgeExpired(tx, 1)),
    ).toBe(1);
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: invitation.outbox.id } })).payload,
    ).not.toHaveProperty('mailCapability');
    expect(
      (await prisma.outboxEvent.findUniqueOrThrow({ where: { id: current.outbox.id } })).payload,
    ).toHaveProperty('mailCapability');
    expect(
      await prisma.$transaction((tx) => app.get(InvitationMailService).purgeExpired(tx, 1)),
    ).toBe(0);
  });
  it('allows an audited super-admin ownership transfer and rejects all new work in inactive workspaces', async () => {
    const owner = await user();
    const next = await user();
    const support = await user('SUPER_ADMIN');
    const created = await workspace(owner);
    await member(created.row.id, next);
    const result = await service.transfer(
      support,
      created.row.id,
      { userId: next.id, password, reason: 'Approved owner recovery' },
      tenancyEtag(created.row),
      req,
    );
    expect(result.row.ownerId).toBe(next.id);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: support.id,
          action: 'workspace.ownership_transferred',
          workspaceId: created.row.id,
        },
      }),
    ).toBe(1);
    const pending = await invite(next, result.row, await user());
    await prisma.workspace.update({
      where: { id: created.row.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    await expect(service.get(support, created.row.id, req)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.invite(
        next,
        created.row.id,
        { email: 'inactive@example.com', role: 'INSTRUCTOR' },
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const target = await prisma.user.findUniqueOrThrow({ where: { email: pending.row.email } });
    await expect(
      service.accept(
        { ...target, sessionId: randomUUID(), familyId: randomUUID() },
        pending.token,
        req,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('real HTTP enforces authentication, tenant roles, strict schemas, no-store, ETags and publishes canonical Swagger', async () => {
    const owner = await user();
    const student = await user();
    const created = await workspace(owner);
    await member(created.row.id, student, 'STUDENT');
    const login = await app.get(AuthService).login({ email: owner.email, password }, {});
    const studentLogin = await app.get(AuthService).login({ email: student.email, password }, {});
    const headers = {
      Authorization: `Bearer ${login.data.accessToken}`,
      'Content-Type': 'application/json',
    };
    expect((await fetch(`${baseUrl}/api/v1/me/workspaces`)).status).toBe(401);
    const get = await fetch(`${baseUrl}/api/v1/workspaces/${created.row.id}`, { headers });
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('private, no-store');
    expect(get.headers.get('etag')).toBe(tenancyEtag(created.row));
    const forbidden = await fetch(`${baseUrl}/api/v1/workspaces/${created.row.id}/members`, {
      headers: { Authorization: `Bearer ${studentLogin.data.accessToken}` },
    });
    expect(forbidden.status).toBe(403);
    const escalation = await fetch(`${baseUrl}/api/v1/workspaces/${created.row.id}/invitations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'target@example.com', role: 'SUPER_ADMIN' }),
    });
    expect(escalation.status).toBe(400);
    const platformInjection = await fetch(`${baseUrl}/api/v1/workspaces`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'ACADEMY',
        name: 'Hack',
        slug: 'hack',
        ownerId: student.id,
        platformRole: 'SUPER_ADMIN',
      }),
    });
    expect(platformInjection.status).toBe(400);
    const forged = await fetch(`${baseUrl}/api/v1/workspaces/${randomUUID()}`, { headers });
    expect(forged.status).toBe(404);
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(document.paths['/api/v1/invitations/accept']?.post).toBeDefined();
    expect(
      document.paths['/api/v1/workspaces/{workspaceId}/invitations']?.post?.requestBody,
    ).toHaveProperty('content.application/json.schema.properties.role');
    expect(document.paths['/api/v1/workspaces/{workspaceId}/members']?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'cursor' })]),
    );
    expect(
      document.paths['/api/v1/workspaces/{workspaceId}/invitations/{invitationId}/resend']?.post,
    ).toBeDefined();
  });
});
