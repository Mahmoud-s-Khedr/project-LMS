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
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import * as C from '@lms/shared';
import { CurrentUser } from '../../common/authz/decorators';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaQuery, SchemaResponse } from '../auth/schema.decorator';
import { NoStoreInterceptor } from '../auth/no-store.interceptor';
import { AssessmentAuthoringService } from './authoring.service';
import { AssessmentAttemptsService } from './attempts.service';
import { AssessmentGradingService } from './grading.service';
const rid = (r: Request): string => {
  const value = (r as Request & { id?: unknown }).id;
  return typeof value === 'string' && value.length > 0 && value.length <= 100
    ? value
    : randomUUID();
};
import { assessmentEtag } from './assessment-domain';
import { questionDto } from './assessment.repository';
import type { z } from 'zod';

@ApiTags('Assessments')
@ApiBearerAuth()
@UseInterceptors(NoStoreInterceptor)
@Controller('workspaces/:workspaceId')
export class QuestionBanksController {
  constructor(
    private readonly author: AssessmentAuthoringService,
    private readonly attempts: AssessmentAttemptsService,
    private readonly grading: AssessmentGradingService,
  ) {}
  @Get('question-banks')
  @SchemaResponse(C.questionBanksResponseSchema)
  @SchemaQuery(C.questionBanksQuerySchema)
  async banks(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Query(new ZodValidationPipe(C.questionBanksQuerySchema)) b: C.QuestionBanksQuery,
  ) {
    const value = await this.author.listBanks(a, w, b);
    return C.questionBanksResponseSchema.parse(value);
  }
  @Post('question-banks')
  @HttpCode(201)
  @SchemaResponse(C.questionBankResponseSchema, 201)
  @SchemaBody(C.questionBankCreateSchema)
  async createBank(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(new ZodValidationPipe(C.questionBankCreateSchema)) b: C.QuestionBankCreate,
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.createBank(a, w, b, rid(r));
    res.setHeader('ETag', assessmentEtag(value));
    return C.questionBankResponseSchema.parse({ data: value });
  }
  @Patch('question-banks/:bankId')
  @SchemaResponse(C.questionBankResponseSchema)
  @SchemaBody(C.questionBankUpdateSchema)
  async updateBank(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body(new ZodValidationPipe(C.questionBankUpdateSchema)) b: C.QuestionBankUpdate,
    @Req() r: Request,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.updateBank(a, w, bankId, b, rid(r), ifMatch);
    res.setHeader('ETag', assessmentEtag(value));
    return C.questionBankResponseSchema.parse({ data: value });
  }
  @Delete('question-banks/:bankId')
  @SchemaResponse(C.questionBankResponseSchema)
  @SchemaBody(C.emptyInputSchema)
  async archiveBank(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Req() r: Request,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.updateBank(a, w, bankId, null, rid(r), ifMatch);
    res.setHeader('ETag', assessmentEtag(value));
    return C.questionBankResponseSchema.parse({ data: value });
  }
  @Get('question-banks/:bankId/questions')
  @SchemaResponse(C.authorQuestionsResponseSchema)
  @SchemaQuery(C.questionsQuerySchema)
  async questions(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Query(new ZodValidationPipe(C.questionsQuerySchema)) b: C.QuestionsQuery,
  ) {
    const value = await this.author.questions(a, w, bankId, b);
    return C.authorQuestionsResponseSchema.parse(value);
  }
  @Post('question-banks/:bankId/questions')
  @HttpCode(201)
  @SchemaResponse(C.authorQuestionResponseSchema, 201)
  @SchemaBody(C.questionCreateSchema)
  async createQuestion(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('bankId', ParseUUIDPipe) bankId: string,
    @Body(new ZodValidationPipe(C.questionCreateSchema)) b: C.QuestionCreate,
    @Req() r: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.createQuestion(a, w, bankId, b, rid(r));
    res.setHeader('ETag', assessmentEtag(value));
    return C.authorQuestionResponseSchema.parse({ data: value });
  }
  @Get('questions/:questionId')
  @SchemaResponse(C.authorQuestionResponseSchema)
  async question(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.question(a, w, questionId).then((q) => questionDto(q));
    res.setHeader('ETag', assessmentEtag(value));
    return C.authorQuestionResponseSchema.parse({ data: value });
  }
  @Patch('questions/:questionId')
  @SchemaResponse(C.authorQuestionResponseSchema)
  @SchemaBody(C.questionUpdateSchema)
  async updateQuestion(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(C.questionUpdateSchema)) b: C.QuestionUpdate,
    @Req() r: Request,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.updateQuestion(a, w, questionId, b, rid(r), ifMatch);
    res.setHeader('ETag', assessmentEtag(value));
    return C.authorQuestionResponseSchema.parse({ data: value });
  }
  @Delete('questions/:questionId')
  @SchemaResponse(C.authorQuestionResponseSchema)
  @SchemaBody(C.emptyInputSchema)
  async archiveQuestion(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Req() r: Request,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const value = await this.author.updateQuestion(a, w, questionId, null, rid(r), ifMatch);
    res.setHeader('ETag', assessmentEtag(value));
    return C.authorQuestionResponseSchema.parse({ data: value });
  }
  @Post('questions/:questionId/versions')
  @HttpCode(201)
  @SchemaResponse(C.questionVersionResponseSchema, 201)
  @SchemaBody(C.questionVersionCreateSchema)
  async questionVersion(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body(new ZodValidationPipe(C.questionVersionCreateSchema)) b: C.AuthorQuestionPayload,
    @Req() r: Request,
  ) {
    const value = await this.author.appendQuestionVersion(a, w, questionId, b, rid(r));
    return C.questionVersionResponseSchema.parse({ data: value });
  }
  @Get('questions/:questionId/versions')
  @SchemaResponse(C.questionVersionsResponseSchema)
  @SchemaQuery(C.cursorQuerySchema)
  async questionVersions(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Query(new ZodValidationPipe(C.cursorQuerySchema)) b: C.CursorQuery,
  ) {
    const value = await this.author.questionVersions(a, w, questionId, b);
    return C.questionVersionsResponseSchema.parse(value);
  }
}

