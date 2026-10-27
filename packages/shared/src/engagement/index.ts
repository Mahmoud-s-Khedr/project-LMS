import { z } from 'zod';
import { certificateStatusSchema, notificationChannelSchema } from '../enums';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import {
  entityShape,
  uuidSchema,
  nameSchema,
  titleSchema,
  versionSchema,
  timestampSchema,
  reasonSchema,
  applicationPathSchema,
  optionalBooleanQuerySchema,
  responseSchema,
} from '../primitives';
export const certificateLayoutSchema = z.strictObject({
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']),
  title: titleSchema,
  body: z.string().min(1).max(4000),
  accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/),
});
export const certificateTemplateCreateSchema = z.strictObject({
  name: nameSchema,
  issuerName: titleSchema,
  layout: certificateLayoutSchema,
  backgroundAssetId: uuidSchema.nullable(),
  isActive: z.boolean(),
});
export const certificateTemplateUpdateSchema = z.strictObject({ isActive: z.boolean() });
export const certificateTemplateSchema = certificateTemplateCreateSchema.extend({
  ...entityShape,
  courseId: uuidSchema,
  version: versionSchema,
});
export const certificateIssueSchema = z.strictObject({ templateId: uuidSchema });
export const certificateRenderRequestSchema = z.strictObject({});
export const certificateRevokeSchema = z.strictObject({ reason: reasonSchema });
export const verificationCodeSchema = z
  .string()
  .min(32)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
export const certificateSchema = z.strictObject({
  ...entityShape,
  enrollmentId: uuidSchema,
  status: certificateStatusSchema,
  verificationCode: verificationCodeSchema,
  issuedAt: timestampSchema,
  revokedAt: timestampSchema.nullable(),
  courseTitle: titleSchema,
  issuerName: titleSchema,
  recipientName: nameSchema,
  renderStatus: z.enum(['PENDING', 'READY', 'FAILED']),
});
export const certificateVerificationSchema = z.strictObject({
  status: certificateStatusSchema,
  courseTitle: titleSchema,
  issuerName: titleSchema,
  issuedAt: timestampSchema,
  maskedRecipientName: nameSchema,
});
export const certificatesQuerySchema = cursorQuerySchema.extend({
  status: certificateStatusSchema.optional(),
  workspaceId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
});
export const securityNotificationTypeSchema = z.enum([
  'security.email_verification',
  'security.password_reset',
  'security.password_changed',
  'security.refresh_reused',
]);
export const businessNotificationTypeSchema = z.enum([
  'enrollment.granted',
  'course.released',
  'live.reminder',
  'assessment.submitted',
  'assessment.graded',
  'order.paid',
  'order.refunded',
  'subscription.payment_failed',
  'certificate.issued',
  'certificate.revoked',
]);
export const notificationTypeSchema = z.enum([
  ...securityNotificationTypeSchema.options,
  ...businessNotificationTypeSchema.options,
]);
export const mandatoryEmailNotificationTypes = [
  ...securityNotificationTypeSchema.options,
  'order.paid',
  'order.refunded',
  'subscription.payment_failed',
  'certificate.issued',
  'certificate.revoked',
] as const;
const safeNotificationDataSchema = z.strictObject({
  path: applicationPathSchema.optional(),
  courseId: uuidSchema.optional(),
  lessonId: uuidSchema.optional(),
  enrollmentId: uuidSchema.optional(),
  attemptId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
  subscriptionId: uuidSchema.optional(),
  certificateId: uuidSchema.optional(),
});
const notificationShape = {
  id: uuidSchema,
  title: titleSchema,
  body: z.string().max(10000),
  data: safeNotificationDataSchema,
  readAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};
export const notificationSchema = z.union([
  z.strictObject({
    ...notificationShape,
    workspaceId: z.null(),
    type: securityNotificationTypeSchema,
  }),
  z.strictObject({
    ...notificationShape,
    workspaceId: uuidSchema,
    type: businessNotificationTypeSchema,
  }),
]);
export const notificationsQuerySchema = cursorQuerySchema.extend({
  unread: optionalBooleanQuerySchema,
  type: notificationTypeSchema.optional(),
  workspaceId: uuidSchema.optional(),
});
export const notificationUpdateSchema = z.strictObject({ read: z.boolean() });
export const notificationsReadAllSchema = z.strictObject({ through: timestampSchema });
export const notificationPreferenceSchema = z.union([
  z.strictObject({
    workspaceId: z.null(),
    type: securityNotificationTypeSchema,
    channel: notificationChannelSchema,
    enabled: z.boolean(),
  }),
  z.strictObject({
    workspaceId: uuidSchema,
    type: businessNotificationTypeSchema,
    channel: notificationChannelSchema,
    enabled: z.boolean(),
  }),
]);
export const notificationPreferencesUpdateSchema = z.strictObject({
  preferences: z
    .array(notificationPreferenceSchema)
    .max(100)
    .refine(
      (v) => new Set(v.map((x) => `${x.workspaceId}:${x.type}:${x.channel}`)).size === v.length,
      'Duplicate preferences',
    )
    .refine(
      (v) =>
        v.every(
          (x) =>
            x.enabled ||
            x.channel !== 'EMAIL' ||
            !(mandatoryEmailNotificationTypes as readonly string[]).includes(x.type),
        ),
      'Security and transactional email is mandatory',
    ),
});
export const certificateTemplateResponseSchema = responseSchema(certificateTemplateSchema);
export const certificateTemplatesResponseSchema = cursorResponseSchema(certificateTemplateSchema);
export const certificateResponseSchema = responseSchema(certificateSchema);
export const certificatesResponseSchema = cursorResponseSchema(certificateSchema);
export const certificateVerificationResponseSchema = responseSchema(certificateVerificationSchema);
export const certificateIssueResponseSchema = responseSchema(
  z.strictObject({ operationId: uuidSchema, status: z.literal('PENDING') }),
);
export const notificationResponseSchema = responseSchema(notificationSchema);
export const notificationsResponseSchema = cursorResponseSchema(notificationSchema);
export const notificationPreferencesResponseSchema = responseSchema(
  z.array(notificationPreferenceSchema),
);
export type CertificateTemplateCreate = z.infer<typeof certificateTemplateCreateSchema>;
export type CertificateTemplateUpdate = z.infer<typeof certificateTemplateUpdateSchema>;
export type Certificate = z.infer<typeof certificateSchema>;
export type CertificateVerification = z.infer<typeof certificateVerificationSchema>;
export type CertificatesQuery = z.infer<typeof certificatesQuerySchema>;
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;
export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type NotificationPreferencesUpdate = z.infer<typeof notificationPreferencesUpdateSchema>;
