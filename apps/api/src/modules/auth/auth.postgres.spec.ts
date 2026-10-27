import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { AuthModule } from './auth.module';
import { hashToken } from './token.util';
import { acceptedResponseSchema } from '@lms/shared';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MailService } from '../../infrastructure/mail/mail.service';

// Opt-in: creates/drops only a random identity_test_* schema, never public tables.
const integration = process.env.IDENTITY_TEST_DATABASE_URL ? describe : describe.skip;
integration('Identity PostgreSQL and HTTP integration', () => {
  const schema = `identity_test_${randomUUID().replaceAll('-', '')}`;
  let adminPool: Pool;
  let prisma: PrismaClient;
  let app: INestApplication;
  let auth: AuthService;
  let baseUrl: string;
  const mail = { send: jest.fn().mockResolvedValue(undefined), onModuleDestroy: jest.fn() };
  const account = {
    email: `identity-${randomUUID()}@example.com`,
    name: 'Identity test',
    password: 'long-test-password-123',
    onboardingMode: 'STUDENT' as const,
  };

  beforeAll(async () => {
    const connectionString = process.env.IDENTITY_TEST_DATABASE_URL!;
    adminPool = new Pool({ connectionString, max: 1 });
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    await adminPool.query(`
      SET search_path TO "${schema}";
      CREATE TYPE "Role" AS ENUM ('STUDENT','SUPER_ADMIN','ADMIN','INSTRUCTOR','TEACHING_ASSISTANT');
      CREATE TYPE "UserStatus" AS ENUM ('ACTIVE','SUSPENDED','ANONYMIZED');
      CREATE TYPE "TokenPurpose" AS ENUM ('VERIFY_EMAIL','RESET_PASSWORD');
      CREATE TABLE "User" (
        "id" uuid PRIMARY KEY, "email" varchar(254) UNIQUE NOT NULL, "name" varchar(160) NOT NULL,
        "passwordHash" varchar(255), "platformRole" "Role" NOT NULL DEFAULT 'STUDENT',
        "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE', "emailVerifiedAt" timestamptz(3),
        "passwordChangedAt" timestamptz(3), "locale" varchar(20) NOT NULL DEFAULT 'en',
        "timezone" varchar(64) NOT NULL DEFAULT 'UTC', "lastLoginAt" timestamptz(3),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL,
        "deletedAt" timestamptz(3), "avatarKey" varchar(512)
      );
      CREATE TABLE "RefreshSession" (
        "id" uuid PRIMARY KEY, "familyId" uuid NOT NULL, "tokenHash" char(64) UNIQUE NOT NULL,
        "parentId" uuid UNIQUE REFERENCES "RefreshSession"("id"), "expiresAt" timestamptz(3) NOT NULL,
        "consumedAt" timestamptz(3), "revokedAt" timestamptz(3), "userAgent" varchar(512), "ipHash" char(64),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL,
        "userId" uuid NOT NULL REFERENCES "User"("id")
      );
      CREATE TABLE "AuthToken" (
        "id" uuid PRIMARY KEY, "purpose" "TokenPurpose" NOT NULL, "tokenHash" char(64) UNIQUE NOT NULL,
        "expiresAt" timestamptz(3) NOT NULL, "consumedAt" timestamptz(3),
        "createdAt" timestamptz(3) NOT NULL DEFAULT now(), "updatedAt" timestamptz(3) NOT NULL,
        "userId" uuid NOT NULL REFERENCES "User"("id")
      );
    `);
    const adapter = new PrismaPg(
      { connectionString, options: `-c search_path=${schema}`, max: 5 },
      { schema },
    );
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: 'identity-integration-secret-minimum-32-bytes',
              WEB_ORIGIN: 'http://localhost:3100',
              NODE_ENV: 'test',
            }),
          ],
        }),
        AuthModule,
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
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    auth = app.get(AuthService);
    await auth.register(account);
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (adminPool) {
      try {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  });
  it('boots module DI and enforces CSRF/cookie flags and no-store over HTTP', async () => {
    const csrf = await fetch(`${baseUrl}/api/v1/auth/csrf`);
    const payload = (await csrf.json()) as { data: { csrfToken: string } };
    const cookie = csrf.headers.getSetCookie()[0]!.split(';')[0]!;
    expect(csrf.headers.get('cache-control')).toBe('private, no-store');
    expect(csrf.headers.get('set-cookie')).toContain('HttpOnly');
    const denied = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    expect(denied.status).toBe(403);
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3100',
        'X-CSRF-Token': payload.data.csrfToken,
        Cookie: cookie,
      },
      body: JSON.stringify({ email: account.email, password: account.password }),
    });
    expect(login.status).toBe(200);
    const result = (await login.json()) as {
      data: { accessToken: string; refreshToken?: string; expiresIn: number };
    };
    expect(result.data.expiresIn).toBe(600);
    expect(result.data.refreshToken).toBeUndefined();
    expect(login.headers.get('set-cookie')).toContain('lms_refresh=');
    expect(login.headers.get('set-cookie')).toContain('Path=/api/v1/auth');
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    expect(login.headers.get('set-cookie')).toContain('SameSite=Lax');
    const refreshCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('lms_refresh='))!;
    const hintCookie = login.headers
      .getSetCookie()
      .find((value) => value.startsWith('lms_session='))!;
    expect(hintCookie).toMatch(/^lms_session=1; Path=\//);
    expect(hintCookie).toContain('SameSite=Lax');
    expect(hintCookie).not.toMatch(/HttpOnly|Secure|Domain=/);
    expect(hintCookie.match(/Expires=[^;]+/)?.[0]).toBe(refreshCookie.match(/Expires=[^;]+/)?.[0]);
    const sessions = await fetch(`${baseUrl}/api/v1/me/sessions`, {
      headers: { Authorization: `Bearer ${result.data.accessToken}` },
    });
    expect(sessions.status).toBe(200);
    const adminDenied = await fetch(`${baseUrl}/api/v1/admin/users`, {
      headers: { Authorization: `Bearer ${result.data.accessToken}` },
    });
    expect(adminDenied.status).toBe(403);
    const oldRefreshCookie = login.headers.getSetCookie()[0]!.split(';')[0]!;
    const mutationHeaders = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3100',
      'X-CSRF-Token': payload.data.csrfToken,
      Cookie: `${cookie}; ${oldRefreshCookie}`,
    };
    const refreshed = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: mutationHeaders,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.headers.getSetCookie()[0]).not.toBe(login.headers.getSetCookie()[0]);
    expect(refreshed.headers.getSetCookie().find((value) => value.startsWith('lms_session='))).toBe(
      hintCookie,
    );
    // Simulate losing the first rotation response: keep the original cookie.
    const recovered = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: mutationHeaders,
    });
    expect(recovered.status).toBe(200);
    const recoveredCookie = recovered.headers
      .getSetCookie()
      .find((value) => value.startsWith('lms_refresh='))!;
    expect(recoveredCookie).not.toBe(refreshCookie);
    expect(recoveredCookie).not.toBe(refreshed.headers.getSetCookie()[0]);
    expect(recoveredCookie.match(/Expires=[^;]+/)?.[0]).toBe(
      refreshCookie.match(/Expires=[^;]+/)?.[0],
    );
    const recoveredBody = (await recovered.json()) as { data: { accessToken: string } };
    expect(
      (
        await fetch(`${baseUrl}/api/v1/me/sessions`, {
          headers: { Authorization: `Bearer ${recoveredBody.data.accessToken}` },
        })
      ).status,
    ).toBe(200);
    const replay = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: mutationHeaders,
    });
    expect(replay.status).toBe(401);
    expect(replay.headers.get('set-cookie')).toContain('lms_refresh=;');
    expect(replay.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    expect(replay.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^lms_session=; Path=\/; Expires=Thu, 01 Jan 1970/),
      ]),
    );
  });
  it.each(['logout', 'logout-all'])(
    '%s clears refresh and root hint cookies over HTTP',
    async (route) => {
      const csrf = await fetch(`${baseUrl}/api/v1/auth/csrf`);
      const { data } = (await csrf.json()) as { data: { csrfToken: string } };
      const csrfCookie = csrf.headers.getSetCookie()[0]!.split(';')[0]!;
      const headers = {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3100',
        'X-CSRF-Token': data.csrfToken,
        Cookie: csrfCookie,
      };
      const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: account.email, password: account.password }),
      });
      expect(login.status).toBe(200);
      const session = (await login.json()) as { data: { accessToken: string } };
      const refreshCookie = login.headers
        .getSetCookie()
        .find((value) => value.startsWith('lms_refresh='))!
        .split(';')[0]!;
      const logout = await fetch(`${baseUrl}/api/v1/auth/${route}`, {
        method: 'POST',
        headers: {
          ...headers,
          Cookie: `${csrfCookie}; ${refreshCookie}; lms_session=1`,
          Authorization: `Bearer ${session.data.accessToken}`,
        },
      });
      expect(logout.status).toBe(204);
      expect(logout.headers.getSetCookie()).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^lms_refresh=; Path=\/api\/v1\/auth; Expires=Thu, 01 Jan 1970/),
          expect.stringMatching(/^lms_session=; Path=\/; Expires=Thu, 01 Jan 1970/),
        ]),
      );
      const rejected = await fetch(`${baseUrl}/api/v1/me/sessions`, {
        headers: { Authorization: `Bearer ${session.data.accessToken}` },
      });
      expect(rejected.status).toBe(401);
    },
  );
  it('publishes shared request/response schemas through Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(document.paths['/api/v1/auth/login']?.post?.requestBody).toHaveProperty(
      'content.application/json.schema.properties.email',
    );
    expect(document.paths['/api/v1/admin/users']?.get?.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pageSize', in: 'query' })]),
    );
    expect(document.paths['/api/v1/me/avatar/complete']?.post).toBeDefined();
  });
  it('two concurrent parent replays create exactly one grandchild and revoke on the used-child replay', async () => {
    const login = await auth.login(account, {});
    await auth.refresh(login.refreshToken, {});
    const results = await Promise.allSettled([
      auth.refresh(login.refreshToken, {}),
      auth.refresh(login.refreshToken, {}),
    ]);
    const successes = results.filter((result) => result.status === 'fulfilled');
    const failures = results.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0]?.status === 'rejected')
      expect(failures[0].reason.getResponse()).toMatchObject({ code: 'REFRESH_REUSED' });
    const parent = await prisma.refreshSession.findUniqueOrThrow({
      where: { tokenHash: (await import('./token.util')).hashToken(login.refreshToken) },
    });
    const family = await prisma.refreshSession.findMany({ where: { familyId: parent.familyId } });
    expect(family).toHaveLength(3);
    const child = family.find((session) => session.parentId === parent.id)!;
    expect(family.filter((session) => session.parentId === child.id)).toHaveLength(1);
    expect(family.every((session) => !!session.revokedAt)).toBe(true);
    expect(
      family.every((session) => session.expiresAt.getTime() === parent.expiresAt.getTime()),
    ).toBe(true);
    const rejectedAccess = await fetch(`${baseUrl}/api/v1/me/sessions`, {
      headers: { Authorization: `Bearer ${login.data.accessToken}` },
    });
    expect(rejectedAccess.status).toBe(401);
  });
  it('a lost-response retry within grace keeps the session and only persists token hashes', async () => {
    const login = await auth.login(account, {});
    const first = await auth.refresh(login.refreshToken, {});
    const recovered = await auth.refresh(login.refreshToken, {});
    const family = await prisma.refreshSession.findMany({
      where: {
        familyId: (
          await prisma.refreshSession.findUniqueOrThrow({
            where: { tokenHash: hashToken(login.refreshToken) },
          })
        ).familyId,
      },
    });
    expect(family).toHaveLength(3);
    expect(
      family.every(
        (session) =>
          !session.revokedAt && session.expiresAt.getTime() === login.expiresAt.getTime(),
      ),
    ).toBe(true);
    expect(family.filter((session) => !session.consumedAt)).toHaveLength(1);
    expect(
      family.find((session) => session.tokenHash === hashToken(recovered.refreshToken))?.consumedAt,
    ).toBeNull();
    expect(recovered.refreshToken).not.toBe(first.refreshToken);
    expect(
      (
        await fetch(`${baseUrl}/api/v1/me/sessions`, {
          headers: { Authorization: `Bearer ${recovered.data.accessToken}` },
        })
      ).status,
    ).toBe(200);
    await expect(auth.refresh(recovered.refreshToken, {})).resolves.toBeDefined();
  });
  it('replay after grace revokes the family and its access tokens', async () => {
    const login = await auth.login(account, {});
    const first = await auth.refresh(login.refreshToken, {});
    const parent = await prisma.refreshSession.update({
      where: { tokenHash: hashToken(login.refreshToken) },
      data: { consumedAt: new Date(Date.now() - 31000) },
    });
    await expect(auth.refresh(login.refreshToken, {})).rejects.toMatchObject({
      response: { code: 'REFRESH_REUSED' },
    });
    expect(
      await prisma.refreshSession.count({ where: { familyId: parent.familyId, revokedAt: null } }),
    ).toBe(0);
    await expect(auth.refresh(first.refreshToken, {})).rejects.toBeDefined();
    expect(
      (
        await fetch(`${baseUrl}/api/v1/me/sessions`, {
          headers: { Authorization: `Bearer ${first.data.accessToken}` },
        })
      ).status,
    ).toBe(401);
  });
  it('new and duplicate HTTP registrations return identical 201 bodies with different private mail', async () => {
    const csrf = await fetch(`${baseUrl}/api/v1/auth/csrf`);
    const { data } = (await csrf.json()) as { data: { csrfToken: string } };
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3100',
      'X-CSRF-Token': data.csrfToken,
      Cookie: csrf.headers.getSetCookie()[0]!.split(';')[0]!,
    };
    const input = { ...account, email: `registration-${randomUUID()}@example.com` };
    const register = () =>
      fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
    const first = await register();
    const body: unknown = await first.json();
    expect(first.status).toBe(201);
    expect(acceptedResponseSchema.safeParse(body).success).toBe(true);
    expect(mail.send.mock.calls.at(-1)![0].subject).toBe('Verify your LMS email');
    const duplicate = await register();
    expect(duplicate.status).toBe(201);
    expect(await duplicate.json()).toEqual(body);
    expect(duplicate.headers.getSetCookie()).toHaveLength(0);
    expect(mail.send.mock.calls.at(-1)![0]).toMatchObject({
      to: input.email,
      subject: 'Your LMS account already exists',
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(await prisma.authToken.count({ where: { userId: user.id } })).toBe(1);
  });
  it('simultaneous reset consumes the one-time token once and revokes all sessions', async () => {
    await auth.requestToken(account.email, 'RESET_PASSWORD');
    const message: string = mail.send.mock.calls.at(-1)![0].text;
    const token = new URL(message.match(/http:\/\/\S+/)![0]).searchParams.get('token')!;
    const results = await Promise.allSettled([
      auth.resetPassword({ token, password: 'replacement-password-123' }),
      auth.resetPassword({ token, password: 'replacement-password-456' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: account.email } });
    expect(await prisma.refreshSession.count({ where: { userId: user.id, revokedAt: null } })).toBe(
      0,
    );
    expect(
      await prisma.authToken.count({
        where: { userId: user.id, purpose: 'RESET_PASSWORD', consumedAt: null },
      }),
    ).toBe(0);
  });
});
