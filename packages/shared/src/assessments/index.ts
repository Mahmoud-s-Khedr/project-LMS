import { z } from 'zod';
import {
  assessmentKindSchema,
  assessmentStatusSchema,
  attemptStatusSchema,
  questionTypeSchema,
  gradePolicySchema,
  feedbackPolicySchema,
} from '../enums';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { submissionMimeSchema } from '../media';
import {
  entityShape,
  uuidSchema,
  titleSchema,
  nameSchema,
  positionSchema,
  versionSchema,
  timestampSchema,
  pointsSchema,
  decimalSchema,
  percentSchema,
  digitStringSchema,
  richTextSchema,
  reasonSchema,
  searchSchema,
  uniqueIdsSchema,
  nonemptyPatch,
  responseSchema,
  dateRangeShape,
  decimalUnits,
  validDateRange,
} from '../primitives';
export const optionKeySchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
const optionKeysSchema = z
  .array(optionKeySchema)
  .max(100)
  .refine((v) => new Set(v).size === v.length, 'Duplicate option keys');
export const questionOptionSchema = z.strictObject({
  key: optionKeySchema,
  content: richTextSchema,
  position: positionSchema,
  group: z.enum(['LEFT', 'RIGHT']).optional(),
});
const optionsSchema = z
  .array(questionOptionSchema)
  .max(100)
  .refine(
    (v) =>
      new Set(v.map((x) => x.key)).size === v.length &&
      new Set(v.map((x) => x.position)).size === v.length,
    'Duplicate option key or position',
  );
const pairSchema = z.strictObject({ leftKey: optionKeySchema, rightKey: optionKeySchema });
const pairsSchema = z
  .array(pairSchema)
  .max(100)
  .refine(
    (v) =>
      new Set(v.map((x) => x.leftKey)).size === v.length &&
      new Set(v.map((x) => x.rightKey)).size === v.length,
    'Duplicate pair keys',
  );
export const questionResponseSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('SINGLE_CHOICE'), optionKey: optionKeySchema }),
  z.strictObject({ type: z.literal('MULTIPLE_CHOICE'), optionKeys: optionKeysSchema }),
  z.strictObject({ type: z.literal('TRUE_FALSE'), value: z.boolean() }),
  z.strictObject({ type: z.literal('SHORT_ANSWER'), text: z.string().max(10000) }),
  z.strictObject({ type: z.literal('NUMERIC'), value: decimalSchema }),
  z.strictObject({ type: z.literal('ESSAY'), document: richTextSchema }),
  z.strictObject({ type: z.literal('FILE_UPLOAD'), note: z.string().max(10000) }),
  z.strictObject({ type: z.literal('MATCHING'), pairs: pairsSchema }),
  z.strictObject({ type: z.literal('ORDERING'), optionKeys: optionKeysSchema }),
]);
const authorCommon = {
  prompt: richTextSchema,
  options: optionsSchema,
  explanation: richTextSchema.nullable(),
  defaultPoints: pointsSchema,
};
const exactConfig = z.strictObject({});
const partialConfig = z.strictObject({ partialCredit: z.boolean().default(false) });
const manualKey = z.strictObject({});
export const authorQuestionPayloadSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      ...authorCommon,
      type: z.literal('SINGLE_CHOICE'),
      answerKey: z.strictObject({ correctOptionKeys: optionKeysSchema.length(1) }),
      gradingConfig: exactConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('MULTIPLE_CHOICE'),
      answerKey: z.strictObject({ correctOptionKeys: optionKeysSchema.min(1) }),
      gradingConfig: partialConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('TRUE_FALSE'),
      answerKey: z.strictObject({ value: z.boolean() }),
      gradingConfig: exactConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('SHORT_ANSWER'),
      answerKey: z.strictObject({
        accepted: z.array(z.string().min(1).max(10000)).min(1).max(100),
      }),
      gradingConfig: z.strictObject({
        caseSensitive: z.boolean(),
        trim: z.boolean(),
        collapseWhitespace: z.boolean(),
      }),
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('NUMERIC'),
      answerKey: z.strictObject({
        value: decimalSchema,
        absoluteTolerance: decimalSchema.refine(
          (v) => !v.startsWith('-'),
          'Tolerance must be nonnegative',
        ),
      }),
      gradingConfig: exactConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('ESSAY'),
      answerKey: manualKey,
      gradingConfig: exactConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('FILE_UPLOAD'),
      answerKey: manualKey,
      gradingConfig: exactConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('MATCHING'),
      answerKey: z.strictObject({ pairs: pairsSchema.min(1) }),
      gradingConfig: partialConfig,
    }),
    z.strictObject({
      ...authorCommon,
      type: z.literal('ORDERING'),
      answerKey: z.strictObject({ optionKeys: optionKeysSchema.min(1) }),
      gradingConfig: exactConfig,
    }),
  ])
  .superRefine((v, ctx) => {
    const keys = new Set(v.options.map((x) => x.key));
    const fail = (message: string) =>
      ctx.addIssue({ code: 'custom', path: ['answerKey'], message });
    if (v.type === 'SINGLE_CHOICE' || v.type === 'MULTIPLE_CHOICE') {
      if (keys.size < 2 || v.answerKey.correctOptionKeys.some((k) => !keys.has(k)))
        fail('Choice key must reference available options');
    } else if (v.type === 'ORDERING') {
      if (
        keys.size < 2 ||
        v.answerKey.optionKeys.length !== keys.size ||
        v.answerKey.optionKeys.some((k) => !keys.has(k))
      )
        fail('Order must contain every option exactly once');
    } else if (v.type === 'MATCHING') {
      const left = new Set(v.options.filter((x) => x.group === 'LEFT').map((x) => x.key));
      const right = new Set(v.options.filter((x) => x.group === 'RIGHT').map((x) => x.key));
      if (
        left.size + right.size !== keys.size ||
        v.answerKey.pairs.length !== left.size ||
        v.answerKey.pairs.some((p) => !left.has(p.leftKey) || !right.has(p.rightKey))
      )
        fail('Matching keys must reference left/right options');
    } else if (v.options.length > 0) fail('This question type has no options');
  });
