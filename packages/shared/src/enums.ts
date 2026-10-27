import { z } from 'zod';
export { Role, roleSchema } from './roles';
export { platformRoleSchema, userStatusSchema } from './users';
export const WorkspaceStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export const workspaceStatusSchema = z.enum(WorkspaceStatus);
export type WorkspaceStatus = z.infer<typeof workspaceStatusSchema>;
export const ExportStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export const exportStatusSchema = z.enum(ExportStatus);
export type ExportStatus = z.infer<typeof exportStatusSchema>;
export const WorkspaceKind = { PERSONAL: 'PERSONAL', ACADEMY: 'ACADEMY' } as const;
export const workspaceKindSchema = z.enum(WorkspaceKind);
export type WorkspaceKind = z.infer<typeof workspaceKindSchema>;
export const MembershipStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED', LEFT: 'LEFT' } as const;
export const membershipStatusSchema = z.enum(MembershipStatus);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;
export const TokenPurpose = {
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  RESET_PASSWORD: 'RESET_PASSWORD',
} as const;
export const tokenPurposeSchema = z.enum(TokenPurpose);
export type TokenPurpose = z.infer<typeof tokenPurposeSchema>;
export const CourseStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export const courseStatusSchema = z.enum(CourseStatus);
export type CourseStatus = z.infer<typeof courseStatusSchema>;
export const Visibility = { PUBLIC: 'PUBLIC', UNLISTED: 'UNLISTED', PRIVATE: 'PRIVATE' } as const;
export const visibilitySchema = z.enum(Visibility);
export type Visibility = z.infer<typeof visibilitySchema>;
export const DeliveryMode = { SELF_PACED: 'SELF_PACED', COHORT: 'COHORT' } as const;
export const deliveryModeSchema = z.enum(DeliveryMode);
export type DeliveryMode = z.infer<typeof deliveryModeSchema>;
export const StaffRole = {
  INSTRUCTOR: 'INSTRUCTOR',
  TEACHING_ASSISTANT: 'TEACHING_ASSISTANT',
} as const;
export const staffRoleSchema = z.enum(StaffRole);
export type StaffRole = z.infer<typeof staffRoleSchema>;
export const LessonType = {
  VIDEO: 'VIDEO',
  DOCUMENT: 'DOCUMENT',
  TEXT: 'TEXT',
  INTERACTIVE: 'INTERACTIVE',
  QUIZ: 'QUIZ',
  ASSIGNMENT: 'ASSIGNMENT',
  EXAM: 'EXAM',
  LIVE_SESSION: 'LIVE_SESSION',
} as const;
export const lessonTypeSchema = z.enum(LessonType);
export type LessonType = z.infer<typeof lessonTypeSchema>;
export const ReleaseType = {
  IMMEDIATE: 'IMMEDIATE',
  ABSOLUTE: 'ABSOLUTE',
  ENROLLMENT_OFFSET: 'ENROLLMENT_OFFSET',
  COHORT_OFFSET: 'COHORT_OFFSET',
} as const;
export const releaseTypeSchema = z.enum(ReleaseType);
export type ReleaseType = z.infer<typeof releaseTypeSchema>;
export const CompletionRule = {
  VIEW: 'VIEW',
  ACKNOWLEDGE: 'ACKNOWLEDGE',
  WATCH_PERCENT: 'WATCH_PERCENT',
  ASSESSMENT_PASS: 'ASSESSMENT_PASS',
  ATTENDANCE: 'ATTENDANCE',
} as const;
export const completionRuleSchema = z.enum(CompletionRule);
export type CompletionRule = z.infer<typeof completionRuleSchema>;
export const AssetStatus = {
  PENDING_UPLOAD: 'PENDING_UPLOAD',
  SCANNING: 'SCANNING',
  READY: 'READY',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
} as const;
export const assetStatusSchema = z.enum(AssetStatus);
export type AssetStatus = z.infer<typeof assetStatusSchema>;
export const AssetVisibility = { PRIVATE: 'PRIVATE', PUBLIC: 'PUBLIC' } as const;
export const assetVisibilitySchema = z.enum(AssetVisibility);
export type AssetVisibility = z.infer<typeof assetVisibilitySchema>;
export const AssessmentKind = { QUIZ: 'QUIZ', ASSIGNMENT: 'ASSIGNMENT', EXAM: 'EXAM' } as const;
export const assessmentKindSchema = z.enum(AssessmentKind);
export type AssessmentKind = z.infer<typeof assessmentKindSchema>;
export const QuestionType = {
  SINGLE_CHOICE: 'SINGLE_CHOICE',
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  SHORT_ANSWER: 'SHORT_ANSWER',
  NUMERIC: 'NUMERIC',
  ESSAY: 'ESSAY',
  FILE_UPLOAD: 'FILE_UPLOAD',
  MATCHING: 'MATCHING',
  ORDERING: 'ORDERING',
} as const;
export const questionTypeSchema = z.enum(QuestionType);
export type QuestionType = z.infer<typeof questionTypeSchema>;
export const AssessmentStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  RETIRED: 'RETIRED',
} as const;
export const assessmentStatusSchema = z.enum(AssessmentStatus);
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;
export const GradePolicy = { HIGHEST: 'HIGHEST', LATEST: 'LATEST', FIRST: 'FIRST' } as const;
export const gradePolicySchema = z.enum(GradePolicy);
export type GradePolicy = z.infer<typeof gradePolicySchema>;
export const FeedbackPolicy = {
  IMMEDIATE: 'IMMEDIATE',
  AFTER_DUE: 'AFTER_DUE',
  AFTER_GRADING: 'AFTER_GRADING',
  NEVER: 'NEVER',
} as const;
export const feedbackPolicySchema = z.enum(FeedbackPolicy);
export type FeedbackPolicy = z.infer<typeof feedbackPolicySchema>;
export const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  GRADING: 'GRADING',
  GRADED: 'GRADED',
  VOID: 'VOID',
} as const;
export const attemptStatusSchema = z.enum(AttemptStatus);
export type AttemptStatus = z.infer<typeof attemptStatusSchema>;
export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REVOKED: 'REVOKED',
} as const;
export const enrollmentStatusSchema = z.enum(EnrollmentStatus);
export type EnrollmentStatus = z.infer<typeof enrollmentStatusSchema>;
export const GrantSource = {
  FREE: 'FREE',
  MANUAL: 'MANUAL',
  ORDER_ITEM: 'ORDER_ITEM',
  SUBSCRIPTION: 'SUBSCRIPTION',
} as const;
export const grantSourceSchema = z.enum(GrantSource);
export type GrantSource = z.infer<typeof grantSourceSchema>;
export const ProductType = {
  COURSE: 'COURSE',
  BUNDLE: 'BUNDLE',
  SUBSCRIPTION_PLAN: 'SUBSCRIPTION_PLAN',
} as const;
export const productTypeSchema = z.enum(ProductType);
export type ProductType = z.infer<typeof productTypeSchema>;
export const ProductStatus = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' } as const;
export const productStatusSchema = z.enum(ProductStatus);
export type ProductStatus = z.infer<typeof productStatusSchema>;
export const BillingInterval = { MONTH: 'MONTH', YEAR: 'YEAR' } as const;
export const billingIntervalSchema = z.enum(BillingInterval);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export const CouponKind = { PERCENT: 'PERCENT', FIXED: 'FIXED' } as const;
export const couponKindSchema = z.enum(CouponKind);
export type CouponKind = z.infer<typeof couponKindSchema>;
export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;
export const orderStatusSchema = z.enum(OrderStatus);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;
export const paymentStatusSchema = z.enum(PaymentStatus);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export const SubscriptionStatus = {
  INCOMPLETE: 'INCOMPLETE',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  UNPAID: 'UNPAID',
  PAUSED: 'PAUSED',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
} as const;
export const subscriptionStatusSchema = z.enum(SubscriptionStatus);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export const RefundStatus = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;
export const refundStatusSchema = z.enum(RefundStatus);
export type RefundStatus = z.infer<typeof refundStatusSchema>;
export const WebhookStatus = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
} as const;
export const webhookStatusSchema = z.enum(WebhookStatus);
export type WebhookStatus = z.infer<typeof webhookStatusSchema>;
export const NotificationChannel = { IN_APP: 'IN_APP', EMAIL: 'EMAIL' } as const;
export const notificationChannelSchema = z.enum(NotificationChannel);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export const DeliveryStatus = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;
export const deliveryStatusSchema = z.enum(DeliveryStatus);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;
export const OutboxStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  DEAD: 'DEAD',
} as const;
export const outboxStatusSchema = z.enum(OutboxStatus);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;
export const CertificateStatus = { VALID: 'VALID', REVOKED: 'REVOKED' } as const;
export const certificateStatusSchema = z.enum(CertificateStatus);
export type CertificateStatus = z.infer<typeof certificateStatusSchema>;
export const LiveSessionStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
} as const;
export const liveSessionStatusSchema = z.enum(LiveSessionStatus);
export type LiveSessionStatus = z.infer<typeof liveSessionStatusSchema>;
export const AttendanceStatus = {
  REGISTERED: 'REGISTERED',
  ATTENDED: 'ATTENDED',
  ABSENT: 'ABSENT',
} as const;
export const attendanceStatusSchema = z.enum(AttendanceStatus);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export const IdempotencyStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export const idempotencyStatusSchema = z.enum(IdempotencyStatus);
export type IdempotencyStatus = z.infer<typeof idempotencyStatusSchema>;

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ANONYMIZED: 'ANONYMIZED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];
