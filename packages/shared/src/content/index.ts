import { z } from 'zod';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { completionRuleSchema, liveSessionStatusSchema, attendanceStatusSchema } from '../enums';
import {
  entityShape,
  titleSchema,
  nameSchema,
  positionSchema,
  versionSchema,
  uuidSchema,
  timestampSchema,
  timezoneSchema,
  richTextSchema,
  httpsUrlSchema,
  uniqueIdsSchema,
  reasonSchema,
  nonemptyPatch,
  responseSchema,
} from '../primitives';
export const sectionCreateSchema = z.strictObject({ title: titleSchema, position: positionSchema });
export const sectionUpdateSchema = nonemptyPatch({ title: titleSchema });
export const sectionSchema = z.strictObject({
  ...entityShape,
  ...sectionCreateSchema.shape,
  courseId: uuidSchema,
});
export const lessonReleaseSchema = z.discriminatedUnion('releaseType', [
  z.strictObject({
    releaseType: z.literal('IMMEDIATE'),
    availableUntil: timestampSchema.nullable().optional(),
  }),
  z
    .strictObject({
      releaseType: z.literal('ABSOLUTE'),
      releaseAt: timestampSchema,
      availableUntil: timestampSchema.nullable().optional(),
    })
    .refine(
      (v) => !v.availableUntil || Date.parse(v.availableUntil) > Date.parse(v.releaseAt),
      'Release must precede close',
    ),
  z.strictObject({
    releaseType: z.literal('ENROLLMENT_OFFSET'),
    releaseOffsetDays: positionSchema,
    availableUntil: timestampSchema.nullable().optional(),
  }),
  z.strictObject({
    releaseType: z.literal('COHORT_OFFSET'),
    releaseOffsetDays: positionSchema,
    availableUntil: timestampSchema.nullable().optional(),
  }),
]);
const lessonCommonShape = {
  title: titleSchema,
  position: positionSchema,
  isRequired: z.boolean(),
  isPreview: z.boolean(),
  isPublished: z.boolean(),
  estimatedMinutes: positionSchema,
  completionRule: completionRuleSchema,
  requiredWatchPercent: z.number().int().min(1).max(100),
  release: lessonReleaseSchema,
};
export const lessonPayloadSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('VIDEO'),
    body: z.strictObject({ durationSeconds: z.number().int().positive().optional() }),
  }),
  z.strictObject({ type: z.literal('DOCUMENT'), body: z.strictObject({}) }),
  z.strictObject({ type: z.literal('TEXT'), body: richTextSchema }),
  z.strictObject({
    type: z.literal('INTERACTIVE'),
    body: z.strictObject({
      embedUrl: httpsUrlSchema,
      sandbox: z.array(z.enum(['allow-scripts', 'allow-same-origin', 'allow-presentation'])).max(3),
    }),
  }),
  z.strictObject({ type: z.literal('QUIZ'), body: z.strictObject({}) }),
  z.strictObject({ type: z.literal('ASSIGNMENT'), body: z.strictObject({}) }),
  z.strictObject({ type: z.literal('EXAM'), body: z.strictObject({}) }),
  z.strictObject({
    type: z.literal('LIVE_SESSION'),
    body: z.strictObject({ qualifyingSessionId: uuidSchema.nullable().optional() }),
  }),
]);
// Intersecting keeps every variant strict while metadata stays independently reusable.
export const lessonCreateSchema = z
  .strictObject({ ...lessonCommonShape, payload: lessonPayloadSchema })
  .superRefine((v, ctx) => {
    if (v.isPreview && ['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(v.payload.type))
      ctx.addIssue({
        code: 'custom',
        path: ['isPreview'],
        message: 'Protected activities cannot be previews',
      });
    if (v.completionRule === 'WATCH_PERCENT' && v.payload.type !== 'VIDEO')
      ctx.addIssue({
        code: 'custom',
        path: ['completionRule'],
        message: 'Watch completion requires video',
      });
    if (
      v.completionRule === 'ASSESSMENT_PASS' &&
      !['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(v.payload.type)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['completionRule'],
        message: 'Assessment completion requires assessment lesson',
      });
    if (v.completionRule === 'ATTENDANCE' && v.payload.type !== 'LIVE_SESSION')
      ctx.addIssue({
        code: 'custom',
        path: ['completionRule'],
        message: 'Attendance requires live lesson',
      });
  });
export const lessonUpdateSchema = z
  .strictObject(lessonCreateSchema.shape)
  .partial()
  .extend({ version: versionSchema })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Provide a change');
export const lessonSchema = lessonCreateSchema.safeExtend({
  ...entityShape,
  version: versionSchema,
  courseId: uuidSchema,
  sectionId: uuidSchema,
});
export const lessonPrerequisitesSchema = z.strictObject({ requiredLessonIds: uniqueIdsSchema });
export const lessonAssetPurposeSchema = z.enum([
  'PRIMARY_VIDEO',
  'PRIMARY_DOCUMENT',
  'CAPTIONS',
  'RESOURCE',
  'RECORDING',
]);
export const lessonAssetAttachSchema = z.strictObject({
  assetId: uuidSchema,
  purpose: lessonAssetPurposeSchema,
  position: positionSchema,
});
export const lessonAssetSchema = lessonAssetAttachSchema.extend({
  id: uuidSchema,
  workspaceId: uuidSchema,
  lessonId: uuidSchema,
});
export const cohortCreateSchema = z
  .strictObject({
    name: nameSchema,
    startsAt: timestampSchema,
    endsAt: timestampSchema.nullable(),
    enrollmentOpensAt: timestampSchema.nullable(),
    enrollmentClosesAt: timestampSchema.nullable(),
    capacity: z.number().int().positive().max(2147483647).nullable(),
    isPublished: z.boolean(),
    timezone: timezoneSchema,
  })
  .refine(
    (v) =>
      (!v.endsAt || Date.parse(v.startsAt) < Date.parse(v.endsAt)) &&
      (!v.enrollmentOpensAt ||
        !v.enrollmentClosesAt ||
        Date.parse(v.enrollmentOpensAt) < Date.parse(v.enrollmentClosesAt)),
    'Invalid cohort window',
  );
export const cohortUpdateSchema = z
  .strictObject(cohortCreateSchema.shape)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Provide a change')
  .refine(
    (v) =>
      (!v.startsAt || !v.endsAt || Date.parse(v.startsAt) < Date.parse(v.endsAt)) &&
      (!v.enrollmentOpensAt ||
        !v.enrollmentClosesAt ||
        Date.parse(v.enrollmentOpensAt) < Date.parse(v.enrollmentClosesAt)),
    'Invalid cohort window',
  );
export const cohortSchema = cohortCreateSchema.safeExtend({ ...entityShape, courseId: uuidSchema });
export const publicCohortSchema = z
  .strictObject(cohortSchema.shape)
  .omit({ createdAt: true, updatedAt: true })
  .extend({
    isPublished: z.literal(true),
    seatsAvailable: z.number().int().nonnegative().nullable(),
  });
export const cohortReleaseUpsertSchema = z
  .strictObject({ releaseAt: timestampSchema, availableUntil: timestampSchema.nullable() })
  .refine(
    (v) => !v.availableUntil || Date.parse(v.releaseAt) < Date.parse(v.availableUntil),
    'Invalid release window',
  );
export const liveSessionCreateSchema = z
  .strictObject({
    title: titleSchema,
    provider: z.string().min(1).max(60),
    joinUrl: httpsUrlSchema,
    hostUrl: httpsUrlSchema.nullable().optional(),
    startsAt: timestampSchema,
    endsAt: timestampSchema,
    cohortId: uuidSchema.nullable().optional(),
  })
  .refine((v) => Date.parse(v.startsAt) < Date.parse(v.endsAt), 'Invalid session window');
export const liveSessionUpdateSchema = z
  .strictObject(liveSessionCreateSchema.shape)
  .partial()
  .extend({ status: z.enum(['SCHEDULED', 'CANCELED']).optional() })
  .refine((v) => Object.keys(v).length > 0, 'Provide a change')
  .refine(
    (v) => !v.startsAt || !v.endsAt || Date.parse(v.startsAt) < Date.parse(v.endsAt),
    'Invalid session window',
  );
export const liveSessionSchema = z.strictObject({
  ...entityShape,
  title: titleSchema,
  provider: z.string().max(60),
  startsAt: timestampSchema,
  endsAt: timestampSchema,
  status: liveSessionStatusSchema,
  courseId: uuidSchema,
  lessonId: uuidSchema,
  cohortId: uuidSchema.nullable(),
  recordingAssetId: uuidSchema.nullable(),
});
export const attendanceUpdateSchema = z.strictObject({
  status: attendanceStatusSchema,
  attendedSeconds: positionSchema,
  reason: reasonSchema,
});
export const attendanceSchema = z.strictObject({
  ...entityShape,
  sessionId: uuidSchema,
  enrollmentId: uuidSchema,
  status: attendanceStatusSchema,
  durationSeconds: positionSchema,
  joinedAt: timestampSchema.nullable(),
  leftAt: timestampSchema.nullable(),
});
export const sectionsResponseSchema = responseSchema(z.array(sectionSchema));
export const sectionResponseSchema = responseSchema(sectionSchema);
export const lessonResponseSchema = responseSchema(lessonSchema);
export const lessonAssetResponseSchema = responseSchema(lessonAssetSchema);
export const cohortsQuerySchema = cursorQuerySchema;
export const cohortResponseSchema = responseSchema(cohortSchema);
export const cohortsResponseSchema = cursorResponseSchema(cohortSchema);
export const publicCohortsResponseSchema = cursorResponseSchema(publicCohortSchema);
export const liveSessionResponseSchema = responseSchema(liveSessionSchema);
export const attendanceResponseSchema = responseSchema(attendanceSchema);
export const attendanceListResponseSchema = cursorResponseSchema(attendanceSchema);
export type Section = z.infer<typeof sectionSchema>;
export type SectionCreate = z.infer<typeof sectionCreateSchema>;
export type SectionUpdate = z.infer<typeof sectionUpdateSchema>;
export type LessonPayload = z.infer<typeof lessonPayloadSchema>;
export type LessonRelease = z.infer<typeof lessonReleaseSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type LessonCreate = z.infer<typeof lessonCreateSchema>;
export type LessonUpdate = z.infer<typeof lessonUpdateSchema>;
export type Cohort = z.infer<typeof cohortSchema>;
export type CohortCreate = z.infer<typeof cohortCreateSchema>;
export type CohortUpdate = z.infer<typeof cohortUpdateSchema>;
export type CohortReleaseUpsert = z.infer<typeof cohortReleaseUpsertSchema>;
export type LiveSession = z.infer<typeof liveSessionSchema>;
export type LiveSessionCreate = z.infer<typeof liveSessionCreateSchema>;
export type LiveSessionUpdate = z.infer<typeof liveSessionUpdateSchema>;
export type AttendanceUpdate = z.infer<typeof attendanceUpdateSchema>;
