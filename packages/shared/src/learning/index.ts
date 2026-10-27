import { z } from 'zod';
import { enrollmentStatusSchema, grantSourceSchema, lessonTypeSchema } from '../enums';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { lessonPayloadSchema } from '../content';
import { releasedResultSchema } from '../assessments';
import {
  entityShape,
  uuidSchema,
  timestampSchema,
  percentSchema,
  positionSchema,
  titleSchema,
  reasonSchema,
  dateRangeShape,
  validDateRange,
  responseSchema,
} from '../primitives';
export const accessReasonSchema = z.enum([
  'ACCESS_EXPIRED',
  'ENROLLMENT_REQUIRED',
  'CONTENT_LOCKED',
  'PREREQUISITE_UNMET',
  'USER_SUSPENDED',
  'WORKSPACE_SUSPENDED',
  'ENROLLMENT_SUSPENDED',
  'NOT_RELEASED',
  'AVAILABLE_UNTIL_PASSED',
]);
export const effectiveAccessSchema = z.discriminatedUnion('allowed', [
  z.strictObject({ allowed: z.literal(true), expiresAt: timestampSchema.nullable() }),
  z.strictObject({
    allowed: z.literal(false),
    reason: accessReasonSchema,
    unlockAt: timestampSchema.nullable(),
  }),
]);
export const grantSummarySchema = z.strictObject({
  id: uuidSchema,
  source: grantSourceSchema,
  startsAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
});
export const enrollmentSchema = z.strictObject({
  ...entityShape,
  courseId: uuidSchema,
  userId: uuidSchema,
  cohortId: uuidSchema.nullable(),
  status: enrollmentStatusSchema,
  enrolledAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  lastActivityAt: timestampSchema.nullable(),
  completionPercent: percentSchema,
  access: effectiveAccessSchema,
  grants: z.array(grantSummarySchema).max(1000),
});
export const freeEnrollmentSchema = z.strictObject({ cohortId: uuidSchema.optional() });
export const manualGrantSchema = z
  .strictObject({
    startsAt: timestampSchema,
    expiresAt: timestampSchema.nullable(),
    reason: reasonSchema,
  })
  .refine(
    (v) => !v.expiresAt || Date.parse(v.startsAt) < Date.parse(v.expiresAt),
    'Grant must expire after start',
  );
export const manualEnrollmentSchema = manualGrantSchema.safeExtend({
  userId: uuidSchema,
  cohortId: uuidSchema.optional(),
});
export const enrollmentUpdateSchema = z
  .strictObject({
    status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']).optional(),
    cohortId: uuidSchema.nullable().optional(),
    reason: reasonSchema,
  })
  .refine(
    (v) => v.status !== undefined || v.cohortId !== undefined,
    'Provide a status or cohort change',
  );
export const grantRevokeSchema = z.strictObject({ reason: reasonSchema });
export const staffGrantSchema = grantSummarySchema
  .extend({
    workspaceId: uuidSchema,
    enrollmentId: uuidSchema,
    reason: reasonSchema.nullable(),
    grantedById: uuidSchema.nullable(),
    orderItemId: uuidSchema.nullable(),
    subscriptionId: uuidSchema.nullable(),
  })
  .refine(
    (v) =>
      v.source === 'ORDER_ITEM'
        ? v.orderItemId !== null && v.subscriptionId === null
        : v.source === 'SUBSCRIPTION'
          ? v.subscriptionId !== null && v.orderItemId === null
          : v.orderItemId === null && v.subscriptionId === null,
    'Grant source mismatch',
  )
  .refine(
    (v) =>
      (v.source !== 'MANUAL' || (v.grantedById !== null && v.reason !== null)) &&
      (v.source !== 'SUBSCRIPTION' || v.expiresAt !== null) &&
      (!v.expiresAt || Date.parse(v.startsAt) < Date.parse(v.expiresAt)),
    'Invalid grant provenance or window',
  );
export const enrollmentsQuerySchema = cursorQuerySchema.extend({
  status: enrollmentStatusSchema.optional(),
  courseId: uuidSchema.optional(),
  cohortId: uuidSchema.optional(),
  workspaceId: uuidSchema.optional(),
});
export const rosterQuerySchema = cursorQuerySchema
  .extend({
    status: enrollmentStatusSchema.optional(),
    cohortId: uuidSchema.optional(),
    userId: uuidSchema.optional(),
    source: grantSourceSchema.optional(),
    ...dateRangeShape,
  })
  .refine(validDateRange, 'Invalid date range');
