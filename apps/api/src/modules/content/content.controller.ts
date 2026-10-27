import { ContentRequestInterceptor } from './content-request-context';
import { CreatedLocationInterceptor } from './created-location.interceptor';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/authz';
import { ZodValidationPipe as Pipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { RouteIds, type CourseParams } from './route-scope';
import * as c from '@lms/shared';
import { ContentService } from './content.service';
@ApiTags('content')
@ApiBearerAuth()
@UseInterceptors(ContentRequestInterceptor, NoStoreInterceptor, CreatedLocationInterceptor)
@Controller('workspaces/:workspaceId/courses/:courseId')
export class ContentController {
  constructor(private readonly service: ContentService) {}
  @Get('sections')
  @SchemaResponse(c.sectionsResponseSchema)
  async sections(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return {
      data: await this.service.outline(a, { workspaceId: p.workspaceId, courseId: p.courseId }),
    };
  }
  @Post('sections')
  @SchemaBody(c.sectionCreateSchema)
  @SchemaResponse(c.sectionResponseSchema, 201)
  async section(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.sectionCreateSchema)) v: c.SectionCreate,
  ) {
    return {
      data: await this.service.section(a, { workspaceId: p.workspaceId, courseId: p.courseId }, v),
    };
  }
  @Patch('sections/:sectionId')
  @SchemaBody(c.sectionUpdateSchema)
  @SchemaResponse(c.sectionResponseSchema)
  async rename(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.sectionUpdateSchema)) v: c.SectionUpdate,
  ) {
    return {
      data: await this.service.section(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        v,
        p.sectionId,
      ),
    };
  }
  @Delete('sections/:sectionId')
  @HttpCode(204)
  removeSection(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return this.service.section(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      null,
      p.sectionId,
    );
  }
  @Put('sections/order')
  @HttpCode(204)
  @SchemaBody(c.reorderSchema)
  orderSections(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.reorderSchema)) v: c.Reorder,
  ) {
    return this.service.reorder(a, { workspaceId: p.workspaceId, courseId: p.courseId }, v.ids);
  }
  @Put('sections/:sectionId/lessons/order')
  @HttpCode(204)
  @SchemaBody(c.reorderSchema)
  orderLessons(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.reorderSchema)) v: c.Reorder,
  ) {
    return this.service.reorder(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      v.ids,
      p.sectionId,
    );
  }
  @Post('sections/:sectionId/lessons')
  @SchemaBody(c.lessonCreateSchema)
  @SchemaResponse(c.lessonResponseSchema, 201)
  async createLesson(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.lessonCreateSchema)) v: c.LessonCreate,
  ) {
    return {
      data: await this.service.createLesson(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.sectionId,
        v,
      ),
    };
  }
  @Get('lessons/:lessonId')
  @SchemaResponse(c.lessonResponseSchema)
  async getLesson(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return {
      data: await this.service.lesson(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.lessonId,
      ),
    };
  }
  @Get('lessons/:lessonId/preview')
  @SchemaResponse(c.lessonResponseSchema)
  async preview(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return {
      data: await this.service.lesson(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.lessonId,
        true,
      ),
    };
  }
  @Patch('lessons/:lessonId')
  @SchemaBody(c.lessonUpdateSchema)
  @SchemaResponse(c.lessonResponseSchema)
  async editLesson(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.lessonUpdateSchema)) v: c.LessonUpdate,
  ) {
    return {
      data: await this.service.updateLesson(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.lessonId,
        v,
      ),
    };
  }
  @Delete('lessons/:lessonId')
  @HttpCode(204)
  removeLesson(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return this.service.removeLesson(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.lessonId,
    );
  }
  @Put('lessons/:lessonId/prerequisites')
  @HttpCode(204)
  @SchemaBody(c.lessonPrerequisitesSchema)
  prerequisites(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.lessonPrerequisitesSchema)) v: c.LessonPrerequisites,
  ) {
    return this.service.prerequisites(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.lessonId,
      v.requiredLessonIds,
    );
  }
  @Post('lessons/:lessonId/assets')
  @SchemaBody(c.lessonAssetAttachSchema)
  @SchemaResponse(c.lessonAssetResponseSchema, 201)
  async attach(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.lessonAssetAttachSchema)) v: c.LessonAssetAttach,
  ) {
    return {
      data: await this.service.attach(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.lessonId,
        v,
      ),
    };
  }
  @Delete('lessons/:lessonId/assets/:assetId')
  @HttpCode(204)
  detach(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return this.service.detach(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.lessonId,
      p.assetId,
    );
  }
  @Get('cohorts')
  @SchemaResponse(c.cohortsResponseSchema)
  async cohorts(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Query(new Pipe(c.cohortsQuerySchema)) q: c.CursorQuery,
  ) {
    return this.service.listCohorts(a, { workspaceId: p.workspaceId, courseId: p.courseId }, q);
  }
  @Post('cohorts')
  @SchemaBody(c.cohortCreateSchema)
  @SchemaResponse(c.cohortResponseSchema, 201)
  async createCohort(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.cohortCreateSchema)) v: c.CohortCreate,
  ) {
    return {
      data: await this.service.cohort(a, { workspaceId: p.workspaceId, courseId: p.courseId }, v),
    };
  }
  @Patch('cohorts/:cohortId')
  @SchemaBody(c.cohortUpdateSchema)
  @SchemaResponse(c.cohortResponseSchema)
  async editCohort(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.cohortUpdateSchema)) v: c.CohortUpdate,
  ) {
    return {
      data: await this.service.cohort(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        v,
        p.cohortId,
      ),
    };
  }
  @Delete('cohorts/:cohortId')
  @HttpCode(204)
  async archiveCohort(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    await this.service.cohort(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      null,
      p.cohortId,
    );
  }
  @Put('cohorts/:cohortId/releases/:lessonId')
  @HttpCode(204)
  @SchemaBody(c.cohortReleaseUpsertSchema)
  async release(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.cohortReleaseUpsertSchema)) v: c.CohortReleaseUpsert,
  ) {
    await this.service.release(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.cohortId,
      p.lessonId,
      v,
    );
  }
  @Delete('cohorts/:cohortId/releases/:lessonId')
  @HttpCode(204)
  removeRelease(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return this.service.release(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.cohortId,
      p.lessonId,
      null,
    );
  }
  @Get('cohorts/:cohortId/enrollments')
  @SchemaResponse(c.enrollmentsResponseSchema)
  roster(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Query(new Pipe(c.cursorQuerySchema)) q: c.CursorQuery,
  ) {
    return this.service.roster(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.cohortId,
      q,
    );
  }
  @Post('lessons/:lessonId/live-sessions')
  @SchemaBody(c.liveSessionCreateSchema)
  @SchemaResponse(c.liveSessionResponseSchema, 201)
  async session(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.liveSessionCreateSchema)) v: c.LiveSessionCreate,
  ) {
    return {
      data: await this.service.session(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        v,
        p.lessonId,
      ),
    };
  }
  @Patch('live-sessions/:sessionId')
  @SchemaBody(c.liveSessionUpdateSchema)
  @SchemaResponse(c.liveSessionResponseSchema)
  async editSession(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.liveSessionUpdateSchema)) v: c.LiveSessionUpdate,
  ) {
    return {
      data: await this.service.session(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        v,
        undefined,
        p.sessionId,
      ),
    };
  }
  @Get('live-sessions/:sessionId/attendance')
  @SchemaResponse(c.attendanceListResponseSchema)
  async attendance(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Query(new Pipe(c.cursorQuerySchema)) q: c.CursorQuery,
  ) {
    return this.service.listAttendance(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      p.sessionId,
      q,
    );
  }
  @Put('live-sessions/:sessionId/attendance/:enrollmentId')
  @SchemaBody(c.attendanceUpdateSchema)
  @SchemaResponse(c.attendanceResponseSchema)
  async correct(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.attendanceUpdateSchema)) v: c.AttendanceUpdate,
  ) {
    return {
      data: await this.service.attendance(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.sessionId,
        p.enrollmentId,
        v,
      ),
    };
  }
}
