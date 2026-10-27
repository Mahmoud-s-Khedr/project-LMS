import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import {
  acceptedResponseSchema,
  authResponseSchema,
  changePasswordSchema,
  csrfResponseSchema,
  emailRequestSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sessionsResponseSchema,
  tokenRequestSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@lms/shared';
import { CurrentUser, Public } from '../../common/authz/decorators';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, newToken, type SessionResult } from './auth.service';
import { CsrfGuard, CSRF_COOKIE } from './csrf.guard';
import { NoStoreInterceptor } from './no-store.interceptor';
import { SchemaBody, SchemaResponse } from './schema.decorator';

const REFRESH_COOKIE = 'lms_refresh';
const SESSION_COOKIE = 'lms_session';
const isTestEnv = process.env.NODE_ENV === 'test';
const authLimit = isTestEnv ? 1000 : 5;
const sensitiveLimit = isTestEnv ? 1000 : 3;
@ApiTags('Authentication')
@Controller('auth')
@UseGuards(ThrottlerGuard)
@UseInterceptors(NoStoreInterceptor)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    };
  }
  private token(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    const value: unknown =
      cookies && typeof cookies === 'object'
        ? (cookies as Record<string, unknown>)[REFRESH_COOKIE]
        : undefined;
    return typeof value === 'string' ? value : undefined;
  }
  private device(request: Request) {
    return { userAgent: request.get('user-agent'), ip: request.ip };
  }
  private sessionCookieOptions(): CookieOptions {
    return { ...this.cookieOptions(), httpOnly: false, path: '/' };
  }
  private clearSession(response: Response) {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    response.clearCookie(SESSION_COOKIE, this.sessionCookieOptions());
  }
  private respond(result: SessionResult, response: Response) {
    response.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    // Navigation hint only; the API still authenticates every protected request.
    response.cookie(SESSION_COOKIE, '1', {
      ...this.sessionCookieOptions(),
      expires: result.expiresAt,
    });
    return { data: result.data };
  }
  @Get('csrf')
  @Public()
  @SchemaResponse(csrfResponseSchema)
  csrf(@Res({ passthrough: true }) response: Response) {
    const csrfToken = newToken();
    response.cookie(CSRF_COOKIE, csrfToken, { ...this.cookieOptions(), maxAge: 60 * 60 * 1000 });
    return { data: { csrfToken } };
  }
  @Post('register')
  @Public()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: authLimit, ttl: 60000 } })
  @SchemaBody(registerSchema)
  @SchemaResponse(acceptedResponseSchema, 201)
  register(@Body(new ZodValidationPipe(registerSchema)) input: RegisterInput) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: authLimit, ttl: 60000 } })
  @SchemaBody(loginSchema)
  @SchemaResponse(authResponseSchema)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) input: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.respond(await this.auth.login(input, this.device(request)), response);
  }
  @Post('refresh')
  @HttpCode(200)
  @Public()
  @UseGuards(CsrfGuard)
  @SchemaResponse(authResponseSchema)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      return this.respond(
        await this.auth.refresh(this.token(request), this.device(request)),
        response,
      );
    } catch (error) {
      this.clearSession(response);
      throw error;
    }
  }
  @Post('logout')
  @HttpCode(204)
  @Public()
  @UseGuards(CsrfGuard)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.token(request));
    this.clearSession(response);
  }
  @Post('logout-all')
  @HttpCode(204)
  @ApiBearerAuth()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(user.id);
    this.clearSession(response);
  }
  @Post('verify-email')
  @HttpCode(204)
  @Public()
  @SchemaBody(tokenRequestSchema)
  verifyEmail(@Body(new ZodValidationPipe(tokenRequestSchema)) input: { token: string }) {
    return this.auth.verifyEmail(input.token);
  }
  @Post('resend-verification')
  @HttpCode(202)
  @Public()
  @Throttle({ default: { limit: sensitiveLimit, ttl: 60000 } })
  @SchemaBody(emailRequestSchema)
  @SchemaResponse(acceptedResponseSchema, 202)
  async resend(@Body(new ZodValidationPipe(emailRequestSchema)) input: { email: string }) {
    await this.auth.requestToken(input.email, 'VERIFY_EMAIL');
    return { data: { message: 'If eligible, an email will be sent.' } };
  }
  @Post('forgot-password')
  @HttpCode(202)
  @Public()
  @Throttle({ default: { limit: sensitiveLimit, ttl: 60000 } })
  @SchemaBody(emailRequestSchema)
  @SchemaResponse(acceptedResponseSchema, 202)
  async forgot(@Body(new ZodValidationPipe(emailRequestSchema)) input: { email: string }) {
    await this.auth.requestToken(input.email, 'RESET_PASSWORD');
    return { data: { message: 'If eligible, an email will be sent.' } };
  }
  @Post('reset-password')
  @HttpCode(204)
  @Public()
  @Throttle({ default: { limit: authLimit, ttl: 60000 } })
  @SchemaBody(resetPasswordSchema)
  reset(@Body(new ZodValidationPipe(resetPasswordSchema)) input: ResetPasswordInput) {
    return this.auth.resetPassword(input);
  }
}

@ApiTags('Profile security')
@ApiBearerAuth()
@Controller('me')
@UseGuards(ThrottlerGuard)
@UseInterceptors(NoStoreInterceptor)
export class ProfileSecurityController {
  constructor(private readonly auth: AuthService) {}
  @Put('password')
  @HttpCode(204)
  @Throttle({ default: { limit: authLimit, ttl: 60000 } })
  @SchemaBody(changePasswordSchema)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) input: ChangePasswordInput,
  ) {
    return this.auth.changePassword(user, input);
  }
  @Get('sessions')
  @SchemaResponse(sessionsResponseSchema)
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.sessions(user);
  }
  @Delete('sessions/:familyId')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
  ) {
    return this.auth.revokeFamily(user, familyId);
  }
}
