import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  adminWorkspacesQuerySchema,
  adminWorkspacesResponseSchema,
  adminWorkspaceUpdateSchema,
  adminWorkspaceResponseSchema,
  auditLogsQuerySchema,
  auditLogsResponseSchema,
  operationsEventsQuerySchema,
  operationsEventsResponseSchema,
  replayInputSchema,
  replayAcceptedResponseSchema,
  webhooksQuerySchema,
  webhooksResponseSchema,
  type AdminWorkspacesQuery,
  type AdminWorkspaceUpdate,
  type AuditLogsQuery,
  type OperationsEventsQuery,
  type WebhooksQuery,
} from '@lms/shared';
import { CurrentUser, Roles } from '../../common/authz/decorators';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { AdministrationService } from './administration.service';

const requestId = (request: Request): string =>
  typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 100
    ? request.id
    : randomUUID();

@ApiTags('Platform administration')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@UseInterceptors(NoStoreInterceptor)
@Controller('admin')
export class PlatformAdministrationController {
  constructor(private readonly admin: AdministrationService) {}

  @Get('workspaces')
  @SchemaQuery(adminWorkspacesQuerySchema)
  @SchemaResponse(adminWorkspacesResponseSchema)
  workspaces(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(adminWorkspacesQuerySchema)) q: AdminWorkspacesQuery,
  ) {
    return this.admin.workspaces(actor, q);
  }

  @Patch('workspaces/:workspaceId')
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: '"<workspaceId>:<updatedAt epoch milliseconds>" from the inventory row',
  })
  @SchemaBody(adminWorkspaceUpdateSchema)
  @SchemaResponse(adminWorkspaceResponseSchema)
  async updateWorkspace(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(adminWorkspaceUpdateSchema)) input: AdminWorkspaceUpdate,
    @Headers('if-match') expected: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, etag } = await this.admin.updateWorkspace(
      actor,
      id,
      input,
      expected,
      requestId(req),
    );
    res.setHeader('ETag', etag);
    return { data };
  }

  @Get('webhooks')
  @SchemaQuery(webhooksQuerySchema)
  @SchemaResponse(webhooksResponseSchema)
  webhooks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(webhooksQuerySchema)) q: WebhooksQuery,
    @Req() req: Request,
  ) {
    return this.admin.webhooks(actor, q, requestId(req));
  }

  @Post('webhooks/:webhookId/replay')
  @HttpCode(202)
  @SchemaBody(replayInputSchema)
  @SchemaResponse(replayAcceptedResponseSchema, 202)
  replayWebhook(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('webhookId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(replayInputSchema)) input: { reason: string },
    @Req() req: Request,
  ) {
    return this.admin.replayWebhook(actor, id, input.reason, requestId(req));
  }
}

@ApiTags('Workspace operations')
@ApiBearerAuth()
@UseInterceptors(NoStoreInterceptor)
@Controller('workspaces/:workspaceId')
export class WorkspaceOperationsController {
  constructor(private readonly admin: AdministrationService) {}

  @Get('audit-logs')
  @SchemaQuery(auditLogsQuerySchema)
  @SchemaResponse(auditLogsResponseSchema)
  audit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(auditLogsQuerySchema)) q: AuditLogsQuery,
    @Req() req: Request,
  ) {
    return this.admin.auditLogs(actor, id, q, requestId(req));
  }

  @Get('operations/events')
  @SchemaQuery(operationsEventsQuerySchema)
  @SchemaResponse(operationsEventsResponseSchema)
  events(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) id: string,
    @Query(new ZodValidationPipe(operationsEventsQuerySchema)) q: OperationsEventsQuery,
    @Req() req: Request,
  ) {
    return this.admin.operations(actor, id, q, requestId(req));
  }

  @Post('operations/events/:eventId/replay')
  @HttpCode(202)
  @SchemaBody(replayInputSchema)
  @SchemaResponse(replayAcceptedResponseSchema, 202)
  replay(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) w: string,
    @Param('eventId', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(replayInputSchema)) input: { reason: string },
    @Req() req: Request,
  ) {
    return this.admin.replayEvent(actor, w, id, input.reason, requestId(req));
  }
}
