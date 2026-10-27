import { z } from 'zod';
import { catalogCoursesResponseSchema, catalogCourseResponseSchema } from '../catalog';
import { enrollmentResponseSchema, learnerOutlineResponseSchema } from '../learning';
import {
  attemptStartResponseSchema,
  learnerAttemptResponseSchema,
  releasedResultResponseSchema,
  gradingInputSchema,
} from '../assessments';
import { checkoutSessionResponseSchema, checkoutQuoteResponseSchema } from '../commerce';
import { apiErrorSchema } from '../errors';
import {
  courseAnalyticsResponseSchema,
  studentAnalyticsResponseSchema,
  revenueResponseSchema,
  exportOperationResponseSchema,
} from '../analytics';
import { domainEventSchema } from '../events';
import { notificationResponseSchema, certificateVerificationResponseSchema } from '../engagement';
/** Deterministic fictional values, safe for HTTP mocks. No keys, seeds, credentials or private solutions. */
export const fixtureIds = {
  workspace: '10000000-0000-4000-8000-000000000001',
  course: '10000000-0000-4000-8000-000000000002',
  enrollment: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  lesson: '10000000-0000-4000-8000-000000000005',
  section: '10000000-0000-4000-8000-000000000006',
  assessment: '10000000-0000-4000-8000-000000000007',
  attempt: '10000000-0000-4000-8000-000000000008',
  attemptQuestion: '10000000-0000-4000-8000-000000000009',
  price: '10000000-0000-4000-8000-000000000010',
  product: '10000000-0000-4000-8000-000000000011',
  order: '10000000-0000-4000-8000-000000000012',
  grant: '10000000-0000-4000-8000-000000000013',
  answer: '10000000-0000-4000-8000-000000000014',
  event: '10000000-0000-4000-8000-000000000015',
  operation: '10000000-0000-4000-8000-000000000016',
} as const;
export const fixtureTimestamp = '2026-10-26T08:00:00.000Z';
export const fixtureDocument = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: 'Practice building dependable software.' }],
    },
  ],
};
const ids = fixtureIds;
const meta = { nextCursor: null, hasMore: false, limit: 20 };
export const catalogFixture = catalogCoursesResponseSchema.parse({
  data: [
    {
      id: ids.course,
      workspaceId: ids.workspace,
      slug: 'reliable-software',
      title: 'Reliable software',
      summary: 'An independent instructor course.',
      description: fixtureDocument,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      deliveryMode: 'SELF_PACED',
      language: 'en',
      level: 'Intermediate',
      isFree: true,
      estimatedMinutes: 120,
      publishedAt: fixtureTimestamp,
      coverUrl: null,
    },
  ],
  meta,
});
export const catalogDetailFixture = catalogCourseResponseSchema.parse({
  data: {
    ...catalogFixture.data[0],
    prices: [
      {
        priceId: ids.price,
        productId: ids.product,
        currency: 'usd',
        amount: 0,
        interval: null,
        intervalCount: 1,
        trialDays: 0,
      },
    ],
    outline: [
      {
        sectionId: ids.section,
        title: 'Getting started',
        position: 0,
        lessons: [
          {
            lessonId: ids.lesson,
            title: 'Introduction',
            type: 'TEXT',
            position: 0,
            isPreview: true,
            estimatedMinutes: 5,
          },
        ],
      },
    ],
  },
});
export const enrollmentFixture = enrollmentResponseSchema.parse({
  data: {
    id: ids.enrollment,
    workspaceId: ids.workspace,
    userId: ids.user,
    courseId: ids.course,
    cohortId: null,
    status: 'ACTIVE',
    enrolledAt: fixtureTimestamp,
    startedAt: fixtureTimestamp,
    completedAt: null,
    lastActivityAt: fixtureTimestamp,
    completionPercent: '25.00',
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
    access: { allowed: true, expiresAt: null },
    grants: [
      {
        id: ids.grant,
        source: 'FREE',
        startsAt: fixtureTimestamp,
        expiresAt: null,
        revokedAt: null,
      },
    ],
  },
});
export const lockedOutlineFixture = learnerOutlineResponseSchema.parse({
  data: {
    enrollmentId: ids.enrollment,
    sections: [
      {
        sectionId: ids.section,
        title: 'Getting started',
        position: 0,
        lessons: [
          {
            lessonId: ids.lesson,
            title: 'Scheduled lesson',
            type: 'TEXT',
            position: 0,
            isRequired: true,
            completedAt: null,
            access: {
              allowed: false,
              reason: 'NOT_RELEASED',
              unlockAt: '2026-10-27T08:00:00.000Z',
            },
          },
        ],
      },
    ],
  },
});
const question = {
  attemptQuestionId: ids.attemptQuestion,
  type: 'SINGLE_CHOICE',
  prompt: fixtureDocument,
  options: [
    { key: 'a', position: 0, content: fixtureDocument },
    { key: 'b', position: 1, content: fixtureDocument },
  ],
  points: '10.000',
  isRequired: true,
  position: 0,
};
export const timedAssessmentFixture = attemptStartResponseSchema.parse({
  data: {
    attemptId: ids.attempt,
    version: 1,
    status: 'IN_PROGRESS',
    startedAt: fixtureTimestamp,
    deadlineAt: '2026-10-26T08:30:00.000Z',
    questions: [question],
  },
});
export const manualAssessmentFixture = learnerAttemptResponseSchema.parse({
  data: {
    attemptId: ids.attempt,
    version: 2,
    status: 'GRADING',
    startedAt: fixtureTimestamp,
    deadlineAt: null,
    submittedAt: '2026-10-26T08:20:00.000Z',
    questions: [{ ...question, type: 'ESSAY', options: [] }],
    answers: [
      {
        attemptQuestionId: ids.attemptQuestion,
        version: 1,
        response: { type: 'ESSAY', document: fixtureDocument },
        attachmentIds: [],
        savedAt: '2026-10-26T08:19:00.000Z',
      },
    ],
  },
});
export const gradingFixture = gradingInputSchema.parse({
  version: 2,
  final: true,
  reason: 'Rubric review complete',
  answers: [
    {
      answerId: ids.answer,
      awardedPoints: '8.500',
      rubricScores: [{ criterionId: 'clarity', points: '8.500' }],
      feedback: 'Explain the retry boundary more clearly.',
    },
  ],
});
export const releasedResultFixture = releasedResultResponseSchema.parse({
  data: {
    attemptId: ids.attempt,
    assessmentId: ids.assessment,
    number: 1,
    status: 'GRADED',
    totalPoints: '10.000',
    awardedPoints: '8.500',
    percent: '85.00',
    passed: true,
    gradedAt: '2026-10-26T09:00:00.000Z',
    answers: [
      {
        attemptQuestionId: ids.attemptQuestion,
        awardedPoints: '8.500',
        isCorrect: null,
        feedback: 'Explain the retry boundary more clearly.',
      },
    ],
  },
});
export const checkoutQuoteFixture = checkoutQuoteResponseSchema.parse({
  data: {
    currency: 'usd',
    subtotal: 2500,
    discountTotal: 500,
    taxTotal: 0,
    grandTotal: 2000,
    items: [
      {
        priceId: ids.price,
        productId: ids.product,
        name: 'Reliable software',
        quantity: 1,
        unitAmount: 2500,
        discountAmount: 500,
        taxAmount: 0,
        totalAmount: 2000,
      },
    ],
  },
});
export const checkoutFixture = checkoutSessionResponseSchema.parse({
  data: {
    orderId: ids.order,
    checkoutUrl: 'https://checkout.stripe.test/fictional-session',
    expiresAt: '2026-10-26T08:30:00.000Z',
  },
});
export const freeCheckoutFixture = checkoutSessionResponseSchema.parse({
  data: { orderId: ids.order, checkoutUrl: null, expiresAt: null },
});
export const validationErrorFixture = apiErrorSchema.parse({
  error: {
    code: 'VALIDATION_FAILED',
    message: 'The request is invalid.',
    details: [{ path: 'items.0.priceId', code: 'invalid_uuid', message: 'Expected a UUID' }],
    requestId: ids.event,
  },
});
export const accessErrorFixture = apiErrorSchema.parse({
  error: {
    code: 'ACCESS_EXPIRED',
    message: 'Learning access has expired.',
    details: { reason: 'Grant expired', unlockAt: null },
    requestId: ids.event,
  },
});
export const courseDashboardFixture = courseAnalyticsResponseSchema.parse({
  data: {
    courseId: ids.course,
    enrollments: '40',
    activeLearners: '32',
    completions: '10',
    completionRate: '25.00',
    learningSeconds: '9007199254740993',
    daily: [
      {
        courseId: ids.course,
        day: '2026-10-26',
        newEnrollments: 3,
        activeLearners: 12,
        completions: 2,
        learningSeconds: '12000',
        assessmentSubmissions: 4,
      },
    ],
  },
});
export const studentDashboardFixture = studentAnalyticsResponseSchema.parse({
  data: {
    enrolledCourses: 1,
    completedCourses: 0,
    learningSeconds: '3600',
    currentStreakDays: 3,
    courses: [{ courseId: ids.course, enrollmentId: ids.enrollment, completionPercent: '25.00' }],
    activity: [{ day: '2026-10-26', learningSeconds: '1200' }],
  },
});
export const revenueDashboardFixture = revenueResponseSchema.parse({
  data: [
    { currency: 'usd', paid: 50000, refunded: 5000, net: 45000 },
    { currency: 'egp', paid: 200000, refunded: 0, net: 200000 },
  ],
});
export const exportFixture = exportOperationResponseSchema.parse({
  data: { operationId: ids.operation, status: 'PENDING', expiresAt: '2026-10-27T08:00:00.000Z' },
});
export const businessEventFixture = domainEventSchema.parse({
  id: ids.event,
  workspaceId: ids.workspace,
  type: 'order.paid.v1',
  schemaVersion: 1,
  aggregateType: 'Order',
  aggregateId: ids.order,
  sequence: '9007199254740993',
  timestamp: fixtureTimestamp,
  payload: { orderId: ids.order },
});
export const securityEventFixture = domainEventSchema.parse({
  id: ids.event,
  workspaceId: null,
  type: 'identity.password-changed.v1',
  schemaVersion: 1,
  aggregateType: 'User',
  aggregateId: ids.user,
  sequence: '1',
  timestamp: fixtureTimestamp,
  payload: { userId: ids.user },
});
export const notificationFixture = notificationResponseSchema.parse({
  data: {
    id: ids.event,
    workspaceId: ids.workspace,
    type: 'order.paid',
    title: 'Payment received',
    body: 'Your receipt is ready.',
    data: { orderId: ids.order, path: '/student/orders' },
    readAt: null,
    createdAt: fixtureTimestamp,
    updatedAt: fixtureTimestamp,
  },
});
export const certificateVerificationFixture = certificateVerificationResponseSchema.parse({
  data: {
    status: 'VALID',
    courseTitle: 'Reliable software',
    issuerName: 'Independent training',
    issuedAt: fixtureTimestamp,
    maskedRecipientName: 'A*** L***',
  },
});
/** Fixtures pair with schemas so HTTP adapters/tests can validate without any server imports. */
export const httpFixtures = {
  catalog: {
    method: 'GET',
    path: '/catalog/courses',
    status: 200,
    body: catalogFixture,
    schema: catalogCoursesResponseSchema,
  },
  catalogDetail: {
    method: 'GET',
    path: `/catalog/courses/${ids.course}`,
    status: 200,
    body: catalogDetailFixture,
    schema: catalogCourseResponseSchema,
  },
  enrollment: {
    method: 'GET',
    path: `/me/enrollments/${ids.enrollment}`,
    status: 200,
    body: enrollmentFixture,
    schema: enrollmentResponseSchema,
  },
  timedAssessment: {
    method: 'POST',
    path: `/me/enrollments/${ids.enrollment}/assessments/${ids.assessment}/attempts`,
    status: 201,
    body: timedAssessmentFixture,
    schema: attemptStartResponseSchema,
  },
  manualAssessment: {
    method: 'GET',
    path: `/me/attempts/${ids.attempt}`,
    status: 200,
    body: manualAssessmentFixture,
    schema: learnerAttemptResponseSchema,
  },
  checkout: {
    method: 'POST',
    path: `/workspaces/${ids.workspace}/checkout/sessions`,
    status: 201,
    body: checkoutFixture,
    schema: checkoutSessionResponseSchema,
  },
  validation: {
    method: 'POST',
    path: `/workspaces/${ids.workspace}/checkout/sessions`,
    status: 400,
    body: validationErrorFixture,
    schema: apiErrorSchema,
  },
} satisfies Record<
  string,
  { method: string; path: string; status: number; body: unknown; schema: z.ZodType }
>;
