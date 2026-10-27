import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

function context(request: object): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => class Test {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
function setup() {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({
      sub: 'user',
      sid: 'session',
      fid: 'family',
      jti: 'jwt',
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
  };
  const config = { getOrThrow: jest.fn().mockReturnValue('secret') };
  const session = {
    id: 'session',
    userId: 'user',
    familyId: 'family',
    expiresAt: new Date(Date.now() + 100000),
    consumedAt: new Date(),
    revokedAt: null,
    user: {
      id: 'user',
      email: 'user@example.com',
      name: 'User',
      status: 'ACTIVE',
      deletedAt: null,
      platformRole: 'STUDENT',
      emailVerifiedAt: null,
    },
  };
  const prisma = { refreshSession: { findUnique: jest.fn().mockResolvedValue(session) } };
  const guard = new JwtAuthGuard(
    reflector as unknown as Reflector,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
  );
  return { guard, reflector, jwt, prisma, session };
}
describe('JwtAuthGuard', () => {
  it('allows only explicitly public endpoints without a token', async () => {
    const { guard, reflector, prisma } = setup();
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context({ headers: {} }))).resolves.toBe(true);
    expect(prisma.refreshSession.findUnique).not.toHaveBeenCalled();
  });
  it('denies an unmarked route with no authorization', async () => {
    await expect(setup().guard.canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('checks issuer, audience, algorithm and loads current database role despite consumed rotation parent', async () => {
    const { guard, jwt } = setup();
    const request = { headers: { authorization: 'Bearer access' } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith(
      'access',
      expect.objectContaining({ algorithms: ['HS256'], issuer: 'lms-api', audience: 'lms-web' }),
    );
    expect(request).toHaveProperty('user.platformRole', 'STUDENT');
  });
  it.each([
    { revokedAt: new Date() },
    { expiresAt: new Date(0) },
    { userId: 'other' },
    { familyId: 'other' },
  ])('rejects changed session state %p', async (change) => {
    const { guard, prisma, session } = setup();
    prisma.refreshSession.findUnique.mockResolvedValue({ ...session, ...change });
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer access' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it.each([{ status: 'SUSPENDED' }, { deletedAt: new Date() }])(
    'rejects inactive identities %p',
    async (change) => {
      const { guard, prisma, session } = setup();
      prisma.refreshSession.findUnique.mockResolvedValue({
        ...session,
        user: { ...session.user, ...change },
      });
      await expect(
        guard.canActivate(context({ headers: { authorization: 'Bearer access' } })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
  it('does not accept avatar-purpose tokens as access JWTs', async () => {
    const { guard, jwt } = setup();
    jwt.verifyAsync.mockRejectedValue(new Error('wrong issuer'));
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer avatar' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  it('allows active users on endpoints without platform-role requirements', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(context({ user: { platformRole: 'STUDENT' } }))).toBe(true);
  });
  it('denies workspace ADMIN from platform administration', () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPER_ADMIN']);
    expect(() => guard.canActivate(context({ user: { platformRole: 'ADMIN' } }))).toThrow(
      ForbiddenException,
    );
  });
  it('allows exactly the required platform role', () => {
    reflector.getAllAndOverride.mockReturnValue(['SUPER_ADMIN']);
    expect(guard.canActivate(context({ user: { platformRole: 'SUPER_ADMIN' } }))).toBe(true);
  });
});
