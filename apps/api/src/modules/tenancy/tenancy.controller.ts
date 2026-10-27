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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  cursorQuerySchema,
  workspaceCreateSchema,
  workspaceUpdateSchema,
  transferOwnershipSchema,
  membersQuerySchema,
  memberUpdateSchema,
  invitationsQuerySchema,
  workspaceInvitationCreateSchema,
  invitationAcceptSchema,
  emptyInputSchema,
  courseStaffUpsertSchema,
  myWorkspacesResponseSchema,
  workspaceResponseSchema,
  membersResponseSchema,
  workspaceMemberResponseSchema,
  invitationsResponseSchema,
  workspaceInvitationResponseSchema,
  courseStaffResponseSchema,
  courseStaffListResponseSchema,
  type CursorQuery,
  type WorkspaceCreate,
  type WorkspaceUpdate,
  type TransferOwnership,
  type MembersQuery,
  type MemberUpdate,
  type InvitationsQuery,
  type WorkspaceInvitationCreate,
  type InvitationAccept,
  type CourseStaffUpsert,
} from '@lms/shared';
import { CurrentUser } from '../../common/authz/decorators';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { TenancyService } from './tenancy.service';
import { tenancyEtag } from './tenancy.util';

const requestId = (request: Request): string =>
  typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 100
    ? request.id
    : randomUUID();
const IfMatch = () =>
  ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'ETag from GET, or "<id>:<updatedAt epoch milliseconds>" from a list item.',
  });
function representation<T>(
  response: Response,
  result: { row: { id: string; updatedAt: Date }; data: T },
) {
  response.setHeader('ETag', tenancyEtag(result.row));
  return { data: result.data };
}

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('me/workspaces')
@UseInterceptors(NoStoreInterceptor)
export class MyWorkspacesController {
  constructor(private readonly tenancy: TenancyService) {}
  @Get()
  @SchemaQuery(cursorQuerySchema)
  @SchemaResponse(myWorkspacesResponseSchema)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ) {
    return this.tenancy.mine(actor, query);
  }
}

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
@UseInterceptors(NoStoreInterceptor)
@UseGuards(ThrottlerGuard)
export class WorkspacesController {
  constructor(private readonly tenancy: TenancyService) {}
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(workspaceCreateSchema)
  @SchemaResponse(workspaceResponseSchema, 201)
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(workspaceCreateSchema)) input: WorkspaceCreate,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.tenancy.create(actor, input, requestId(request));
    response.setHeader('Location', `/api/v1/workspaces/${result.row.id}`);
    return representation(response, result);
  }
  @Get(':workspaceId')
  @SchemaResponse(workspaceResponseSchema)
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(response, await this.tenancy.get(actor, workspaceId, requestId(request)));
  }
  @Patch(':workspaceId')
  @IfMatch()
  @SchemaBody(workspaceUpdateSchema)
  @SchemaResponse(workspaceResponseSchema)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body(new ZodValidationPipe(workspaceUpdateSchema)) input: WorkspaceUpdate,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.update(actor, workspaceId, input, ifMatch, requestId(request)),
    );
  }
  @Post(':workspaceId/transfer-ownership')
  @HttpCode(200)
  @IfMatch()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(transferOwnershipSchema)
  @SchemaResponse(workspaceResponseSchema)
  async transfer(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body(new ZodValidationPipe(transferOwnershipSchema)) input: TransferOwnership,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.transfer(actor, workspaceId, input, ifMatch, requestId(request)),
    );
  }
}

@ApiTags('Workspace members')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/members')
@UseInterceptors(NoStoreInterceptor)
export class WorkspaceMembersController {
  constructor(private readonly tenancy: TenancyService) {}
  @Get()
  @SchemaQuery(membersQuerySchema)
  @SchemaResponse(membersResponseSchema)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Query(new ZodValidationPipe(membersQuerySchema)) query: MembersQuery,
    @Req() request: Request,
  ) {
    return this.tenancy.members(actor, workspaceId, query, requestId(request));
  }
  @Get(':memberId')
  @SchemaResponse(workspaceMemberResponseSchema)
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.getMember(actor, workspaceId, memberId, requestId(request)),
    );
  }
  @Patch(':memberId')
  @IfMatch()
  @SchemaBody(memberUpdateSchema)
  @SchemaResponse(workspaceMemberResponseSchema)
  async update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) input: MemberUpdate,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.updateMember(
        actor,
        workspaceId,
        memberId,
        input,
        ifMatch,
        requestId(request),
      ),
    );
  }
  @Delete(':memberId')
  @HttpCode(204)
  @IfMatch()
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ) {
    return this.tenancy.removeMember(actor, workspaceId, memberId, ifMatch, requestId(request));
  }
}