export const rubricSchema = z.strictObject({
  criteria: z
    .array(
      z.strictObject({
        id: optionKeySchema,
        label: nameSchema,
        description: z.string().max(2000).optional(),
        maxPoints: pointsSchema,
      }),
    )
    .min(1)
    .max(100)
    .refine((v) => new Set(v.map((x) => x.id)).size === v.length, 'Duplicate rubric criteria'),
});
export const rubricScoresSchema = z
  .array(z.strictObject({ criterionId: optionKeySchema, points: pointsSchema }))
  .max(100)
  .refine((v) => new Set(v.map((x) => x.criterionId)).size === v.length, 'Duplicate rubric scores');
export const questionBankCreateSchema = z.strictObject({
  name: nameSchema,
  description: z.string().max(10000).nullable().optional(),
});
export const questionBankUpdateSchema = nonemptyPatch(questionBankCreateSchema.shape);
export const questionBankSchema = z.strictObject({
  ...entityShape,
  name: nameSchema,
  description: z.string().max(10000).nullable(),
  createdById: uuidSchema,
});
export const questionBanksQuerySchema = cursorQuerySchema.extend({
  search: searchSchema.optional(),
  createdById: uuidSchema.optional(),
});
export const tagsSchema = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .refine((v) => new Set(v).size === v.length, 'Duplicate tags');
export const questionCreateSchema = z.strictObject({
  title: titleSchema,
  tags: tagsSchema,
  payload: authorQuestionPayloadSchema,
});
export const questionUpdateSchema = nonemptyPatch({ title: titleSchema, tags: tagsSchema });
export const questionVersionCreateSchema = authorQuestionPayloadSchema;
export const authorQuestionVersionSchema = z.strictObject({
  id: uuidSchema,
  workspaceId: uuidSchema,
  questionId: uuidSchema,
  version: versionSchema,
  createdAt: timestampSchema,
  payload: authorQuestionPayloadSchema,
});
export const authorQuestionSchema = z.strictObject({
  ...entityShape,
  bankId: uuidSchema,
  createdById: uuidSchema,
  title: titleSchema,
  tags: tagsSchema,
  archivedAt: timestampSchema.nullable(),
  latestVersion: authorQuestionVersionSchema,
});
export const questionsQuerySchema = cursorQuerySchema.extend({
  search: searchSchema.optional(),
  type: questionTypeSchema.optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  tags: tagsSchema.optional(),
});
export const assessmentCreateSchema = z.strictObject({
  kind: assessmentKindSchema,
  title: titleSchema,
});
export const assessmentSchema = z.strictObject({
  ...entityShape,
  ...assessmentCreateSchema.shape,
  courseId: uuidSchema,
  lessonId: uuidSchema,
  currentPublishedVersion: versionSchema.nullable(),
});
export const assessmentVersionConfigSchema = z
  .strictObject({
    instructions: richTextSchema,
    maxAttempts: z.number().int().min(1).max(1000),
    timeLimitSeconds: z.number().int().min(1).max(604800).nullable(),
    availableFrom: timestampSchema.nullable(),
    dueAt: timestampSchema.nullable(),
    availableUntil: timestampSchema.nullable(),
    allowLateSubmission: z.boolean(),
    latePenaltyPercent: percentSchema,
    passPercent: percentSchema,
    gradePolicy: gradePolicySchema,
    feedbackPolicy: feedbackPolicySchema,
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    rubric: rubricSchema.nullable(),
    allowedFileTypes: z.array(submissionMimeSchema).min(1).max(4),
    maxUploadBytes: digitStringSchema.pipe(
      z
        .string()
        .refine((v) => BigInt(v) > 0n && BigInt(v) <= 10485760n, 'Upload limit must be 1..10 MiB'),
    ),
    maxFiles: z.number().int().min(1).max(5),
  })
  .refine(
    (v) =>
      (!v.availableFrom ||
        !v.availableUntil ||
        Date.parse(v.availableFrom) < Date.parse(v.availableUntil)) &&
      (!v.dueAt || !v.availableUntil || Date.parse(v.dueAt) <= Date.parse(v.availableUntil)) &&
      (!v.availableFrom || !v.dueAt || Date.parse(v.availableFrom) < Date.parse(v.dueAt)),
    'Invalid assessment window',
  );