@ApiTags('Assessments')
@ApiBearerAuth()
@UseInterceptors(NoStoreInterceptor)
@Controller('workspaces/:workspaceId/courses/:courseId')
export class AssessmentAuthoringController {
  constructor(
    private readonly author: AssessmentAuthoringService,
    private readonly attempts: AssessmentAttemptsService,
    private readonly grading: AssessmentGradingService,
  ) {}
  @Post('lessons/:lessonId/assessment')
  @HttpCode(201)
  @SchemaResponse(C.assessmentResponseSchema, 201)
  @SchemaBody(C.assessmentCreateSchema)
  async create(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('lessonId', ParseUUIDPipe) lessonId: string,
    @Body(new ZodValidationPipe(C.assessmentCreateSchema)) b: C.AssessmentCreate,
    @Req() r: Request,
  ) {
    const value = await this.author.create(a, w, c, lessonId, b, rid(r));
    return C.assessmentResponseSchema.parse({ data: value });
  }
  @Get('assessments/:assessmentId')
  @SchemaResponse(C.assessmentResponseSchema)
  async detail(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    const value = await this.author.detail(a, w, c, assessmentId);
    return C.assessmentResponseSchema.parse({ data: value });
  }
  @Get('assessments/:assessmentId/versions')
  @SchemaQuery(C.cursorQuerySchema)
  @SchemaResponse(C.cursorResponseSchema(C.assessmentVersionSchema))
  async versions(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(C.cursorQuerySchema)) q: C.CursorQuery,
  ) {
    return C.cursorResponseSchema(C.assessmentVersionSchema).parse(
      await this.author.versions(a, w, c, id, q),
    );
  }
  @Get('assessments/:assessmentId/versions/:versionId/questions')
  @SchemaResponse(C.responseSchema(C.assessmentQuestionsReplaceSchema))
  async selectedQuestions(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return C.responseSchema(C.assessmentQuestionsReplaceSchema).parse({
      data: await this.author.selection(a, w, c, id, versionId, 'questions'),
    });
  }
  @Get('assessments/:assessmentId/versions/:versionId/pools')
  @SchemaResponse(C.responseSchema(C.assessmentPoolsReplaceSchema))
  async selectedPools(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return C.responseSchema(C.assessmentPoolsReplaceSchema).parse({
      data: await this.author.selection(a, w, c, id, versionId, 'pools'),
    });
  }
  @Post('assessments/:assessmentId/versions')
  @HttpCode(201)
  @SchemaResponse(C.assessmentVersionResponseSchema, 201)
  @SchemaBody(C.emptyInputSchema)
  async clone(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Req() r: Request,
  ) {
    const value = await this.author.clone(a, w, c, assessmentId, rid(r));
    return C.assessmentVersionResponseSchema.parse({ data: value });
  }
  @Patch('assessments/:assessmentId/versions/:versionId')
  @SchemaResponse(C.assessmentVersionResponseSchema)
  @SchemaBody(C.assessmentVersionUpdateSchema)
  async edit(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(C.assessmentVersionUpdateSchema)) b: C.AssessmentVersionUpdate,
    @Req() r: Request,
  ) {
    const value = await this.author.edit(a, w, c, assessmentId, versionId, b, rid(r));
    return C.assessmentVersionResponseSchema.parse({ data: value });
  }
  @Put('assessments/:assessmentId/versions/:versionId/questions')
  @SchemaResponse(C.assessmentVersionResponseSchema)
  @SchemaBody(C.assessmentQuestionsReplaceSchema)
  async fixed(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(C.assessmentQuestionsReplaceSchema))
    b: C.AssessmentQuestionsReplace,
    @Req() r: Request,
  ) {
    const value = await this.author.edit(a, w, c, assessmentId, versionId, b, rid(r));
    return C.assessmentVersionResponseSchema.parse({ data: value });
  }
  @Put('assessments/:assessmentId/versions/:versionId/pools')
  @SchemaResponse(C.assessmentVersionResponseSchema)
  @SchemaBody(C.assessmentPoolsReplaceSchema)
  async pools(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(C.assessmentPoolsReplaceSchema)) b: C.AssessmentPoolsReplace,
    @Req() r: Request,
  ) {
    const value = await this.author.edit(a, w, c, assessmentId, versionId, b, rid(r));
    return C.assessmentVersionResponseSchema.parse({ data: value });
  }
  @Post('assessments/:assessmentId/versions/:versionId/publish')
  @HttpCode(200)
  @SchemaResponse(C.assessmentVersionResponseSchema)
  @SchemaBody(C.emptyInputSchema)
  async publish(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Req() r: Request,
  ) {
    const value = await this.author.publish(a, w, c, assessmentId, versionId, rid(r));
    return C.assessmentVersionResponseSchema.parse({ data: value });
  }
  @Put('assessments/:assessmentId/accommodations/:enrollmentId')
  @SchemaResponse(C.accommodationResponseSchema)
  @SchemaBody(C.accommodationUpsertSchema)
  async accommodate(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body(new ZodValidationPipe(C.accommodationUpsertSchema)) b: C.AccommodationUpsert,
    @Req() r: Request,
  ) {
    const value = await this.author.accommodate(a, w, c, assessmentId, enrollmentId, b, rid(r));
    return C.accommodationResponseSchema.parse({ data: value });
  }
  @Get('assessments/:assessmentId/attempts')
  @SchemaResponse(C.attemptsResponseSchema)
  @SchemaQuery(C.attemptsQuerySchema)
  async listAttempts(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Query(new ZodValidationPipe(C.attemptsQuerySchema)) b: C.AttemptsQuery,
  ) {
    const value = await this.attempts.staffList(a, w, c, assessmentId, b);
    return C.attemptsResponseSchema.parse(value);
  }
  @Get('assessments/:assessmentId/attempts/:attemptId')
  @SchemaResponse(C.staffAttemptResponseSchema)
  async submission(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const value = await this.attempts.staffDetail(a, w, c, assessmentId, attemptId);
    return C.staffAttemptResponseSchema.parse({ data: value });
  }
  @Post('assessments/:assessmentId/attempts/:attemptId/grades')
  @HttpCode(200)
  @SchemaResponse(C.staffAttemptResponseSchema)
  @SchemaBody(C.gradingInputSchema)
  async grade(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body(new ZodValidationPipe(C.gradingInputSchema)) b: C.GradingInput,
    @Req() r: Request,
  ) {
    await this.grading.grade(a, w, c, assessmentId, attemptId, b, false, rid(r));
    const detail = await this.attempts.staffDetail(a, w, c, assessmentId, attemptId);
    return C.staffAttemptResponseSchema.parse({ data: detail });
  }
  @Post('assessments/:assessmentId/attempts/:attemptId/regrade')
  @HttpCode(200)
  @SchemaResponse(C.staffAttemptResponseSchema)
  @SchemaBody(C.regradeSchema)
  async regrade(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body(new ZodValidationPipe(C.regradeSchema)) b: C.GradingInput,
    @Req() r: Request,
  ) {
    await this.grading.grade(a, w, c, assessmentId, attemptId, b, true, rid(r));
    const detail = await this.attempts.staffDetail(a, w, c, assessmentId, attemptId);
    return C.staffAttemptResponseSchema.parse({ data: detail });
  }
  @Post('assessments/:assessmentId/attempts/:attemptId/void')
  @HttpCode(200)
  @SchemaResponse(C.staffAttemptResponseSchema)
  @SchemaBody(C.voidAttemptSchema)
  async void(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('courseId', ParseUUIDPipe) c: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body(new ZodValidationPipe(C.voidAttemptSchema)) b: z.infer<typeof C.voidAttemptSchema>,
    @Req() r: Request,
  ) {
    await this.grading.void(a, w, c, assessmentId, attemptId, b, rid(r));
    const detail = await this.attempts.staffDetail(a, w, c, assessmentId, attemptId);
    return C.staffAttemptResponseSchema.parse({ data: detail });
  }
}

