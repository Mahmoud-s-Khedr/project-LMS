import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { MailService } from '../../infrastructure/mail/mail.service';
import type { StorageService } from '../../infrastructure/storage/storage.service';
import type { PolicyService } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import type { AuditService } from '../audit/audit.service';
import type { IdentityEvents } from '../auth/identity-events.service';
import type { UserPresenter } from './user.presenter';
import { UsersService, userEtag } from './users.service';

const actor: AuthenticatedUser = {
  id: 'admin',
  email: 'admin@example.com',
  name: 'Admin',
  platformRole: 'SUPER_ADMIN',
  emailVerifiedAt: new Date(),
  sessionId: 'session',
  familyId: 'family',
};
const user = {
  id: 'target',
  email: 'user@example.com',
  name: 'User',
  platformRole: 'STUDENT',
  status: 'ACTIVE',
  deletedAt: null,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
function setup() {
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn().mockResolvedValue({ ...actor, status: 'ACTIVE', deletedAt: null }),
      findFirst: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([user]),
      create: jest.fn().mockResolvedValue(user),
    },
    refreshSession: { updateMany: jest.fn() },
    authToken: { updateMany: jest.fn() },
    workspace: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue({ id: 'workspace', status: 'ACTIVE' }),
    },
    workspaceMember: {
      findFirst: jest.fn().mockResolvedValue({ id: 'member' }),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workspaceInvitation: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'invite', email: user.email, expiresAt: new Date() }),
      updateMany: jest.fn(),
    },
  };
  db.$transaction.mockImplementation(
    async (input: ((tx: typeof db) => unknown) | Promise<unknown>[]) =>
      typeof input === 'function' ? input(db) : Promise.all(input),
  );
  const policy = {
    assertPlatformAdmin: jest.fn((user: AuthenticatedUser) => {
      if (user.platformRole !== 'SUPER_ADMIN') throw new ForbiddenException();
    }),
    assertWorkspaceRole: jest.fn().mockResolvedValue(undefined),
  };
  const storage = {
    createUploadUrl: jest.fn().mockResolvedValue('https://storage/upload'),
    createDownloadUrl: jest.fn().mockResolvedValue('https://storage/download'),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('signed-upload'), verifyAsync: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('http://localhost:3100') };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const presenter = {
    present: jest
      .fn()
      .mockImplementation(async (value: typeof user) => ({ id: value.id, email: value.email })),
  };
  const service = new UsersService(
    db as unknown as PrismaService,
    presenter as unknown as UserPresenter,
    policy as unknown as PolicyService,
    storage as unknown as StorageService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    mail as unknown as MailService,
    events as unknown as IdentityEvents,
    { append: jest.fn().mockResolvedValue({}) } as unknown as AuditService,
  );
  return { service, db, policy, storage, jwt, mail, events };
}
describe('UsersService', () => {
  it('denies workspace admins access to the platform user inventory', async () => {
    const { service, db } = setup();
    await expect(
      service.list({ ...actor, platformRole: 'ADMIN' }, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
  it('bounds and filters the admin list without exposing Prisma user records', async () => {
    const { service, db } = setup();
    const result = await service.list(actor, {
      page: 2,
      pageSize: 10,
      search: 'Ada',
      status: 'SUSPENDED',
    });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({ status: 'SUSPENDED', deletedAt: null }),
      }),
    );
    expect(result.data[0]).toEqual({ id: user.id, email: user.email });
    expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 1, totalPages: 1 });
  });
  it('requires the latest ETag before administrator mutations', async () => {
    const { service, db } = setup();
    await expect(
      service.update(actor, user.id, { status: 'SUSPENDED', reason: 'Abuse' }, undefined),
    ).rejects.toMatchObject({ status: 428 });
    await expect(
      service.update(actor, user.id, { status: 'SUSPENDED', reason: 'Abuse' }, 'stale'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('suspension revokes every refresh family in the same transaction', async () => {
    const { service, db, events } = setup();
    await service.update(actor, user.id, { status: 'SUSPENDED', reason: 'Abuse' }, userEtag(user));
    expect(db.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'admin.user_updated',
      expect.objectContaining({ userId: user.id, actorId: actor.id, reason: 'Abuse' }),
    );
  });
  it('rejects self-lockout and the last super-admin demotion', async () => {
    const { service, db } = setup();
    db.user.findFirst.mockResolvedValue({ ...user, id: actor.id, platformRole: 'SUPER_ADMIN' });
    await expect(
      service.update(actor, actor.id, { status: 'SUSPENDED', reason: 'Test' }, userEtag(user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    db.user.findFirst.mockResolvedValue({ ...user, platformRole: 'SUPER_ADMIN' });
    db.user.count.mockResolvedValue(0);
    await expect(
      service.update(actor, user.id, { platformRole: 'STUDENT', reason: 'Test' }, userEtag(user)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rechecks the acting admin after taking the mutation lock', async () => {
    const { service, db } = setup();
    db.user.findUnique.mockResolvedValue({ ...actor, status: 'SUSPENDED' });
    await expect(
      service.update(actor, user.id, { status: 'SUSPENDED', reason: 'Test' }, userEtag(user)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('requires workspace ownership transfer before deletion', async () => {
    const { service, db } = setup();
    db.workspace.count.mockResolvedValue(1);
    await expect(
      service.remove(actor, user.id, 'Delete request', userEtag(user)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('invitation issuance authorizes workspace ADMIN and persists only a token hash', async () => {
    const { service, db, policy, mail } = setup();
    const result = await service.inviteInstructor(actor, 'workspace', {
      email: user.email,
      role: 'INSTRUCTOR',
    });
    expect(policy.assertWorkspaceRole).toHaveBeenCalledWith(actor, 'workspace', ['ADMIN']);
    const text: string = mail.send.mock.calls[0]![0].text;
    const token = new URL(text.split('continue: ')[1]!).searchParams.get('token');
    expect(db.workspaceInvitation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'INSTRUCTOR',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(db.workspaceInvitation.create.mock.calls[0]![0].data.tokenHash).not.toBe(token);
    expect(result.data).not.toHaveProperty('tokenHash');
  });
  it('avatar presign binds generated key, owner, MIME and size without mutating profile', async () => {
    const { service, db, jwt, storage } = setup();
    await service.avatarUpload(actor, { contentType: 'image/png', size: 32 });
    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^avatars\/admin\/[a-f0-9-]+\.png$/),
      'image/png',
      300,
    );
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: actor.id, contentType: 'image/png', size: 32 }),
      expect.objectContaining({ issuer: 'lms-avatar', expiresIn: 300 }),
    );
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('rejects completing another user avatar before accessing storage', async () => {
    const { service, jwt, storage } = setup();
    jwt.verifyAsync.mockResolvedValue({
      sub: 'other',
      key: 'avatars/other/key',
      contentType: 'image/png',
      size: 8,
    });
    await expect(service.completeAvatar(actor, 'token')).rejects.toMatchObject({ status: 400 });
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();
  });
  it('verifies actual bytes and metadata before committing an avatar', async () => {
    const { service, db, jwt } = setup();
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    jwt.verifyAsync.mockResolvedValue({
      sub: actor.id,
      key: `avatars/${actor.id}/key.png`,
      contentType: 'image/png',
      size: 8,
    });
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(bytes, { headers: { 'content-type': 'image/png', 'content-length': '8' } }),
      );
    try {
      await service.completeAvatar(actor, 'token');
      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: actor.id },
        data: { avatarKey: `avatars/${actor.id}/key.png` },
      });
    } finally {
      fetchMock.mockRestore();
    }
  });
  it('rejects an HTML payload claiming to be a PNG', async () => {
    const { service, db, jwt } = setup();
    jwt.verifyAsync.mockResolvedValue({
      sub: actor.id,
      key: `avatars/${actor.id}/key.png`,
      contentType: 'image/png',
      size: 8,
    });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('notimage', {
        headers: { 'content-type': 'image/png', 'content-length': '8' },
      }),
    );
    try {
      await expect(service.completeAvatar(actor, 'token')).rejects.toMatchObject({ status: 400 });
      expect(db.user.update).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