export const assessmentVersionUpdateSchema = z
  .strictObject(assessmentVersionConfigSchema.shape)
  .partial()
  .extend({ version: versionSchema })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Provide a change');
export const assessmentVersionSchema = assessmentVersionConfigSchema.safeExtend({
  ...entityShape,
  assessmentId: uuidSchema,
  version: versionSchema,
  status: assessmentStatusSchema,
  publishedAt: timestampSchema.nullable(),
});
export const assessmentQuestionsReplaceSchema = z.strictObject({
  version: versionSchema,
  questions: z
    .array(
      z.strictObject({
        questionVersionId: uuidSchema,
        points: pointsSchema,
        position: positionSchema,
        isRequired: z.boolean(),
      }),
    )
    .max(500)
    .refine(
      (v) =>
        new Set(v.map((x) => x.questionVersionId)).size === v.length &&
        new Set(v.map((x) => x.position)).size === v.length,
      'Duplicate fixed selection',
    ),
});
export const assessmentPoolsReplaceSchema = z.strictObject({
  version: versionSchema,
  pools: z
    .array(
      z.strictObject({
        bankId: uuidSchema,
        position: positionSchema,
        count: z.number().int().min(1).max(500),
        pointsEach: pointsSchema,
        tags: tagsSchema,
        questionType: questionTypeSchema.nullable(),
      }),
    )
    .max(50)
    .refine((v) => new Set(v.map((x) => x.position)).size === v.length, 'Duplicate pool position'),
});
export const accommodationUpsertSchema = z.strictObject({
  extraTimeSeconds: positionSchema,
  extraAttempts: positionSchema,
  availableUntil: timestampSchema.nullable(),
  reason: reasonSchema,
});
export const accommodationSchema = accommodationUpsertSchema.extend({
  ...entityShape,
  assessmentId: uuidSchema,
  enrollmentId: uuidSchema,
  grantedById: uuidSchema,
});
export const learnerQuestionSchema = z.strictObject({
  attemptQuestionId: uuidSchema,
  type: questionTypeSchema,
  prompt: richTextSchema,
  options: optionsSchema,
  points: pointsSchema,
  isRequired: z.boolean(),
  position: positionSchema,
});
export const answerSaveSchema = z
  .strictObject({
    version: versionSchema,
    response: questionResponseSchema,
    attachmentIds: uniqueIdsSchema.max(5).optional(),
  })
  .refine(
    (v) => v.response.type === 'FILE_UPLOAD' || !v.attachmentIds?.length,
    'Attachments only belong to file-upload responses',
  );
