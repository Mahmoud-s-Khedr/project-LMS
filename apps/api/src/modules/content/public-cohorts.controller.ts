import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/authz';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { cursorQuerySchema, publicCohortsResponseSchema, type CursorQuery } from '@lms/shared';
import { SchemaResponse } from '../auth/schema.decorator';
import { RouteIds, type CourseParams } from './route-scope';
import { ContentService } from './content.service';
@ApiTags('cohorts')
@Controller('catalog/courses/:courseId/cohorts')
export class PublicCohortsController {
  constructor(private readonly service: ContentService) {}
  @Public()
  @Get()
  @SchemaResponse(publicCohortsResponseSchema)
  list(
    @RouteIds() p: CourseParams,
    @Query(new ZodValidationPipe(cursorQuerySchema)) q: CursorQuery,
  ) {
    return this.service.publicCohorts(p.courseId, q);
  }
}
