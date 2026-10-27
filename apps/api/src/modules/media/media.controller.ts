import { ContentRequestInterceptor } from '../content/content-request-context';
import { CreatedLocationInterceptor } from '../content/created-location.interceptor';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, type AuthenticatedUser } from '../../common/authz';
import { ZodValidationPipe as Pipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { RouteIds, type CourseParams } from '../content/route-scope';
import * as c from '@lms/shared';
import { MediaService } from './media.service';
import {
  multipartModeSchema,
  multipartPartsSchema,
  multipartSignSchema,
  uploadStartResponseSchema,
} from './media.contracts';
import type { z } from 'zod';
@ApiTags('media')
@ApiBearerAuth()
@UseInterceptors(ContentRequestInterceptor, NoStoreInterceptor, CreatedLocationInterceptor)
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
@Controller()
export class MediaController {
  constructor(private readonly service: MediaService) {}
  @Post('workspaces/:workspaceId/assets/uploads')
  @SchemaBody(c.assetUploadSchema)
  @SchemaResponse(uploadStartResponseSchema, 201)
  async upload(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.assetUploadSchema)) v: c.AssetUpload,
    @Query(new Pipe(multipartModeSchema)) q: z.infer<typeof multipartModeSchema>,
  ) {
    return { data: await this.service.upload(a, p.workspaceId, v, q.multipart === 'true') };
  }
  @Post('workspaces/:workspaceId/assets/:assetId/parts')
  @HttpCode(200)
  @SchemaBody(multipartSignSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async part(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(multipartSignSchema)) v: z.infer<typeof multipartSignSchema>,
  ) {
    return { data: await this.service.part(a, p.workspaceId, p.assetId, v.partNumber) };
  }
  @Post('workspaces/:workspaceId/assets/:assetId/complete')
  @HttpCode(202)
  @SchemaBody(c.assetCompleteSchema)
  @SchemaResponse(c.assetCompleteResponseSchema, 202)
  async complete(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.assetCompleteSchema)) _v: c.AssetComplete,
  ) {
    return { data: await this.service.complete(a, p.workspaceId, p.assetId) };
  }
  @Post('workspaces/:workspaceId/assets/:assetId/multipart-complete')
  @HttpCode(202)
  @SchemaBody(multipartPartsSchema)
  @SchemaResponse(c.assetCompleteResponseSchema, 202)
  async multipart(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(multipartPartsSchema)) v: z.infer<typeof multipartPartsSchema>,
  ) {
    return { data: await this.service.complete(a, p.workspaceId, p.assetId, v) };
  }
  @Get('workspaces/:workspaceId/assets/:assetId')
  @SchemaResponse(c.assetResponseSchema)
  async poll(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return { data: await this.service.poll(a, p.workspaceId, p.assetId) };
  }
  @Delete('workspaces/:workspaceId/assets/:assetId')
  @HttpCode(204)
  async remove(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    await this.service.remove(a, p.workspaceId, p.assetId);
  }
  @Post('me/enrollments/:enrollmentId/lessons/:lessonId/assets/:assetId/download')
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async download(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return { data: await this.service.learnerDownload(a, p.enrollmentId, p.lessonId, p.assetId) };
  }
  @Post(
    'workspaces/:workspaceId/courses/:courseId/lessons/:lessonId/assets/:assetId/preview-download',
  )
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async staff(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return {
      data: await this.service.staffDownload(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        p.lessonId,
        p.assetId,
      ),
    };
  }
  @Public()
  @Get('catalog/courses/:courseId/preview-lessons/:lessonId')
  @SchemaResponse(c.previewLessonResponseSchema)
  async preview(@RouteIds() p: CourseParams) {
    return { data: await this.service.previewLesson(p.courseId, p.lessonId) };
  }
  @Public()
  @Post('catalog/courses/:courseId/preview-lessons/:lessonId/assets/:assetId/download')
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async publicDownload(
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return { data: await this.service.publicDownload(p.courseId, p.lessonId, p.assetId) };
  }
  @Post('me/attempts/:attemptId/attachments/:assetId/download')
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async attachment(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams & { attemptId: string },
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return { data: await this.service.attachment(a, p.attemptId, p.assetId) };
  }
  @Post('workspaces/:workspaceId/attempts/:attemptId/attachments/:assetId/download')
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.downloadResponseSchema)
  async graderAttachment(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams & { attemptId: string },
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return { data: await this.service.attachment(a, p.attemptId, p.assetId, p.workspaceId) };
  }
  @Post('me/enrollments/:enrollmentId/live-sessions/:sessionId/join')
  @HttpCode(200)
  @SchemaBody(c.emptyInputSchema)
  @SchemaResponse(c.joinSessionResponseSchema)
  async join(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.emptyInputSchema)) _v: c.EmptyInput,
  ) {
    return { data: await this.service.join(a, p.enrollmentId, p.sessionId) };
  }
  @Public()
  @Get('media/live-join')
  async redeem(@Query('capability') token: string, @Res() response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(303, await this.service.redeemJoin(token));
  }
}