export const savedAnswerSchema = z.strictObject({
  attemptQuestionId: uuidSchema,
  version: versionSchema,
  response: questionResponseSchema.nullable(),
  attachmentIds: uniqueIdsSchema.max(5),
  savedAt: timestampSchema,
});
const attemptShape = {
  attemptId: uuidSchema,
  version: versionSchema,
  status: attemptStatusSchema,
  startedAt: timestampSchema,
  deadlineAt: timestampSchema.nullable(),
  questions: z.array(learnerQuestionSchema).max(500),
};
export const attemptStartSchema = z.strictObject(attemptShape);
export const learnerAttemptSchema = attemptStartSchema.extend({
  submittedAt: timestampSchema.nullable(),
  answers: z.array(savedAnswerSchema).max(500),
});
export const attemptStateSchema = z.strictObject({
  attemptId: uuidSchema,
  version: versionSchema,
  status: attemptStatusSchema,
  submittedAt: timestampSchema.nullable(),
});
export const releasedAnswerResultSchema = z.strictObject({
  attemptQuestionId: uuidSchema,
  awardedPoints: pointsSchema,
  isCorrect: z.boolean().nullable(),
  feedback: z.string().max(10000).nullable(),
});
export const releasedResultSchema = z
  .strictObject({
    attemptId: uuidSchema,
    assessmentId: uuidSchema,
    number: versionSchema,
    status: z.literal('GRADED'),
    totalPoints: pointsSchema,
    awardedPoints: pointsSchema,
    percent: percentSchema,
    passed: z.boolean(),
    gradedAt: timestampSchema,
    answers: z.array(releasedAnswerResultSchema).max(500),
  })
  .refine(
    (v) =>
      pointsSchema.safeParse(v.totalPoints).success &&
      pointsSchema.safeParse(v.awardedPoints).success &&
      decimalUnits(v.totalPoints) > 0n &&
      decimalUnits(v.awardedPoints) <= decimalUnits(v.totalPoints),
    'Awarded points cannot exceed positive total',
  );
export const learnerAssessmentSchema = z.strictObject({
  assessmentId: uuidSchema,
  kind: assessmentKindSchema,
  title: titleSchema,
  version: versionSchema,
  instructions: richTextSchema,
  remainingAttempts: positionSchema,
  timeLimitSeconds: positionSchema.nullable(),
  availableFrom: timestampSchema.nullable(),
  dueAt: timestampSchema.nullable(),
  availableUntil: timestampSchema.nullable(),
  passPercent: percentSchema,
  feedbackPolicy: feedbackPolicySchema,
  allowedFileTypes: z.array(submissionMimeSchema),
  maxUploadBytes: digitStringSchema,
  maxFiles: z.number().int().min(1).max(5),
});
export const gradingInputSchema = z.strictObject({
  version: versionSchema,
  final: z.boolean(),
  reason: reasonSchema,
  answers: z
    .array(
      z.strictObject({
        answerId: uuidSchema,
        awardedPoints: pointsSchema,
        rubricScores: rubricScoresSchema.nullable(),
        feedback: z.string().max(10000).nullable(),
      }),
    )
    .min(1)
    .max(500)
    .refine((v) => new Set(v.map((x) => x.answerId)).size === v.length, 'Duplicate answer grades'),
});
export const regradeSchema = gradingInputSchema;
export const voidAttemptSchema = z.strictObject({ version: versionSchema, reason: reasonSchema });
export const gradeEventSchema = z.strictObject({
  attemptQuestionId: uuidSchema.nullable().optional(),
  id: uuidSchema,
  workspaceId: uuidSchema,
  attemptId: uuidSchema,
  answerId: uuidSchema.nullable(),
  previousPoints: pointsSchema.nullable(),
  awardedPoints: pointsSchema,
  rubricScores: rubricScoresSchema.nullable(),
  feedback: z.string().max(10000).nullable(),
  reason: reasonSchema,
  isAutomatic: z.boolean(),
  gradedById: uuidSchema.nullable(),
  createdAt: timestampSchema,
});
export const staffAttemptSummarySchema = z.strictObject({
  attemptId: uuidSchema,
  workspaceId: uuidSchema,
  assessmentId: uuidSchema,
  enrollmentId: uuidSchema,
  number: versionSchema,
  status: attemptStatusSchema,
  version: versionSchema,
  startedAt: timestampSchema,
  deadlineAt: timestampSchema.nullable(),
  submittedAt: timestampSchema.nullable(),
  gradedAt: timestampSchema.nullable(),
  totalPoints: pointsSchema,
  awardedPoints: pointsSchema.nullable(),
  percent: percentSchema.nullable(),
  passed: z.boolean().nullable(),
});
export const staffAttemptSchema = staffAttemptSummarySchema.extend({
  rubric: rubricSchema.nullable().optional(),
  questions: z
    .array(
      z.strictObject({
        delivery: learnerQuestionSchema,
        authorVersion: authorQuestionVersionSchema,
        answer: savedAnswerSchema.nullable(),
      }),
    )
    .max(500),
  gradeEvents: z.array(gradeEventSchema).max(1000),
});
export const attemptsQuerySchema = cursorQuerySchema
  .extend({
    status: attemptStatusSchema.optional(),
    cohortId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    ...dateRangeShape,
  })
  .refine(validDateRange, 'Invalid date range');
