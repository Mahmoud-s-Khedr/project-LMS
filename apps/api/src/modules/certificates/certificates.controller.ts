import { ApiTags, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import {
  certificateTemplateResponseSchema,
  certificateTemplatesResponseSchema,
  certificateResponseSchema,
  certificatesResponseSchema,
  certificateVerificationResponseSchema,
  certificateIssueResponseSchema,
  downloadResponseSchema,
} from '@lms/shared';
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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  certificateIssueSchema,
  certificateRevokeSchema,
  certificateRenderRequestSchema,
  certificateTemplateCreateSchema,
  certificateTemplateUpdateSchema,
  certificatesQuerySchema,
  cursorQuerySchema,
  verificationCodeSchema,
} from '@lms/shared';
import { CurrentUser, Public, type AuthenticatedUser } from '../../common/authz';
import { parseInput as parse } from '../content/content.support';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { CertificatesService, certificateDto } from './certificates.service';
const requestId = (r: Request) =>
  r.headers['x-request-id']?.toString().slice(0, 100) ?? 'certificate-http';
@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/courses/:courseId')
@UseInterceptors(NoStoreInterceptor)
export class CertificateStaffController {
  constructor(private readonly service: CertificatesService) {}
  @SchemaQuery(cursorQuerySchema)
  @SchemaResponse(certificateTemplatesResponseSchema)
  @Get('certificate-templates')
  templates(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: unknown,
  ) {
    return this.service.templates(
      actor,
      { workspaceId, courseId },
      parse(cursorQuerySchema, query),
    );
  }
  @SchemaBody(certificateTemplateCreateSchema)
  @SchemaResponse(certificateTemplateResponseSchema, 201)
  @Post('certificate-templates')
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.service.createTemplate(
      actor,
      { workspaceId, courseId },
      parse(certificateTemplateCreateSchema, body),
      requestId(req),
    );
  }
  @SchemaBody(certificateTemplateUpdateSchema)
  @SchemaResponse(certificateTemplateResponseSchema)
  @Patch('certificate-templates/:templateId')
  toggle(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('templateId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.service.toggle(
      actor,
      { workspaceId, courseId },
      id,
      parse(certificateTemplateUpdateSchema, body).isActive,
      requestId(req),
    );
  }
  @SchemaBody(certificateIssueSchema)
  @SchemaResponse(certificateIssueResponseSchema, 202)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('enrollments/:enrollmentId/certificate')
  @HttpCode(202)
  issue(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('enrollmentId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
  ) {
    return this.service.issue(
      actor,
      { workspaceId, courseId },
      id,
      parse(certificateIssueSchema, body).templateId,
      key,
      requestId(req),
    );
  }
  @SchemaBody(certificateRenderRequestSchema)
  @SchemaResponse(certificateIssueResponseSchema, 202)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @Post('certificates/:certificateId/render')
  @HttpCode(202)
  render(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('certificateId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
  ) {
    parse(certificateRenderRequestSchema, body);
    return this.service.requestRender(actor, { workspaceId, courseId }, id, key, requestId(req));
  }
  @SchemaBody(certificateRevokeSchema)
  @SchemaResponse(certificateResponseSchema)
  @Post('certificates/:certificateId/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Param('certificateId', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.service.revoke(
      actor,
      { workspaceId, courseId },
      id,
      parse(certificateRevokeSchema, body).reason,
      requestId(req),
    );
  }
}
@ApiTags('Certificates')
@ApiBearerAuth()
@Controller('me/certificates')
@UseInterceptors(NoStoreInterceptor)
export class MyCertificatesController {
  constructor(private readonly service: CertificatesService) {}
  @SchemaQuery(certificatesQuerySchema)
  @SchemaResponse(certificatesResponseSchema)
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: unknown) {
    return this.service.list(actor.id, parse(certificatesQuerySchema, query));
  }
  @SchemaResponse(certificateResponseSchema)
  @Get(':certificateId')
  async get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('certificateId', ParseUUIDPipe) id: string,
  ) {
    return { data: certificateDto(await this.service.own(actor.id, id)) };
  }
  @SchemaResponse(downloadResponseSchema)
  @Post(':certificateId/download')
  @HttpCode(200)
  download(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('certificateId', ParseUUIDPipe) id: string,
  ) {
    return this.service.download(actor.id, id);
  }
}
@ApiTags('Certificates')
@Controller('certificates/verify')
@UseInterceptors(NoStoreInterceptor)
export class CertificateVerificationController {
  constructor(private readonly service: CertificatesService) {}
  @SchemaResponse(certificateVerificationResponseSchema)
  @Get(':verificationCode')
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  verify(@Param('verificationCode') code: string) {
    return this.service.verify(parse(verificationCodeSchema, code));
  }
}