export const progressUpdateSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ACKNOWLEDGE'), eventId: uuidSchema }),
  z.strictObject({ type: z.literal('VIEW'), eventId: uuidSchema }),
  z.strictObject({
    type: z.literal('PLAYBACK'),
    eventId: uuidSchema,
    positionSeconds: positionSchema,
    elapsedSeconds: z.number().int().min(1).max(120),
    occurredAt: timestampSchema,
  }),
]);
export const lessonProgressSchema = z.strictObject({
  ...entityShape,
  enrollmentId: uuidSchema,
  lessonId: uuidSchema,
  positionSeconds: positionSchema,
  watchedSeconds: positionSchema,
  completionPercent: percentSchema,
  completedAt: timestampSchema.nullable(),
  lastViewedAt: timestampSchema.nullable(),
});
export const learnerOutlineLessonSchema = z.strictObject({
  lessonId: uuidSchema,
  title: titleSchema,
  type: lessonTypeSchema,
  position: positionSchema,
  isRequired: z.boolean(),
  completedAt: timestampSchema.nullable(),
  access: effectiveAccessSchema,
});
export const learnerOutlineSchema = z.strictObject({
  enrollmentId: uuidSchema,
  sections: z
    .array(
      z.strictObject({
        sectionId: uuidSchema,
        title: titleSchema,
        position: positionSchema,
        lessons: z.array(learnerOutlineLessonSchema).max(1000),
      }),
    )
    .max(500),
});
export const learnerLessonSchema = z.strictObject({
  assessmentId: uuidSchema.nullable(),
  lessonId: uuidSchema,
  title: titleSchema,
  payload: lessonPayloadSchema,
  assets: z
    .array(
      z.strictObject({
        assetId: uuidSchema,
        filename: z.string().max(255),
        mimeType: z.string().max(160),
        purpose: z.string().max(32),
      }),
    )
    .max(100),
  progress: lessonProgressSchema.nullable(),
});
export const enrollmentResponseSchema = responseSchema(enrollmentSchema);
export const enrollmentsResponseSchema = cursorResponseSchema(enrollmentSchema);
export const staffEnrollmentResponseSchema = responseSchema(
  enrollmentSchema.extend({ grantProvenance: z.array(staffGrantSchema).max(1000) }),
);
export const grantResponseSchema = responseSchema(staffGrantSchema);
export const learnerOutlineResponseSchema = responseSchema(learnerOutlineSchema);
export const learnerLessonResponseSchema = responseSchema(learnerLessonSchema);
export const progressResponseSchema = responseSchema(lessonProgressSchema);
export const enrollmentResultsResponseSchema = responseSchema(z.array(releasedResultSchema));
/** Narrow domain interfaces: no repository or framework dependencies. Implementations own authorization and transactions. */
export interface AccessPolicy {
  evaluate(input: {
    workspaceId: string;
    userId: string;
    enrollmentId: string;
    lessonId?: string;
    at: string;
  }): Promise<z.infer<typeof effectiveAccessSchema>>;
}
export interface AssessmentResultReader {
  effectiveResult(input: {
    workspaceId: string;
    enrollmentId: string;
    assessmentId: string;
  }): Promise<EffectiveAssessmentResult>;
}
export type Enrollment = z.infer<typeof enrollmentSchema>;
export type EffectiveAccess = z.infer<typeof effectiveAccessSchema>;
export type FreeEnrollment = z.infer<typeof freeEnrollmentSchema>;
export type ManualEnrollment = z.infer<typeof manualEnrollmentSchema>;
export type ManualGrant = z.infer<typeof manualGrantSchema>;
export type EnrollmentUpdate = z.infer<typeof enrollmentUpdateSchema>;
export type EnrollmentsQuery = z.infer<typeof enrollmentsQuerySchema>;
export type RosterQuery = z.infer<typeof rosterQuerySchema>;
export type ProgressUpdate = z.infer<typeof progressUpdateSchema>;
export type LearnerOutline = z.infer<typeof learnerOutlineSchema>;
export type LearnerLesson = z.infer<typeof learnerLessonSchema>;

export const previewLessonSchema = learnerLessonSchema
  .omit({ progress: true, assessmentId: true })
  .extend({
    payload: z.discriminatedUnion('type', [
      lessonPayloadSchema.options[0],
      lessonPayloadSchema.options[1],
      lessonPayloadSchema.options[2],
      lessonPayloadSchema.options[3],
    ]),
  });
export const previewLessonResponseSchema = responseSchema(previewLessonSchema);
export const effectiveAssessmentResultSchema = z.discriminatedUnion('finalized', [
  z.strictObject({ finalized: z.literal(false), passed: z.literal(false), percent: z.null() }),
  z.strictObject({ finalized: z.literal(true), passed: z.boolean(), percent: percentSchema }),
]);
export type EffectiveAssessmentResult = z.infer<typeof effectiveAssessmentResultSchema>;
