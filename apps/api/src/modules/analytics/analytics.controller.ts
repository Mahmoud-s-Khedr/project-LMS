import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import * as c from '@lms/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/authz';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { SchemaBody, SchemaResponse } from '../auth/schema.decorator';
import { ZodValidationPipe as Pipe } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsRateLimitInterceptor } from './analytics-http';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReportsService } from './analytics-reports.service';
function requestId(req: Request) {
  return typeof req.id === 'string' && req.id.length <= 100 ? req.id : randomUUID();
}
@ApiTags('analytics')
@ApiBearerAuth()
@UseInterceptors(NoStoreInterceptor, AnalyticsRateLimitInterceptor)
@Controller()
export class AnalyticsController {
  constructor(
    private readonly service: AnalyticsService,
    private readonly reports: AnalyticsReportsService,
  ) {}
  @Post('workspaces/:workspaceId/activity-events/batch')
  @HttpCode(200)
  @SchemaBody(c.activityBatchSchema)
  @SchemaResponse(c.activityBatchResponseSchema)
  async activity(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(new Pipe(c.activityBatchSchema)) body: c.ActivityBatch,
  ) {
    return { data: await this.service.ingest(a, w, body) };
  }
  @Get('me/analytics/progress')
  @SchemaResponse(c.studentAnalyticsResponseSchema)
  async student(@CurrentUser() a: AuthenticatedUser) {
    return { data: await this.reports.student(a.id) };
  }
  @Get('workspaces/:workspaceId/courses/:courseId/analytics/overview')
  @SchemaResponse(c.courseAnalyticsResponseSchema)
  async overview(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query(new Pipe(c.analyticsQuerySchema)) q: c.AnalyticsQuery,
    @Req() req: Request,
  ) {
    const scope = { workspaceId, courseId };
    await this.service.course(a, scope);
    await this.service.readAudit(
      a,
      workspaceId,
      courseId,
      'analytics.overview.read',
      requestId(req),
    );
    return { data: await this.reports.overview(scope, q) };
  }
  @Get('workspaces/:workspaceId/courses/:courseId/analytics/learners')
  @SchemaResponse(c.learnerAnalyticsResponseSchema)
  async learners(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query(new Pipe(c.learnerAnalyticsQuerySchema)) q: c.LearnerAnalyticsQuery,
    @Req() req: Request,
  ) {
    const scope = { workspaceId, courseId };
    await this.service.course(a, scope);
    await this.service.readAudit(
      a,
      workspaceId,
      courseId,
      'analytics.learners.read',
      requestId(req),
    );
    return this.reports.learners(scope, q);
  }
  @Get('workspaces/:workspaceId/courses/:courseId/analytics/assessments')
  @SchemaResponse(c.assessmentAnalyticsResponseSchema)
  async assessments(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query(new Pipe(c.analyticsQuerySchema)) q: c.AnalyticsQuery,
    @Req() req: Request,
  ) {
    const scope = { workspaceId, courseId };
    await this.service.course(a, scope, true);
    await this.service.readAudit(
      a,
      workspaceId,
      courseId,
      'analytics.assessments.read',
      requestId(req),
    );
    return { data: await this.reports.assessments(scope, q) };
  }
  @Get('workspaces/:workspaceId/analytics/revenue')
  @SchemaResponse(c.revenueResponseSchema)
  async revenue(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Query(new Pipe(c.revenueQuerySchema)) q: c.RevenueQuery,
    @Req() req: Request,
  ) {
    await this.service.admin(a, w);
    await this.service.readAudit(a, w, w, 'analytics.revenue.read', requestId(req));
    return { data: await this.reports.revenue(w, q) };
  }
  @Post('workspaces/:workspaceId/analytics/exports')
  @HttpCode(202)
  @SchemaBody(c.exportRequestSchema)
  @SchemaResponse(c.exportAcceptedResponseSchema, 202)
  async createExport(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(new Pipe(c.exportRequestSchema)) body: c.ExportRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
  ) {
    return { data: await this.service.requestExport(a, w, body, key, requestId(req)) };
  }
  @Get('workspaces/:workspaceId/analytics/exports/:operationId')
  @SchemaResponse(c.exportOperationResponseSchema)
  async operation(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('operationId', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return { data: await this.service.operation(a, w, id, requestId(req)) };
  }
}
