import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  enrollmentResponseSchema,
  enrollmentUpdateSchema,
  enrollmentsQuerySchema,
  enrollmentsResponseSchema,
  enrollmentResultsResponseSchema,
  freeEnrollmentSchema,
  grantResponseSchema,
  grantRevokeSchema,
  learnerLessonResponseSchema,
  learnerOutlineResponseSchema,
  manualEnrollmentSchema,
  manualGrantSchema,
  progressResponseSchema,
  progressUpdateSchema,
  rosterQuerySchema,
  staffEnrollmentResponseSchema,
  uuidSchema,
  type EnrollmentUpdate,
  type EnrollmentsQuery,
  type FreeEnrollment,
  type ManualEnrollment,
  type ManualGrant,
  type ProgressUpdate,
  type RosterQuery,
} from '@lms/shared';
import { CurrentUser, type AuthenticatedUser } from '../../common/authz';
import { ZodValidationPipe as Pipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { EnrollmentService } from './enrollment.service';
import { LearnerService } from './learner.service';
import { LearningResponseInterceptor } from './learning-http';
import { requireIfMatch } from './learning.support';

const uuid = new Pipe(uuidSchema);
const requestId = (r: Request): string | undefined =>
  typeof (r as Request & { id?: unknown }).id === 'string'
    ? (r as Request & { id: string }).id.slice(0, 100)
    : undefined;

/** Owner-scoped learner endpoints. Ownership is re-checked in the services, not only here. */
@ApiTags('learning')
@ApiBearerAuth()
@UseInterceptors(LearningResponseInterceptor)
@Controller()
export class LearnerController {
  constructor(
    private readonly learner: LearnerService,
    private readonly enrollments: EnrollmentService,
  ) {}

  @Post('courses/:courseId/enroll')
  @SchemaBody(freeEnrollmentSchema)
  @SchemaResponse(enrollmentResponseSchema, 201)
  async enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('courseId', uuid) courseId: string,
    @Body(new Pipe(freeEnrollmentSchema)) body: FreeEnrollment,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.enrollments.enrollFree(user, courseId, body, key, requestId(req));
    res.status(out.status);
    return out.body;
  }

  @Get('me/enrollments')
  @SchemaQuery(enrollmentsQuerySchema)
  @SchemaResponse(enrollmentsResponseSchema)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new Pipe(enrollmentsQuerySchema)) query: EnrollmentsQuery,
  ) {
    return this.learner.list(user, query);
  }

  @Get('me/enrollments/:enrollmentId')
  @SchemaResponse(enrollmentResponseSchema)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('enrollmentId', uuid) id: string) {
    return { data: await this.learner.get(user, id) };
  }

  @Get('me/enrollments/:enrollmentId/outline')
  @SchemaResponse(learnerOutlineResponseSchema)
  async outline(@CurrentUser() user: AuthenticatedUser, @Param('enrollmentId', uuid) id: string) {
    return { data: await this.learner.outline(user, id) };
  }

  @Get('me/enrollments/:enrollmentId/lessons/:lessonId')
  @SchemaResponse(learnerLessonResponseSchema)
  async lesson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('enrollmentId', uuid) id: string,
    @Param('lessonId', uuid) lessonId: string,
  ) {
    return { data: await this.learner.lesson(user, id, lessonId) };
  }

  @Put('me/enrollments/:enrollmentId/lessons/:lessonId/progress')
  @SchemaBody(progressUpdateSchema)
  @SchemaResponse(progressResponseSchema)
  async progress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('enrollmentId', uuid) id: string,
    @Param('lessonId', uuid) lessonId: string,
    @Body(new Pipe(progressUpdateSchema)) body: ProgressUpdate,
  ) {
    return { data: await this.learner.progress(user, id, lessonId, body) };
  }

  @Get('me/enrollments/:enrollmentId/results')
  @SchemaResponse(enrollmentResultsResponseSchema)
  async results(@CurrentUser() user: AuthenticatedUser, @Param('enrollmentId', uuid) id: string) {
    return { data: await this.learner.results(user, id) };
  }
}

/** Staff roster endpoints (`manageLearners` capability, 404 for everyone else). */
@ApiTags('learning')
@ApiBearerAuth()
@UseInterceptors(LearningResponseInterceptor)
@Controller('workspaces/:workspaceId/courses/:courseId/enrollments')
export class RosterController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @Get()
  @SchemaQuery(rosterQuerySchema)
  @SchemaResponse(enrollmentsResponseSchema)
  roster(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Query(new Pipe(rosterQuerySchema)) query: RosterQuery,
  ) {
    return this.enrollments.roster(user, { workspaceId, courseId }, query);
  }

  @Post('manual')
  @SchemaBody(manualEnrollmentSchema)
  @SchemaResponse(enrollmentResponseSchema, 201)
  async manual(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Body(new Pipe(manualEnrollmentSchema)) body: ManualEnrollment,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.enrollments.manual(
      user,
      { workspaceId, courseId },
      body,
      key,
      requestId(req),
    );
    res.status(out.status);
    return out.body;
  }

  @Get(':enrollmentId')
  @SchemaResponse(staffEnrollmentResponseSchema)
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Param('enrollmentId', uuid) id: string,
  ) {
    return { data: await this.enrollments.detail(user, { workspaceId, courseId }, id) };
  }

  @Patch(':enrollmentId')
  @SchemaBody(enrollmentUpdateSchema)
  @SchemaResponse(enrollmentResponseSchema)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Param('enrollmentId', uuid) id: string,
    @Body(new Pipe(enrollmentUpdateSchema)) body: EnrollmentUpdate,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() req: Request,
  ) {
    const tag = requireIfMatch(ifMatch);
    return {
      data: await this.enrollments.update(
        user,
        { workspaceId, courseId },
        id,
        body,
        tag,
        requestId(req),
      ),
    };
  }

  @Post(':enrollmentId/grants')
  @SchemaBody(manualGrantSchema)
  @SchemaResponse(grantResponseSchema, 201)
  async addGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Param('enrollmentId', uuid) id: string,
    @Body(new Pipe(manualGrantSchema)) body: ManualGrant,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const out = await this.enrollments.addGrant(
      user,
      { workspaceId, courseId },
      id,
      body,
      key,
      requestId(req),
    );
    res.status(out.status);
    return out.body;
  }

  @Post(':enrollmentId/grants/:grantId/revoke')
  @HttpCode(200)
  @SchemaBody(grantRevokeSchema)
  @SchemaResponse(grantResponseSchema)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', uuid) workspaceId: string,
    @Param('courseId', uuid) courseId: string,
    @Param('enrollmentId', uuid) id: string,
    @Param('grantId', uuid) grantId: string,
    @Body(new Pipe(grantRevokeSchema)) body: { reason: string },
    @Req() req: Request,
  ) {
    return this.enrollments.revokeGrant(
      user,
      { workspaceId, courseId },
      id,
      grantId,
      body.reason,
      requestId(req),
    );
  }
}