@ApiTags('Workspace invitations')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/invitations')
@UseInterceptors(NoStoreInterceptor)
@UseGuards(ThrottlerGuard)
export class WorkspaceInvitationsController {
  constructor(private readonly tenancy: TenancyService) {}
  @Get()
  @SchemaQuery(invitationsQuerySchema)
  @SchemaResponse(invitationsResponseSchema)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Query(new ZodValidationPipe(invitationsQuerySchema)) query: InvitationsQuery,
    @Req() request: Request,
  ) {
    return this.tenancy.invitations(actor, workspaceId, query, requestId(request));
  }
  @Get(':invitationId')
  @SchemaResponse(workspaceInvitationResponseSchema)
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.getInvitation(actor, workspaceId, invitationId, requestId(request)),
    );
  }
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(workspaceInvitationCreateSchema)
  @SchemaResponse(workspaceInvitationResponseSchema, 201)
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body(new ZodValidationPipe(workspaceInvitationCreateSchema)) input: WorkspaceInvitationCreate,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.tenancy.invite(actor, workspaceId, input, requestId(request));
    response.setHeader(
      'Location',
      `/api/v1/workspaces/${workspaceId}/invitations/${result.row.id}`,
    );
    return representation(response, result);
  }
  @Delete(':invitationId')
  @HttpCode(204)
  @IfMatch()
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ) {
    return this.tenancy.revokeInvitation(
      actor,
      workspaceId,
      invitationId,
      ifMatch,
      requestId(request),
    );
  }
  @Post(':invitationId/resend')
  @HttpCode(200)
  @IfMatch()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @SchemaBody(emptyInputSchema)
  @SchemaResponse(workspaceInvitationResponseSchema)
  async resend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @Body(new ZodValidationPipe(emptyInputSchema)) _input: Record<string, never>,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.resendInvitation(
        actor,
        workspaceId,
        invitationId,
        ifMatch,
        requestId(request),
      ),
    );
  }
}

@ApiTags('Workspace invitations')
@ApiBearerAuth()
@Controller('invitations')
@UseInterceptors(NoStoreInterceptor)
@UseGuards(ThrottlerGuard)
export class InvitationAcceptanceController {
  constructor(private readonly tenancy: TenancyService) {}
  @Post('accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SchemaBody(invitationAcceptSchema)
  @SchemaResponse(workspaceMemberResponseSchema)
  async accept(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(invitationAcceptSchema)) input: InvitationAccept,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.accept(actor, input.token, requestId(request)),
    );
  }
}

@ApiTags('Course staff')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/courses/:courseId/staff')
@UseInterceptors(NoStoreInterceptor)
export class CourseStaffController {
  constructor(private readonly tenancy: TenancyService) {}
  @Get()
  @SchemaQuery(cursorQuerySchema)
  @SchemaResponse(courseStaffListResponseSchema)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
    @Req() request: Request,
  ) {
    return this.tenancy.staff(actor, workspaceId, courseId, query, requestId(request));
  }
  @Put(':userId')
  @HttpCode(200)
  @ApiHeader({
    name: 'If-Match',
    required: false,
    description: 'Required when replacing an existing assignment.',
  })
  @SchemaBody(courseStaffUpsertSchema)
  @SchemaResponse(courseStaffResponseSchema)
  async upsert(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body(new ZodValidationPipe(courseStaffUpsertSchema)) input: CourseStaffUpsert,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return representation(
      response,
      await this.tenancy.upsertStaff(
        actor,
        workspaceId,
        courseId,
        userId,
        input,
        ifMatch,
        requestId(request),
      ),
    );
  }
  @Delete(':userId')
  @HttpCode(204)
  @IfMatch()
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
  ) {
    return this.tenancy.removeStaff(
      actor,
      workspaceId,
      courseId,
      userId,
      ifMatch,
      requestId(request),
    );
  }
}
