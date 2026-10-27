import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const CSRF_COOKIE = 'lms_csrf';
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.get('origin');
    if (!origin || origin !== new URL(this.config.getOrThrow<string>('WEB_ORIGIN')).origin)
      throw new ForbiddenException('Origin is not allowed');
    const cookies: unknown = request.cookies;
    const cookie: unknown =
      cookies && typeof cookies === 'object'
        ? (cookies as Record<string, unknown>)[CSRF_COOKIE]
        : undefined;
    const header = request.get('x-csrf-token');
    if (
      typeof cookie !== 'string' ||
      !header ||
      !/^[a-f0-9]{64}$/.test(cookie) ||
      !/^[a-f0-9]{64}$/.test(header) ||
      !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))
    )
      throw new ForbiddenException('Invalid CSRF token');
    return true;
  }
}
