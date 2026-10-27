import { z } from 'zod';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { capabilityUrlSchema } from '../media';
import {
  uuidSchema,
  timestampSchema,
  dateSchema,
  digitStringSchema,
  positionSchema,
  percentSchema,
  currencySchema,
  dateRangeShape,
  validDateRange,
  responseSchema,
} from '../primitives';
const activityShape = {
  eventId: uuidSchema,
  occurredAt: timestampSchema,
  courseId: uuidSchema,
  lessonId: uuidSchema,
  enrollmentId: uuidSchema,
  sessionKey: z.string().min(1).max(100).optional(),
};
export const clientActivityEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...activityShape,
    type: z.literal('lesson.viewed'),
    properties: z.strictObject({}),
  }),
  z.strictObject({
    ...activityShape,
    type: z.literal('lesson.playback'),
    properties: z.strictObject({
      positionSeconds: positionSchema,
      elapsedSeconds: z.number().int().min(1).max(120),
    }),
  }),
  z.strictObject({
    ...activityShape,
    type: z.literal('lesson.navigation'),
    properties: z.strictObject({ destinationLessonId: uuidSchema }),
  }),
]);
export const activityBatchSchema = z
  .strictObject({
    events: z
      .array(clientActivityEventSchema)
      .min(1)
      .max(100)
      .refine((v) => new Set(v.map((x) => x.eventId)).size === v.length, 'Duplicate activity IDs'),
  })
  .refine(
    (v) => new TextEncoder().encode(JSON.stringify(v)).byteLength <= 262144,
    'Batch exceeds 256 KiB',
  );
export const activityBatchResponseSchema = responseSchema(
  z.strictObject({ accepted: positionSchema, duplicates: positionSchema }),
);
export const analyticsQuerySchema = z
  .strictObject({ ...dateRangeShape, cohortId: uuidSchema.optional() })
  .refine(validDateRange, 'Invalid date range');
export const learnerAnalyticsQuerySchema = cursorQuerySchema
  .extend({ ...dateRangeShape, cohortId: uuidSchema.optional() })
  .refine(validDateRange, 'Invalid date range');
export const revenueQuerySchema = z
  .strictObject({
    ...dateRangeShape,
    productId: uuidSchema.optional(),
    currency: currencySchema.optional(),
  })
  .refine(validDateRange, 'Invalid date range');
export const dailyCourseMetricSchema = z.strictObject({
  courseId: uuidSchema,
  day: dateSchema,
  newEnrollments: positionSchema,
  activeLearners: positionSchema,
  completions: positionSchema,
  learningSeconds: digitStringSchema,
  assessmentSubmissions: positionSchema,
});
export const courseAnalyticsOverviewSchema = z.strictObject({
  courseId: uuidSchema,
  enrollments: digitStringSchema,
  activeLearners: digitStringSchema,
  completions: digitStringSchema,
  completionRate: percentSchema,
  learningSeconds: digitStringSchema,
  daily: z.array(dailyCourseMetricSchema).max(366),
});
export const learnerAnalyticsSchema = z.strictObject({
  enrollmentId: uuidSchema,
  userId: uuidSchema,
  cohortId: uuidSchema.nullable(),
  completionPercent: percentSchema,
  lastActivityAt: timestampSchema.nullable(),
  learningSeconds: digitStringSchema,
});
export const assessmentAnalyticsSchema = z.strictObject({
  assessmentId: uuidSchema,
  attempts: digitStringSchema,
  passed: digitStringSchema,
  awaitingManualGrading: digitStringSchema,
  averagePercent: percentSchema.nullable(),
});
export const studentAnalyticsSchema = z.strictObject({
  enrolledCourses: positionSchema,
  completedCourses: positionSchema,
  learningSeconds: digitStringSchema,
  currentStreakDays: positionSchema,
  courses: z
    .array(
      z.strictObject({
        courseId: uuidSchema,
        enrollmentId: uuidSchema,
        completionPercent: percentSchema,
      }),
    )
    .max(1000),
  activity: z
    .array(z.strictObject({ day: dateSchema, learningSeconds: digitStringSchema }))
    .max(366),
});
export const revenueMetricSchema = z
  .strictObject({
    currency: currencySchema,
    paid: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    refunded: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    net: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  })
  .refine((v) => v.paid - v.refunded === v.net, 'Revenue does not reconcile');
export const reportParametersSchema = z
  .strictObject({
    ...dateRangeShape,
    courseId: uuidSchema.optional(),
    cohortId: uuidSchema.optional(),
    productId: uuidSchema.optional(),
    currency: currencySchema.optional(),
  })
  .refine(validDateRange, 'Invalid date range');
export const exportRequestSchema = z.strictObject({
  kind: z.enum(['LEARNERS', 'ASSESSMENTS', 'REVENUE', 'PROGRESS']),
  parameters: reportParametersSchema,
});
const operationShape = { operationId: uuidSchema, expiresAt: timestampSchema };
export const exportOperationSchema = z.discriminatedUnion('status', [
  z.strictObject({ ...operationShape, status: z.literal('PENDING') }),
  z.strictObject({ ...operationShape, status: z.literal('PROCESSING') }),
  z.strictObject({
    ...operationShape,
    status: z.literal('READY'),
    url: capabilityUrlSchema.optional(),
  }),
  z.strictObject({ ...operationShape, status: z.literal('FAILED') }),
  z.strictObject({ ...operationShape, status: z.literal('EXPIRED') }),
]);
export const exportAcceptedResponseSchema = responseSchema(
  z.strictObject({ operationId: uuidSchema, status: z.literal('PENDING') }),
);
export const exportOperationResponseSchema = responseSchema(exportOperationSchema);
export const courseAnalyticsResponseSchema = responseSchema(courseAnalyticsOverviewSchema);
export const learnerAnalyticsResponseSchema = cursorResponseSchema(learnerAnalyticsSchema);
export const assessmentAnalyticsResponseSchema = responseSchema(z.array(assessmentAnalyticsSchema));
export const studentAnalyticsResponseSchema = responseSchema(studentAnalyticsSchema);
export const revenueResponseSchema = responseSchema(z.array(revenueMetricSchema));
export type ClientActivityEvent = z.infer<typeof clientActivityEventSchema>;
export type ActivityBatch = z.infer<typeof activityBatchSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type LearnerAnalyticsQuery = z.infer<typeof learnerAnalyticsQuerySchema>;
export type RevenueQuery = z.infer<typeof revenueQuerySchema>;
export type CourseAnalyticsOverview = z.infer<typeof courseAnalyticsOverviewSchema>;
export type StudentAnalytics = z.infer<typeof studentAnalyticsSchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type ExportOperation = z.infer<typeof exportOperationSchema>;