@ApiTags('Assessments')
@ApiBearerAuth()
@UseInterceptors(NoStoreInterceptor)
@Controller('me')
export class AssessmentLearnerController {
  constructor(
    private readonly author: AssessmentAuthoringService,
    private readonly attempts: AssessmentAttemptsService,
    private readonly grading: AssessmentGradingService,
  ) {}
  @Get('enrollments/:enrollmentId/assessments/:assessmentId')
  @SchemaResponse(C.learnerAssessmentResponseSchema)
  async instructions(
    @CurrentUser() a: AuthenticatedUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    const value = await this.attempts.instructions(a.id, enrollmentId, assessmentId);
    return C.learnerAssessmentResponseSchema.parse({ data: value });
  }
  @Post('enrollments/:enrollmentId/assessments/:assessmentId/attempts')
  @HttpCode(201)
  @SchemaResponse(C.attemptStartResponseSchema, 201)
  @SchemaBody(C.emptyInputSchema)
  async start(
    @CurrentUser() a: AuthenticatedUser,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Headers('idempotency-key') key?: string,
  ) {
    const value = await this.attempts
      .start(a.id, enrollmentId, assessmentId, key ?? '')
      .then(({ submittedAt: _s, answers: _a, ...v }) => v);
    return C.attemptStartResponseSchema.parse({ data: value });
  }
  @Get('attempts/:attemptId')
  @SchemaResponse(C.learnerAttemptResponseSchema)
  async get(
    @CurrentUser() a: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const value = await this.attempts.get(a.id, attemptId);
    return C.learnerAttemptResponseSchema.parse({ data: value });
  }
  @Put('attempts/:attemptId/answers/:attemptQuestionId')
  @SchemaResponse(C.answerSaveResponseSchema)
  @SchemaBody(C.answerSaveSchema)
  async save(
    @CurrentUser() a: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('attemptQuestionId', ParseUUIDPipe) attemptQuestionId: string,
    @Body(new ZodValidationPipe(C.answerSaveSchema)) b: C.AnswerSave,
  ) {
    const value = await this.attempts.save(a.id, attemptId, attemptQuestionId, b);
    return C.answerSaveResponseSchema.parse({ data: value });
  }
  @Post('attempts/:attemptId/submit')
  @HttpCode(200)
  @SchemaResponse(C.attemptSubmitResponseSchema)
  @SchemaBody(C.emptyInputSchema)
  async submit(
    @CurrentUser() a: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Body(new ZodValidationPipe(C.emptyInputSchema.default({}))) _b: Record<string, never>,
    @Headers('idempotency-key') key?: string,
  ) {
    const value = await this.attempts.submit(a.id, attemptId, key ?? '');
    return C.attemptSubmitResponseSchema.parse({ data: value });
  }
  @Get('attempts/:attemptId/result')
  @SchemaResponse(C.releasedResultResponseSchema)
  async result(
    @CurrentUser() a: AuthenticatedUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
  ) {
    const value = await this.attempts.result(a.id, attemptId);
    return C.releasedResultResponseSchema.parse({ data: value });
  }
}
