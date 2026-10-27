import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import type {
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import {
  ACCESS_TOKEN_SECONDS,
  JWT_AUDIENCE,
  JWT_ISSUER,
  type AuthenticatedUser,
} from '../../common/authz/auth.types';
import { UserPresenter } from '../users/user.presenter';
import { PasswordService } from './password.service';
import { IdentityEvents } from './identity-events.service';

import { hashToken, newToken } from './token.util';
export { hashToken, newToken } from './token.util';
const FAMILY_MS = 30 * 24 * 60 * 60 * 1000;
type Transaction = Prisma.TransactionClient;
export interface DeviceContext {
  userAgent?: string;
  ip?: string;
}
export interface SessionResult {
  refreshToken: string;
  expiresAt: Date;
  data: {
    accessToken: string;
    expiresIn: 600;
    user: Awaited<ReturnType<UserPresenter['present']>>;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly presenter: UserPresenter,
    private readonly events: IdentityEvents,
  ) {}

  private async lockUser(tx: Transaction, userId: string): Promise<void> {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`);
  }
  private assertActive(user: User | null): asserts user is User {
    if (!user || user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Invalid credentials or session');
  }
  private device(device: DeviceContext) {
    return {
      userAgent: device.userAgent?.slice(0, 512),
      ipHash: device.ip ? hashToken(device.ip) : undefined,
    };
  }
  private async result(
    user: User,
    session: { id: string; familyId: string; expiresAt: Date },
    refreshToken: string,
  ): Promise<SessionResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id, fid: session.familyId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: ACCESS_TOKEN_SECONDS,
        jwtid: randomUUID(),
      },
    );
    return {
      refreshToken,
      expiresAt: session.expiresAt,
      data: { accessToken, expiresIn: 600, user: await this.presenter.present(user) },
    };
  }
  async register(input: RegisterInput) {
    const passwordHash = await this.passwords.hash(input.password);
    const verificationToken = newToken();
    let user: User;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: input.email, name: input.name, passwordHash, platformRole: 'STUDENT' },
        });
        await tx.authToken.create({
          data: {
            userId: created.id,
            purpose: 'VERIFY_EMAIL',
            tokenHash: hashToken(verificationToken),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        if (input.onboardingMode === 'INSTRUCTOR') {
          await tx.workspace.create({
            data: {
              kind: 'PERSONAL',
              slug: `instructor-${randomBytes(10).toString('hex')}`,
              name: `${input.name}'s workspace`,
              ownerId: created.id,
              members: { create: { userId: created.id, role: 'ADMIN', status: 'ACTIVE' } },
            },
          });
        }
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Check the email after rollback: unrelated unique violations must still fail.
        const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
        if (!existing) throw error;
        await this.sendAccountExistsEmail(existing.email);
        return this.registrationAccepted();
      }
      throw error;
    }
    await this.events.emit('user.registered', {
      userId: user.id,
      onboardingMode: input.onboardingMode,
    });
    await this.sendTokenEmail(user.email, verificationToken, 'VERIFY_EMAIL');
    return this.registrationAccepted();
  }
  async login(input: LoginInput, device: DeviceContext): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid = await this.passwords.verify(user?.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials or session');
    this.assertActive(user);
    const refreshToken = newToken();
    const session = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      this.assertActive(current);
      // A reset/change during expensive Argon2 verification cannot mint a session with stale credentials.
      if (current.passwordHash !== user.passwordHash)
        throw new UnauthorizedException('Invalid credentials or session');
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return tx.refreshSession.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(Date.now() + FAMILY_MS),
          ...this.device(device),
        },
      });
    });
    await this.events.emit('user.logged_in', { userId: user.id, familyId: session.familyId });
    return this.result(user, session, refreshToken);
  }
  async refresh(token: string | undefined, device: DeviceContext): Promise<SessionResult> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const previous = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!previous) throw new UnauthorizedException();
    const refreshToken = newToken();
    const outcome = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, previous.userId);
      const session = await tx.refreshSession.findUnique({
        where: { id: previous.id },
        include: { user: true },
      });
      if (!session) return { kind: 'invalid' as const };
      const now = new Date();
      let parent = session;
      if (session.consumedAt) {
        const graceMs = this.config.get<number>('REFRESH_REUSE_GRACE_SECONDS', 30) * 1000;
        const ageMs = now.getTime() - session.consumedAt.getTime();
        const child =
          ageMs >= 0 && ageMs <= graceMs
            ? await tx.refreshSession.findUnique({ where: { parentId: session.id } })
            : null;
        if (
          !session.revokedAt &&
          session.expiresAt > now &&
          session.user.status === 'ACTIVE' &&
          !session.user.deletedAt &&
          child &&
          child.userId === session.userId &&
          child.familyId === session.familyId &&
          !child.revokedAt &&
          !child.consumedAt &&
          child.expiresAt > now
        ) {
          // Raw child tokens are never stored. Rotate once more to recover a lost response.
          parent = { ...child, user: session.user };
        } else {
          await tx.refreshSession.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'reuse' as const, userId: session.userId, familyId: session.familyId };
        }
      }
      if (
        parent.revokedAt ||
        parent.expiresAt <= now ||
        session.user.status !== 'ACTIVE' ||
        session.user.deletedAt
      )
        return { kind: 'invalid' as const };
      await tx.refreshSession.update({
        where: { id: parent.id },
        data: { consumedAt: now },
      });
      const child = await tx.refreshSession.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          parentId: parent.id,
          tokenHash: hashToken(refreshToken),
          expiresAt: session.expiresAt,
          ...this.device(device),
        },
      });
      return { kind: 'ok' as const, user: session.user, session: child };
    });
    if (outcome.kind === 'reuse') {
      await this.events.emit('auth.refresh_reused', {
        userId: outcome.userId,
        familyId: outcome.familyId,
      });
      throw new UnauthorizedException({
        code: 'REFRESH_REUSED',
        message: 'Session revoked. Sign in again.',
      });
    }
    if (outcome.kind !== 'ok') throw new UnauthorizedException();
    return this.result(outcome.user, outcome.session, refreshToken);
  }
  async logout(token: string | undefined): Promise<void> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) return;
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, session.userId);
      await tx.refreshSession.updateMany({
        where: { userId: session.userId, familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.events.emit('user.logged_out', {
      userId: session.userId,
      familyId: session.familyId,
    });
  }
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      await tx.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.events.emit('user.sessions_revoked', { userId });
  }
  async requestToken(email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD'): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      (purpose === 'VERIFY_EMAIL' && user.emailVerifiedAt)
    )
      return;
    const token = newToken();
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (
        !current ||
        current.deletedAt ||
        current.status !== 'ACTIVE' ||
        (purpose === 'VERIFY_EMAIL' && current.emailVerifiedAt)
      )
        return false;
      await tx.authToken.updateMany({
        where: { userId: user.id, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.authToken.create({
        data: {
          userId: user.id,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(
            Date.now() + (purpose === 'VERIFY_EMAIL' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000),
          ),
        },
      });
      return true;
    });
    if (created) await this.sendTokenEmail(user.email, token, purpose);
  }
  private async consumeToken(
    token: string,
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
    passwordHash?: string,
  ): Promise<string> {
    const found = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!found || found.purpose !== purpose) throw new GoneException('Invalid or expired token');
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, found.userId);
      const current = await tx.authToken.findUnique({
        where: { id: found.id },
        include: { user: true },
      });
      if (
        !current ||
        current.consumedAt ||
        current.expiresAt <= new Date() ||
        current.user.status !== 'ACTIVE' ||
        current.user.deletedAt
      )
        throw new GoneException('Invalid or expired token');
      await tx.authToken.updateMany({
        where: { userId: current.userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.user.update({
        where: { id: current.userId },
        data:
          purpose === 'VERIFY_EMAIL'
            ? { emailVerifiedAt: new Date() }
            : { passwordHash, passwordChangedAt: new Date() },
      });
      if (purpose === 'RESET_PASSWORD')
        await tx.refreshSession.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return current.userId;
    });
  }
  async verifyEmail(token: string): Promise<void> {
    const userId = await this.consumeToken(token, 'VERIFY_EMAIL');
    await this.events.emit('user.email_verified', { userId });
  }
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const passwordHash = await this.passwords.hash(input.password);
    const userId = await this.consumeToken(input.token, 'RESET_PASSWORD', passwordHash);
    await this.events.emit('user.password_reset', { userId });
  }
  async changePassword(actor: AuthenticatedUser, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!(await this.passwords.verify(user?.passwordHash, input.currentPassword)))
      throw new UnauthorizedException('Invalid credentials');
    this.assertActive(user);
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, actor.id);
      const current = await tx.user.findUnique({ where: { id: actor.id } });
      this.assertActive(current);
      if (current.passwordHash !== user.passwordHash)
        throw new UnauthorizedException('Credentials changed. Retry.');
      await tx.user.update({
        where: { id: actor.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
      await tx.refreshSession.updateMany({
        where: { userId: actor.id, familyId: { not: actor.familyId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.authToken.updateMany({
        where: { userId: actor.id, purpose: 'RESET_PASSWORD', consumedAt: null },
        data: { consumedAt: new Date() },
      });
    });
    await this.events.emit('user.password_changed', { userId: actor.id });
  }
  async sessions(actor: AuthenticatedUser) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId: actor.id, revokedAt: null, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      data: sessions.map((session) => ({
        familyId: session.familyId,
        current: session.familyId === actor.familyId,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        userAgent: session.userAgent,
      })),
    };
  }
  async revokeFamily(actor: AuthenticatedUser, familyId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, actor.id);
      await tx.refreshSession.updateMany({
        where: { userId: actor.id, familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
    await this.events.emit('user.session_revoked', { userId: actor.id, familyId });
  }
  private registrationAccepted() {
    return { data: { message: 'Check your email for next steps.' } };
  }
  private async sendAccountExistsEmail(to: string): Promise<void> {
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN');
    try {
      await this.mail.send({
        to,
        subject: 'Your LMS account already exists',
        text: `An account already exists for this email. Sign in: ${new URL('/login', origin).toString()}\nOr reset your password: ${new URL('/forgot-password', origin).toString()}\nIf you did not request this, ignore this email.`,
      });
    } catch {
      await this.events.emit('auth.email_delivery_failed', { purpose: 'ACCOUNT_EXISTS' });
    }
  }
  private async sendTokenEmail(
    to: string,
    token: string,
    purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD',
  ): Promise<void> {
    const path = purpose === 'VERIFY_EMAIL' ? '/verify-email' : '/reset-password';
    const url = new URL(path, this.config.getOrThrow<string>('WEB_ORIGIN'));
    url.searchParams.set('token', token);
    try {
      await this.mail.send({
        to,
        subject: purpose === 'VERIFY_EMAIL' ? 'Verify your LMS email' : 'Reset your LMS password',
        text: `Open this link to continue: ${url.toString()}\nIf you did not request this, ignore this email.`,
      });
    } catch {
      await this.events.emit('auth.email_delivery_failed', { purpose });
    }
  }
}
