import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  adminUserCreateSchema,
  adminUserDeleteSchema,
  adminUsersQuerySchema,
  adminUsersResponseSchema,
  adminUserUpdateSchema,
  avatarCompleteSchema,
  avatarUploadResponseSchema,
  avatarUploadSchema,
  meResponseSchema,
  profileUpdateSchema,
  userResponseSchema,
  type AdminUserCreate,
  type AdminUsersQuery,
  type AdminUserUpdate,
  type AvatarUpload,
  type ProfileUpdate,
} from '@lms/shared';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { CurrentUser, Roles } from '../../common/authz/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { UsersService } from './users.service';

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('me')
@UseInterceptors(NoStoreInterceptor)
@UseGuards(ThrottlerGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @SchemaResponse(meResponseSchema)
  async me(
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { data, etag } = await this.users.me(actor.id);
    response.setHeader('ETag', etag);
    return { data };
  }
  @Patch()
  @SchemaBody(profileUpdateSchema)
  @SchemaResponse(userResponseSchema)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(profileUpdateSchema)) input: ProfileUpdate,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { data, etag } = await this.users.updateProfile(actor, input);
    response.setHeader('ETag', etag);
    return { data };
  }
  @Post('avatar/uploads')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(avatarUploadSchema)
  @SchemaResponse(avatarUploadResponseSchema, 201)
  avatar(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(avatarUploadSchema)) input: AvatarUpload,
  ) {
    return this.users.avatarUpload(actor, input);
  }
  @Post('avatar/complete')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(avatarCompleteSchema)
  @SchemaResponse(userResponseSchema)
  completeAvatar(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(avatarCompleteSchema)) input: { uploadToken: string },
  ) {
    return this.users.completeAvatar(actor, input.uploadToken);
  }
}

@ApiTags('User administration')
@ApiBearerAuth()
@Controller('admin/users')
@Roles('SUPER_ADMIN')
@UseInterceptors(NoStoreInterceptor)
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @SchemaResponse(adminUsersResponseSchema)
  @SchemaQuery(adminUsersQuerySchema)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(adminUsersQuerySchema)) query: AdminUsersQuery,
  ) {
    return this.users.list(actor, query);
  }
  @Post()
  @SchemaBody(adminUserCreateSchema)
  @SchemaResponse(userResponseSchema, 201)
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(adminUserCreateSchema)) input: AdminUserCreate,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.users.create(actor, input);
    response.setHeader('Location', `/api/v1/admin/users/${result.data.id}`);
    return result;
  }
  @Get(':userId')
  @SchemaResponse(userResponseSchema)
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { data, etag } = await this.users.get(actor, userId);
    response.setHeader('ETag', etag);
    return { data };
  }
  @Patch(':userId')
  @SchemaBody(adminUserUpdateSchema)
  @SchemaResponse(userResponseSchema)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(adminUserUpdateSchema)) input: AdminUserUpdate,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { data, etag } = await this.users.update(actor, userId, input, ifMatch, String(request.id));
    response.setHeader('ETag', etag);
    return { data };
  }
  @Delete(':userId')
  @HttpCode(204)
  @SchemaBody(adminUserDeleteSchema)
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(adminUserDeleteSchema)) input: { reason: string },
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ) {
    return this.users.remove(actor, userId, input.reason, ifMatch, String(request.id));
  }
}
