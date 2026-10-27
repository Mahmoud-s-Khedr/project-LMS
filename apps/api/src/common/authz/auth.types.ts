import type { Request } from 'express';
import type { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  platformRole: Role;
  emailVerifiedAt: Date | null;
  sessionId: string;
  familyId: string;
}
export interface AccessClaims {
  sub: string;
  sid: string;
  fid: string;
  jti: string;
  iat?: number;
  exp?: number;
}
export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
export const JWT_ISSUER = 'lms-api';
export const JWT_AUDIENCE = 'lms-web';
export const ACCESS_TOKEN_SECONDS = 600;
