import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  AdminUserCreate,
  AdminUsersQuery,
  AdminUserUpdate,
  AvatarUpload,
  InstructorInvitation,
  ProfileUpdate,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { PolicyService } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { IdentityEvents } from '../auth/identity-events.service';
import { hashToken, newToken } from '../auth/token.util';
import { AuditService } from '../audit/audit.service';
import { UserPresenter } from './user.presenter';

type Transaction = Prisma.TransactionClient;
interface AvatarClaims {
  sub: string;
  key: string;
  contentType: AvatarUpload['contentType'];
  size: number;
}
export const userEtag = (user: { updatedAt: Date }): string => `"${user.updatedAt.toISOString()}"`;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presenter: UserPresenter,
    private readonly policy: PolicyService,
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly events: IdentityEvents,
    private readonly audit: AuditService,
  ) {}
  private async self(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
  async me(userId: string) {
    const user = await this.self(userId);
    const memberships = await this.prisma.workspaceMember.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        deletedAt: null,
        workspace: { deletedAt: null, status: 'ACTIVE' },
      },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        workspace: { select: { id: true, name: true, slug: true, kind: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { data: { ...(await this.presenter.present(user)), memberships }, etag: userEtag(user) };
  }
  private async updateActiveSelf(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`,
      );
      const active = await tx.user.findFirst({
        where: { id: userId, status: 'ACTIVE', deletedAt: null },
      });
      if (!active) throw new ForbiddenException('Active user required');
      return tx.user.update({ where: { id: userId }, data });
    });
  }
  async updateProfile(actor: AuthenticatedUser, input: ProfileUpdate) {
    const user = await this.updateActiveSelf(actor.id, {
      name: input.name,
      locale: input.locale,
      timezone: input.timezone,
    });
    await this.events.emit('user.profile_updated', { userId: actor.id });
    return { data: await this.presenter.present(user), etag: userEtag(user) };
  }
  async list(actor: AuthenticatedUser, query: AdminUsersQuery) {
    this.policy.assertPlatformAdmin(actor);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      status: query.status,
      platformRole: query.platformRole,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data: await Promise.all(users.map((user) => this.presenter.present(user))),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
  async get(actor: AuthenticatedUser, userId: string) {
    this.policy.assertPlatformAdmin(actor);
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User not found');
    await this.events.emit('admin.user_viewed', { actorId: actor.id, userId });
    return { data: await this.presenter.present(user), etag: userEtag(user) };
  }
  private checkEtag(user: User, etag: string | undefined): void {
    if (!etag)
      throw new HttpException(
        { code: 'PRECONDITION_REQUIRED', message: 'If-Match is required' },
        428,
      );
    if (etag !== userEtag(user))
      throw new ConflictException({
        code: 'VERSION_CONFLICT',
        message: 'User changed; reload before editing',
      });
  }
  private async lockAdminMutation(
    tx: Transaction,
    actor: AuthenticatedUser,
    userId: string,
  ): Promise<User> {
    // Serialize administrator changes so concurrent demotions cannot remove every super-admin.
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(120001)`);
    const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
    if (
      !currentActor ||
      currentActor.platformRole !== 'SUPER_ADMIN' ||
      currentActor.status !== 'ACTIVE' ||
      currentActor.deletedAt
    )
      throw new ForbiddenException();
    // Tenancy locks Workspace before User. Keep that order to serialize with owner transfers
    // and membership edits; re-read scope after obtaining the user lock to catch new memberships.
    const affected = await this.affectedWorkspaces(tx, userId);
    for (const workspace of affected)
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspace.id}::uuid FOR UPDATE`);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`);
    const lockedIds = new Set(affected.map((w) => w.id));
    if ((await this.affectedWorkspaces(tx, userId)).some((w) => !lockedIds.has(w.id)))
      throw new ConflictException('Workspace membership changed; retry the user command');
    const target = await tx.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!target) throw new NotFoundException('User not found');
    return target;
  }
  private affectedWorkspaces(tx: Transaction, userId: string) {
    return tx.workspace.findMany({
      where: { status: 'ACTIVE', deletedAt: null, OR: [
        { ownerId: userId },
        { members: { some: { userId, role: 'ADMIN', status: 'ACTIVE', deletedAt: null } } },
      ] },
      orderBy: { id: 'asc' },
      select: { id: true, ownerId: true },
    });
  }
  private async protectWorkspaceAdministration(tx: Transaction, userId: string) {
    for (const workspace of await this.affectedWorkspaces(tx, userId)) {
      if (workspace.ownerId === userId)
        throw new ConflictException('Transfer workspace ownership before suspending or deleting this user');
      const remaining = await tx.workspaceMember.count({ where: {
        workspaceId: workspace.id, role: 'ADMIN', status: 'ACTIVE', deletedAt: null,
        userId: { not: userId }, user: { status: 'ACTIVE', deletedAt: null },
      } });
      if (!remaining) throw new ConflictException('At least one active workspace administrator must remain');
    }
  }
  async update(
    actor: AuthenticatedUser,
    userId: string,
    input: AdminUserUpdate,
    etag: string | undefined,
    requestId: string = randomUUID(),
  ) {
    this.policy.assertPlatformAdmin(actor);
    const user = await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAdminMutation(tx, actor, userId);
      this.checkEtag(target, etag);
      const reducesAccess =
        input.status === 'SUSPENDED' ||
        (input.platformRole !== undefined && input.platformRole !== target.platformRole);
      if (actor.id === userId && reducesAccess)
        throw new ForbiddenException('Cannot suspend or change your own platform role');
      if (target.platformRole === 'SUPER_ADMIN' && reducesAccess) {
        const remaining = await tx.user.count({
          where: {
            platformRole: 'SUPER_ADMIN',
            status: 'ACTIVE',
            deletedAt: null,
            id: { not: userId },
          },
        });
        if (remaining === 0)
          throw new ConflictException('At least one active super-admin must remain');
      }
      if (input.status === 'SUSPENDED') await this.protectWorkspaceAdministration(tx, userId);
      const updated = await tx.user.update({
        where: { id: userId },
        data: { name: input.name, status: input.status, platformRole: input.platformRole },
      });
      if (reducesAccess)
        await tx.refreshSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await this.audit.append(tx, {
        action: 'admin.user_updated', resourceType: 'User', resourceId: userId,
        actorId: actor.id, workspaceId: null, requestId,
        changes: { reason: input.reason, status: input.status, platformRole: input.platformRole },
      });
      return updated;
    });
    await this.events.emit('admin.user_updated', {
      actorId: actor.id,
      userId,
      reason: input.reason,
      status: input.status ?? null,
      platformRole: input.platformRole ?? null,
    });
    return { data: await this.presenter.present(user), etag: userEtag(user) };
  }
  async remove(
    actor: AuthenticatedUser,
    userId: string,
    reason: string,
    etag: string | undefined,
    requestId: string = randomUUID(),
  ): Promise<void> {
    this.policy.assertPlatformAdmin(actor);
    await this.prisma.$transaction(async (tx) => {
      const target = await this.lockAdminMutation(tx, actor, userId);
      this.checkEtag(target, etag);
      if (actor.id === userId) throw new ForbiddenException('Cannot delete yourself');
      if (
        target.platformRole === 'SUPER_ADMIN' &&
        (await tx.user.count({
          where: {
            platformRole: 'SUPER_ADMIN',
            status: 'ACTIVE',
            deletedAt: null,
            id: { not: userId },
          },
        })) === 0
      )
        throw new ConflictException('At least one active super-admin must remain');
      await this.protectWorkspaceAdministration(tx, userId);
      if (await tx.workspace.count({ where: { ownerId: userId, deletedAt: null } }))
        throw new ConflictException('Transfer workspace ownership before deleting this user');
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: 'SUSPENDED' },
      });
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await this.audit.append(tx, { action: 'admin.user_deleted', resourceType: 'User', resourceId: userId, actorId: actor.id, workspaceId: null, requestId, changes: { reason } });
    });
    await this.events.emit('admin.user_deleted', { actorId: actor.id, userId, reason });
  }
  async create(actor: AuthenticatedUser, input: AdminUserCreate) {
    this.policy.assertPlatformAdmin(actor);
    const token = newToken();
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(120001)`);
        const admin = await tx.user.findUnique({ where: { id: actor.id } });
        if (
          !admin ||
          admin.platformRole !== 'SUPER_ADMIN' ||
          admin.status !== 'ACTIVE' ||
          admin.deletedAt
        )
          throw new ForbiddenException();
        return tx.user.create({
          data: {
            email: input.email,
            name: input.name,
            platformRole: 'STUDENT',
            authTokens: {
              create: {
                purpose: 'RESET_PASSWORD',
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
              },
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('User could not be created');
      throw error;
    }
    await this.sendLink(input.email, '/reset-password', token, 'Set your LMS password');
    await this.events.emit('admin.user_created', { actorId: actor.id, userId: user.id });
    return { data: await this.presenter.present(user) };
  }
  async inviteInstructor(
    actor: AuthenticatedUser,
    workspaceId: string,
    input: InstructorInvitation,
  ) {
    await this.policy.assertWorkspaceRole(actor, workspaceId, ['ADMIN']);
    const token = newToken();
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Workspace lock also serializes concurrent replacement invitations.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
      );
      const workspace = await tx.workspace.findFirst({
        where: { id: workspaceId, deletedAt: null },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      if (workspace.status !== 'ACTIVE') throw new ForbiddenException('Workspace is not active');
      const admin = await tx.user.findFirst({
        where: { id: actor.id, status: 'ACTIVE', deletedAt: null },
      });
      if (!admin) throw new ForbiddenException();
      if (
        admin.platformRole !== 'SUPER_ADMIN' &&
        !(await tx.workspaceMember.findFirst({
          where: {
            workspaceId,
            userId: actor.id,
            role: 'ADMIN',
            status: 'ACTIVE',
            deletedAt: null,
          },
        }))
      )
        throw new ForbiddenException();
      await tx.workspaceInvitation.updateMany({
        where: { workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.workspaceInvitation.create({
        data: {
          workspaceId,
          email: input.email,
          role: 'INSTRUCTOR',
          invitedById: actor.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
    await this.sendLink(
      input.email,
      '/accept-invitation',
      token,
      'You are invited to teach on LMS',
    );
    await this.events.emit('workspace.instructor_invited', {
      actorId: actor.id,
      workspaceId,
      invitationId: invitation.id,
    });
    return {
      data: {
        id: invitation.id,
        email: invitation.email,
        role: 'INSTRUCTOR' as const,
        expiresAt: invitation.expiresAt.toISOString(),
      },
    };
  }
  async avatarUpload(actor: AuthenticatedUser, input: AvatarUpload) {
    await this.self(actor.id);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
      input.contentType
    ];
    const key = `avatars/${actor.id}/${randomUUID()}.${extension}`;
    const url = await this.storage.createUploadUrl(key, input.contentType, 300);
    const uploadToken = await this.jwt.signAsync(
      { sub: actor.id, key, ...input },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithm: 'HS256',
        issuer: 'lms-avatar',
        audience: 'lms-api',
        expiresIn: 300,
      },
    );
    return {
      data: {
        url,
        method: 'PUT' as const,
        headers: { 'Content-Type': input.contentType },
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        uploadToken,
      },
    };
  }
  async completeAvatar(actor: AuthenticatedUser, uploadToken: string) {
    await this.self(actor.id);
    let claims: AvatarClaims;
    try {
      claims = await this.jwt.verifyAsync<AvatarClaims>(uploadToken, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithms: ['HS256'],
        issuer: 'lms-avatar',
        audience: 'lms-api',
      });
      if (
        claims.sub !== actor.id ||
        !claims.key.startsWith(`avatars/${actor.id}/`) ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(claims.contentType) ||
        !Number.isInteger(claims.size) ||
        claims.size < 1 ||
        claims.size > 5 * 1024 * 1024
      )
        throw new Error('Invalid upload');
    } catch {
      throw new BadRequestException('Invalid or expired upload token');
    }
    // Fetch only a server-generated signed storage URL. Bound the stream even if storage lies about Content-Length.
    const url = await this.storage.createDownloadUrl(claims.key, 60);
    let bytes: Buffer;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok || !response.body)
        throw new BadRequestException('Avatar upload is not available');
      if (
        response.headers.get('content-type')?.split(';')[0] !== claims.contentType ||
        Number(response.headers.get('content-length')) !== claims.size
      ) {
        await response.body.cancel();
        throw new BadRequestException('Avatar metadata does not match upload');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > claims.size) {
          await reader.cancel();
          throw new BadRequestException('Avatar is too large');
        }
        chunks.push(chunk.value);
      }
      if (size !== claims.size) throw new BadRequestException('Avatar size does not match upload');
      bytes = Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('Avatar storage is unavailable');
    }
    const valid =
      claims.contentType === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : claims.contentType === 'image/jpeg'
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new BadRequestException('Avatar does not contain the declared image format');
    const user = await this.updateActiveSelf(actor.id, { avatarKey: claims.key });
    await this.events.emit('user.avatar_updated', { userId: actor.id });
    return { data: await this.presenter.present(user) };
  }
  private async sendLink(to: string, path: string, token: string, subject: string): Promise<void> {
    const url = new URL(path, this.config.getOrThrow<string>('WEB_ORIGIN'));
    url.searchParams.set('token', token);
    try {
      await this.mail.send({ to, subject, text: `Open this link to continue: ${url.toString()}` });
    } catch {
      await this.events.emit('auth.email_delivery_failed', { purpose: path });
    }
  }
}
