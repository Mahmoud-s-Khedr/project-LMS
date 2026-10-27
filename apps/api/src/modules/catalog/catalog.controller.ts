import { ContentRequestInterceptor } from '../content/content-request-context';
import { CreatedLocationInterceptor } from '../content/created-location.interceptor';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, type AuthenticatedUser } from '../../common/authz';
import { ZodValidationPipe as Pipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { RouteIds, type CourseParams } from '../content/route-scope';
import * as c from '@lms/shared';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class PublicCatalogController {
  constructor(private readonly service: CatalogService) {}
  @Public()
  @Get('courses')
  @SchemaQuery(c.catalogCoursesQuerySchema)
  @SchemaResponse(c.catalogCoursesResponseSchema)
  list(@Query(new Pipe(c.catalogCoursesQuerySchema)) q: c.CatalogCoursesQuery) {
    return this.service.listPublic(q);
  }
  @Public()
  @Get('courses/by-slug/:slug')
  @SchemaQuery(c.catalogCourseBySlugQuerySchema)
  @SchemaResponse(c.catalogCourseResponseSchema)
  async bySlug(
    @Param('slug', new Pipe(c.slugSchema)) slug: string,
    @Query(new Pipe(c.catalogCourseBySlugQuerySchema)) query: c.CatalogCourseBySlugQuery,
  ) {
    return { data: await this.service.publicCourseBySlug(slug, query.workspace) };
  }
  @Public()
  @Get('courses/:courseId')
  @SchemaResponse(c.catalogCourseResponseSchema)
  async detail(@RouteIds() p: CourseParams) {
    return { data: await this.service.publicCourse(p.courseId) };
  }
  @Public()
  @Get('workspaces/:slug')
  @SchemaResponse(c.publicWorkspaceResponseSchema)
  async workspace(@Param('slug', new Pipe(c.slugSchema)) slug: string) {
    return { data: await this.service.publicWorkspace(slug) };
  }
}
@ApiTags('courses')
@ApiBearerAuth()
@UseInterceptors(ContentRequestInterceptor, NoStoreInterceptor, CreatedLocationInterceptor)
@Controller('workspaces/:workspaceId/courses')
export class CoursesController {
  constructor(private readonly service: CatalogService) {}
  @Get()
  @SchemaQuery(c.staffCoursesQuerySchema)
  @SchemaResponse(c.coursesResponseSchema)
  list(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Query(new Pipe(c.staffCoursesQuerySchema)) q: c.StaffCoursesQuery,
  ) {
    return this.service.list(a, p.workspaceId, q);
  }
  @Post()
  @SchemaBody(c.courseCreateSchema)
  @SchemaResponse(c.courseResponseSchema, 201)
  async create(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.courseCreateSchema)) v: c.CourseCreate,
  ) {
    return { data: await this.service.create(a, p.workspaceId, v) };
  }
  @Get(':courseId')
  @SchemaResponse(c.courseResponseSchema)
  async get(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return {
      data: await this.service.get(a, { workspaceId: p.workspaceId, courseId: p.courseId }),
    };
  }
  @Patch(':courseId')
  @SchemaBody(c.courseUpdateSchema)
  @SchemaResponse(c.courseResponseSchema)
  async update(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.courseUpdateSchema)) v: c.CourseUpdate,
  ) {
    return {
      data: await this.service.update(a, { workspaceId: p.workspaceId, courseId: p.courseId }, v),
    };
  }
  @Delete(':courseId')
  @HttpCode(204)
  remove(@CurrentUser() a: AuthenticatedUser, @RouteIds() p: CourseParams) {
    return this.service.remove(a, { workspaceId: p.workspaceId, courseId: p.courseId });
  }
  @Post(':courseId/publish')
  @HttpCode(200)
  @SchemaBody(c.versionInputSchema)
  @SchemaResponse(c.courseResponseSchema)
  async publish(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.versionInputSchema)) v: c.VersionInput,
  ) {
    return {
      data: await this.service.transition(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        'publish',
        v.version,
      ),
    };
  }
  @Post(':courseId/archive')
  @HttpCode(200)
  @SchemaBody(c.versionInputSchema)
  @SchemaResponse(c.courseResponseSchema)
  async archive(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.versionInputSchema)) v: c.VersionInput,
  ) {
    return {
      data: await this.service.transition(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        'archive',
        v.version,
      ),
    };
  }
  @Post(':courseId/submit-review')
  @HttpCode(200)
  @SchemaBody(c.versionInputSchema)
  @SchemaResponse(c.courseResponseSchema)
  async review(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.versionInputSchema)) v: c.VersionInput,
  ) {
    return {
      data: await this.service.transition(
        a,
        { workspaceId: p.workspaceId, courseId: p.courseId },
        'submit-review',
        v.version,
      ),
    };
  }
  @Put(':courseId/categories')
  @HttpCode(204)
  @SchemaBody(c.courseCategoriesSchema)
  categories(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.courseCategoriesSchema)) v: c.CourseCategories,
  ) {
    return this.service.setCategories(
      a,
      { workspaceId: p.workspaceId, courseId: p.courseId },
      v.categoryIds,
    );
  }
  @Put(':courseId/prerequisites')
  @HttpCode(204)
  @SchemaBody(c.coursePrerequisitesSchema)
  prerequisites(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.coursePrerequisitesSchema)) v: c.CoursePrerequisites,
  ) {
    return this.service.prerequisites(a, { workspaceId: p.workspaceId, courseId: p.courseId }, v);
  }
}
@ApiTags('categories')
@ApiBearerAuth()
@UseInterceptors(ContentRequestInterceptor, NoStoreInterceptor, CreatedLocationInterceptor)
@Controller('workspaces/:workspaceId/categories')
export class CategoriesController {
  constructor(private readonly service: CatalogService) {}
  @Get()
  @SchemaQuery(c.cursorQuerySchema)
  @SchemaResponse(c.categoriesResponseSchema)
  list(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Query(new Pipe(c.cursorQuerySchema)) q: c.CursorQuery,
  ) {
    return this.service.categories(a, p.workspaceId, q);
  }
  @Post()
  @SchemaBody(c.categoryCreateSchema)
  @SchemaResponse(c.categoryResponseSchema, 201)
  async create(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams,
    @Body(new Pipe(c.categoryCreateSchema)) v: c.CategoryCreate,
  ) {
    return { data: await this.service.category(a, p.workspaceId, v) };
  }
  @Patch(':categoryId')
  @SchemaBody(c.categoryUpdateSchema)
  @SchemaResponse(c.categoryResponseSchema)
  async update(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams & { categoryId: string },
    @Body(new Pipe(c.categoryUpdateSchema)) v: c.CategoryUpdate,
  ) {
    return { data: await this.service.category(a, p.workspaceId, v, p.categoryId) };
  }
  @Delete(':categoryId')
  @HttpCode(204)
  async remove(
    @CurrentUser() a: AuthenticatedUser,
    @RouteIds() p: CourseParams & { categoryId: string },
  ) {
    await this.service.category(a, p.workspaceId, null, p.categoryId);
  }
}
