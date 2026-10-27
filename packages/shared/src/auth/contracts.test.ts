import { describe, expect, it } from 'vitest';
import {
  acceptedResponseSchema,
  authResponseSchema,
  registerSchema,
  resetPasswordSchema,
  sessionSchema,
} from './index';
import {
  adminUserUpdateSchema,
  adminUsersQuerySchema,
  avatarUploadSchema,
  membershipSchema,
  profileUpdateSchema,
  userSchema,
} from '../users';

describe('Identity contracts', () => {
  it('accepts generic registration messages without exposing user identity', () => {
    expect(
      acceptedResponseSchema.safeParse({ data: { message: 'Check your email for next steps.' } })
        .success,
    ).toBe(true);
    expect(
      acceptedResponseSchema.safeParse({
        data: { message: 'Check your email for next steps.', id: 'existing-user' },
      }).success,
    ).toBe(false);
  });
  it('normalizes email and defaults signup to student', () => {
    expect(
      registerSchema.parse({
        email: ' Ada@Example.com ',
        name: ' Ada ',
        password: 'long-password-12',
      }),
    ).toMatchObject({ email: 'ada@example.com', name: 'Ada', onboardingMode: 'STUDENT' });
  });
  it('rejects privileged signup/profile fields and weak passwords', () => {
    expect(
      registerSchema.safeParse({
        email: 'ada@example.com',
        name: 'Ada',
        password: 'long-password-12',
        platformRole: 'SUPER_ADMIN',
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ email: 'ada@example.com', name: 'Ada', password: 'short' })
        .success,
    ).toBe(false);
    expect(profileUpdateSchema.safeParse({ platformRole: 'SUPER_ADMIN' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ email: 'other@example.com' }).success).toBe(false);
  });
  it('restricts platform roles and requires audit reasons', () => {
    expect(adminUserUpdateSchema.safeParse({ platformRole: 'ADMIN', reason: 'Test' }).success).toBe(
      false,
    );
    expect(adminUserUpdateSchema.safeParse({ status: 'SUSPENDED' }).success).toBe(false);
  });
  it('bounds pagination, rejects arbitrary ORM filters and invalid IANA zones', () => {
    expect(adminUsersQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(adminUsersQuerySchema.safeParse({ include: 'passwordHash' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ timezone: 'Not/AZone' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ timezone: 'Africa/Cairo' }).success).toBe(true);
  });
  it('accepts only bounded non-SVG avatar images and opaque reset tokens', () => {
    expect(avatarUploadSchema.safeParse({ contentType: 'image/svg+xml', size: 50 }).success).toBe(
      false,
    );
    expect(avatarUploadSchema.safeParse({ contentType: 'image/png', size: 5242881 }).success).toBe(
      false,
    );
    expect(
      resetPasswordSchema.safeParse({ token: 'arbitrary', password: 'long-password-12' }).success,
    ).toBe(false);
  });
  it('rejects secret fields on response schemas and disallows SUPER_ADMIN on tenant memberships', () => {
    const validUser = {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'ada@example.com',
      name: 'Ada',
      platformRole: 'STUDENT',
      status: 'ACTIVE',
      emailVerifiedAt: null,
      locale: 'en',
      timezone: 'UTC',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
      avatarUrl: null,
    };
    expect(userSchema.safeParse(validUser).success).toBe(true);
    expect(userSchema.safeParse({ ...validUser, passwordHash: 'secret' }).success).toBe(false);
    expect(
      authResponseSchema.safeParse({
        data: {
          accessToken: 'jwt',
          expiresIn: 600,
          user: validUser,
          refreshToken: 'secret',
        },
      }).success,
    ).toBe(false);
    expect(
      sessionSchema.safeParse({
        familyId: '00000000-0000-4000-8000-000000000002',
        current: true,
        createdAt: '2026-10-26T00:00:00.000Z',
        expiresAt: '2026-11-25T00:00:00.000Z',
        userAgent: null,
        tokenHash: 'secret',
      }).success,
    ).toBe(false);
    const validMembership = {
      id: '00000000-0000-4000-8000-000000000003',
      workspaceId: '00000000-0000-4000-8000-000000000004',
      role: 'ADMIN',
      workspace: {
        id: '00000000-0000-4000-8000-000000000004',
        name: 'Workspace',
        slug: 'workspace',
        kind: 'ACADEMY',
      },
    };
    expect(membershipSchema.safeParse(validMembership).success).toBe(true);
    expect(membershipSchema.safeParse({ ...validMembership, role: 'SUPER_ADMIN' }).success).toBe(
      false,
    );
  });
});