export const questionBankResponseSchema = responseSchema(questionBankSchema);
export const questionBanksResponseSchema = cursorResponseSchema(questionBankSchema);
export const authorQuestionResponseSchema = responseSchema(authorQuestionSchema);
export const authorQuestionsResponseSchema = cursorResponseSchema(authorQuestionSchema);
export const questionVersionResponseSchema = responseSchema(authorQuestionVersionSchema);
export const questionVersionsResponseSchema = cursorResponseSchema(authorQuestionVersionSchema);
export const assessmentResponseSchema = responseSchema(assessmentSchema);
export const assessmentVersionResponseSchema = responseSchema(assessmentVersionSchema);
export const accommodationResponseSchema = responseSchema(accommodationSchema);
export const attemptStartResponseSchema = responseSchema(attemptStartSchema);
export const learnerAttemptResponseSchema = responseSchema(learnerAttemptSchema);
export const answerSaveResponseSchema = responseSchema(savedAnswerSchema);
export const attemptSubmitResponseSchema = responseSchema(attemptStateSchema);
export const releasedResultResponseSchema = responseSchema(releasedResultSchema);
export const learnerAssessmentResponseSchema = responseSchema(learnerAssessmentSchema);
export const staffAttemptResponseSchema = responseSchema(staffAttemptSchema);
export const attemptsResponseSchema = cursorResponseSchema(staffAttemptSummarySchema);
export const gradeEventResponseSchema = responseSchema(gradeEventSchema);
export type QuestionResponse = z.infer<typeof questionResponseSchema>;
export type AuthorQuestionPayload = z.infer<typeof authorQuestionPayloadSchema>;
export type AuthorQuestion = z.infer<typeof authorQuestionSchema>;
export type QuestionCreate = z.infer<typeof questionCreateSchema>;
export type QuestionUpdate = z.infer<typeof questionUpdateSchema>;
export type QuestionBankCreate = z.infer<typeof questionBankCreateSchema>;
export type QuestionBankUpdate = z.infer<typeof questionBankUpdateSchema>;
export type QuestionBanksQuery = z.infer<typeof questionBanksQuerySchema>;
export type QuestionsQuery = z.infer<typeof questionsQuerySchema>;
export type AssessmentCreate = z.infer<typeof assessmentCreateSchema>;
export type AssessmentVersionConfig = z.infer<typeof assessmentVersionConfigSchema>;
export type AssessmentVersionUpdate = z.infer<typeof assessmentVersionUpdateSchema>;
export type AssessmentQuestionsReplace = z.infer<typeof assessmentQuestionsReplaceSchema>;
export type AssessmentPoolsReplace = z.infer<typeof assessmentPoolsReplaceSchema>;
export type AccommodationUpsert = z.infer<typeof accommodationUpsertSchema>;
export type LearnerQuestion = z.infer<typeof learnerQuestionSchema>;
export type LearnerAttempt = z.infer<typeof learnerAttemptSchema>;
export type AttemptStart = z.infer<typeof attemptStartSchema>;
export type AnswerSave = z.infer<typeof answerSaveSchema>;
export type ReleasedResult = z.infer<typeof releasedResultSchema>;
export type GradingInput = z.infer<typeof gradingInputSchema>;
export type AttemptsQuery = z.infer<typeof attemptsQuerySchema>;
export type StaffAttempt = z.infer<typeof staffAttemptSchema>;
export type GradeEvent = z.infer<typeof gradeEventSchema>;

export const assessmentVersionsResponseSchema = cursorResponseSchema(assessmentVersionSchema);
export const assessmentQuestionSelectionResponseSchema = responseSchema(
  assessmentQuestionsReplaceSchema,
);
export const assessmentPoolSelectionResponseSchema = responseSchema(assessmentPoolsReplaceSchema);
