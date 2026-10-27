import { Prisma } from '@prisma/client';
import { envSchema } from '../../config/env';
import { GoneException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { MailService } from '../../infrastructure/mail/mail.service';
import type { UserPresenter } from '../users/user.presenter';
import type { PasswordService } from './password.service';
import type { IdentityEvents } from './identity-events.service';
import { AuthService, hashToken } from './auth.service';

const user = {
  id: '5adb646b-87f8-4530-94fe-f5d6378971c8',
  email: 'user@example.com',
  name: 'User',
  passwordHash: 'argon-hash',
  platformRole: 'STUDENT',
  status: 'ACTIVE',
  deletedAt: null,
  emailVerifiedAt: null,
};
const token = 'a'.repeat(64);
const session = {
  id: 'session',
  userId: user.id,
  familyId: 'family',
  expiresAt: new Date(Date.now() + 86400000),
  consumedAt: null,
  revokedAt: null,
  user,
};
function setup() {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
    refreshSession: {
      findUnique: jest.fn().mockResolvedValue(session),
      create: jest.fn().mockResolvedValue({ ...session, id: 'child' }),
      update: jest.fn().mockResolvedValue(session),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
    authToken: { create: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    workspace: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  const passwords = {
    hash: jest.fn().mockResolvedValue('new-hash'),
    verify: jest.fn().mockResolvedValue(true),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access') };
  const config = {
    get: jest.fn().mockReturnValue(30),
    getOrThrow: jest.fn((key: string) =>
      key === 'WEB_ORIGIN' ? 'http://localhost:3100' : 's'.repeat(64),
    ),
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const presenter = { present: jest.fn().mockResolvedValue({ id: user.id, email: user.email }) };
  const service = new AuthService(
    db as unknown as PrismaService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    mail as unknown as MailService,
    presenter as unknown as UserPresenter,
    events as unknown as IdentityEvents,
  );
  return { service, db, passwords, jwt, config, mail, events };
}
describe('AuthService', () => {
  it('registers a student without trusting platform-role input and stores only token hashes', async () => {
    const { service, db, mail } = setup();
    await service.register({
      email: user.email,
      name: user.name,
      password: 'strong-password',
      onboardingMode: 'STUDENT',
    });
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ platformRole: 'STUDENT', passwordHash: 'new-hash' }),
    });
    const sent = new URL(
      mail.send.mock.calls[0]![0].text.match(/http:\/\/\S+/)![0],
    ).searchParams.get('token')!;
    expect(db.authToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tokenHash: hashToken(sent), purpose: 'VERIFY_EMAIL' }),
    });
    expect(db.workspace.create).not.toHaveBeenCalled();
  });
  it('returns identical accepted bodies for new and duplicate registrations while hashing both', async () => {
    const { service, db, passwords, mail, events } = setup();
    const input = {
      email: user.email,
      name: user.name,
      password: 'strong-password',
      onboardingMode: 'INSTRUCTOR' as const,
    };
    const accepted = await service.register(input);
    jest.clearAllMocks();
    db.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7' }),
    );
    expect(await service.register(input)).toEqual(accepted);
    expect(accepted).toEqual({ data: { message: 'Check your email for next steps.' } });
    expect(passwords.hash).toHaveBeenCalledWith(input.password);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user.email,
        subject: 'Your LMS account already exists',
        text: expect.stringContaining('/forgot-password'),
      }),
    );
    expect(db.authToken.create).not.toHaveBeenCalled();
    expect(db.workspace.create).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalledWith('user.registered', expect.anything());
  });
  it('preserves the accepted duplicate response even if notification delivery fails', async () => {
    const { service, db, mail, events } = setup();
    db.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '7' }),
    );
    mail.send.mockRejectedValueOnce(new Error('smtp unavailable'));
    await expect(
      service.register({
        email: user.email,
        name: user.name,
        password: 'strong-password',
        onboardingMode: 'STUDENT',
      }),
    ).resolves.toEqual({ data: { message: 'Check your email for next steps.' } });
    expect(events.emit).toHaveBeenCalledWith('auth.email_delivery_failed', {
      purpose: 'ACCOUNT_EXISTS',
    });
  });
  it('does not mask unrelated registration database failures', async () => {
    const { service, db } = setup();
    const failure = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '7',
    });
    db.user.create.mockRejectedValueOnce(failure);
    db.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.register({
        email: user.email,
        name: user.name,
        password: 'strong-password',
        onboardingMode: 'STUDENT',
      }),
    ).rejects.toBe(failure);
  });
  it('instructor onboarding only creates a personal ADMIN membership, never platform privileges', async () => {
    const { service, db } = setup();
    await service.register({
      email: user.email,
      name: user.name,
      password: 'strong-password',
      onboardingMode: 'INSTRUCTOR',
    });
    expect(db.workspace.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'PERSONAL',
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'ADMIN', status: 'ACTIVE' } },
      }),
    });
  });
  it('atomically consumes the old session and creates a child with a fixed family deadline', async () => {
    const { service, db, jwt } = setup();
    const result = await service.refresh(token, { userAgent: 'browser', ip: '127.0.0.1' });
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.refreshSession.update).toHaveBeenCalledWith({
      where: { id: session.id },
      data: { consumedAt: expect.any(Date) },
    });
    expect(db.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentId: session.id,
        familyId: session.familyId,
        expiresAt: session.expiresAt,
        tokenHash: hashToken(result.refreshToken),
        ipHash: hashToken('127.0.0.1'),
      }),
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: user.id, fid: session.familyId }),
      expect.objectContaining({
        expiresIn: 600,
        algorithm: 'HS256',
        issuer: 'lms-api',
        audience: 'lms-web',
      }),
    );
    expect(result.data).not.toHaveProperty('refreshToken');
  });
  it('recovers a lost response by rotating the unused child without revoking the family', async () => {
    const { service, db, jwt } = setup();
    db.refreshSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, consumedAt: new Date() })
      .mockResolvedValueOnce({ ...session, id: 'child' });
    db.refreshSession.create.mockResolvedValueOnce({ ...session, id: 'grandchild' });
    const result = await service.refresh(token, {});
    expect(db.refreshSession.update).toHaveBeenCalledWith({
      where: { id: 'child' },
      data: { consumedAt: expect.any(Date) },
    });
    expect(db.refreshSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentId: 'child',
        tokenHash: hashToken(result.refreshToken),
        expiresAt: session.expiresAt,
      }),
    });
    expect(db.refreshSession.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sid: 'grandchild' }),
      expect.anything(),
    );
  });
  it.each([
    null,
    { ...session, id: 'child', consumedAt: new Date() },
    { ...session, id: 'child', revokedAt: new Date() },
    { ...session, id: 'child', expiresAt: new Date(0) },
  ])('revokes on reuse when the child cannot be recovered: %p', async (child) => {
    const { service, db } = setup();
    db.refreshSession.findUnique
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, consumedAt: new Date() })
      .mockResolvedValueOnce(child);
    await expect(service.refresh(token, {})).rejects.toMatchObject({
      response: { code: 'REFRESH_REUSED' },
    });
    expect(db.refreshSession.updateMany).toHaveBeenCalled();
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });
  it('uses the configured grace duration', async () => {
    const { service, db, config } = setup();
    config.get.mockReturnValue(1);
    db.refreshSession.findUnique.mockResolvedValue({
      ...session,
      consumedAt: new Date(Date.now() - 2000),
    });
    await expect(service.refresh(token, {})).rejects.toMatchObject({
      response: { code: 'REFRESH_REUSED' },
    });
    expect(db.refreshSession.findUnique).toHaveBeenCalledTimes(2);
  });
  it('validates the grace period with a default of 30 seconds', () => {
    const schema = envSchema.shape.REFRESH_REUSE_GRACE_SECONDS;
    expect(schema.parse(undefined)).toBe(30);
    expect(schema.parse('60')).toBe(60);
    for (const value of ['-1', '301', '1.5', 'invalid'])
      expect(schema.safeParse(value).success).toBe(false);
  });
  it('commits family revocation on reuse before throwing REFRESH_REUSED', async () => {
    const { service, db, events } = setup();
    db.refreshSession.findUnique.mockResolvedValue({
      ...session,
      consumedAt: new Date(Date.now() - 31000),
    });
    await expect(service.refresh(token, {})).rejects.toMatchObject({
      response: { code: 'REFRESH_REUSED' },
    });
    expect(db.$transaction).toHaveReturned();
    await expect(db.$transaction.mock.results[0]!.value).resolves.toMatchObject({ kind: 'reuse' });
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.refreshSession.create).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith('auth.refresh_reused', {
      userId: user.id,
      familyId: 'family',
    });
  });
  it.each([
    { revokedAt: new Date() },
    { expiresAt: new Date(0) },
    { user: { ...user, status: 'SUSPENDED' } },
    { user: { ...user, deletedAt: new Date() } },
  ])('rejects unusable sessions: %p', async (change) => {
    const { service, db } = setup();
    db.refreshSession.findUnique.mockResolvedValue({ ...session, ...change });
    await expect(service.refresh(token, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });
  it('performs password verification for unknown accounts and returns generic failure', async () => {
    const { service, db, passwords } = setup();
    db.user.findUnique.mockResolvedValue(null);
    passwords.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: user.email, password: 'wrong' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith(undefined, 'wrong');
  });
  it('does not mint a session after a concurrent password change', async () => {
    const { service, db } = setup();
    db.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ ...user, passwordHash: 'changed' });
    await expect(
      service.login({ email: user.email, password: 'password' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.refreshSession.create).not.toHaveBeenCalled();
  });
  it('rejects expired and already consumed reset tokens without changing a password', async () => {
    const { service, db } = setup();
    db.authToken.findUnique.mockResolvedValue({
      id: 'reset',
      userId: user.id,
      purpose: 'RESET_PASSWORD',
      consumedAt: new Date(),
      user,
      expiresAt: new Date(Date.now() + 10000),
    });
    await expect(
      service.resetPassword({ token, password: 'new-password-12' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('reset consumes all reset tokens and revokes every family', async () => {
    const { service, db } = setup();
    db.authToken.findUnique.mockResolvedValue({
      id: 'reset',
      userId: user.id,
      purpose: 'RESET_PASSWORD',
      consumedAt: null,
      user,
      expiresAt: new Date(Date.now() + 10000),
    });
    await service.resetPassword({ token, password: 'new-password-12' });
    expect(db.authToken.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, purpose: 'RESET_PASSWORD', consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
  it('unknown recovery addresses have the same empty result and send no mail', async () => {
    const { service, db, mail } = setup();
    db.user.findUnique.mockResolvedValue(null);
    await expect(
      service.requestToken('missing@example.com', 'RESET_PASSWORD'),
    ).resolves.toBeUndefined();
    expect(mail.send).not.toHaveBeenCalled();
  });
  it('password change revokes only other families and invalidates pending reset capabilities', async () => {
    const { service, db } = setup();
    await service.changePassword({ id: user.id, familyId: 'current' } as never, {
      currentPassword: 'old',
      password: 'new-password-12',
    });
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, familyId: { not: 'current' }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.authToken.updateMany).toHaveBeenCalled();
  });
  it('own family revocation always constrains by actor, even for a foreign family ID', async () => {
    const { service, db } = setup();
    await service.revokeFamily({ id: user.id } as never, 'foreign');
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, familyId: 'foreign', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
