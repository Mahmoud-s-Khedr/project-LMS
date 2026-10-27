import { z } from 'zod';
import { uuidSchema, timestampSchema, digitStringSchema } from '../primitives';
/** Encrypted mail-only capability; never send to in-app notifications or generic clients. */
export const mailCapabilitySchema = z.strictObject({
  keyId: z.string().min(1).max(100),
  ciphertext: z.string().min(1).max(16384),
  expiresAt: timestampSchema,
});
const userPayloadSchema = z.strictObject({ userId: uuidSchema });
export const globalScopeEventTypes = [
  'identity.registered.v1',
  'identity.email-verification.requested.v1',
  'identity.password-reset.requested.v1',
  'identity.email-verified.v1',
  'identity.password-changed.v1',
  'identity.refresh-reused.v1',
  'identity.sessions-revoked.v1',
] as const;
export const eventPayloadSchemas = {
  'content.live-session.changed.v1': z.strictObject({ courseId: uuidSchema, sessionId: uuidSchema }),
  'identity.registered.v1': userPayloadSchema.extend({
    mailCapability: mailCapabilitySchema.optional(),
  }),
  'identity.email-verification.requested.v1': userPayloadSchema.extend({
    mailCapability: mailCapabilitySchema.optional(),
  }),
  'identity.password-reset.requested.v1': userPayloadSchema.extend({
    mailCapability: mailCapabilitySchema.optional(),
  }),
  'identity.email-verified.v1': userPayloadSchema,
  'identity.password-changed.v1': userPayloadSchema,
  'identity.refresh-reused.v1': userPayloadSchema.extend({ familyId: uuidSchema }),
  'identity.sessions-revoked.v1': userPayloadSchema.extend({ familyId: uuidSchema.optional() }),
  'workspace.invitation.created.v1': z.strictObject({
    invitationId: uuidSchema,
    mailCapability: mailCapabilitySchema.optional(),
  }),
  'course.published.v1': z.strictObject({ courseId: uuidSchema }),
  'order.paid.v1': z.strictObject({ orderId: uuidSchema }),
  'refund.succeeded.v1': z.strictObject({ refundId: uuidSchema }),
  'subscription.entitlements.changed.v1': z.strictObject({ subscriptionId: uuidSchema }),
  'enrollment.granted.v1': z.strictObject({ enrollmentId: uuidSchema, grantId: uuidSchema }),
  'lesson.completed.v1': z.strictObject({ enrollmentId: uuidSchema, lessonId: uuidSchema }),
  'assessment.submitted.v1': z.strictObject({ attemptId: uuidSchema }),
  'assessment.graded.v1': z.strictObject({ attemptId: uuidSchema }),
  'assessment.result.changed.v1': z.strictObject({
    assessmentId: uuidSchema,
    enrollmentId: uuidSchema,
  }),
  'course.completed.v1': z.strictObject({ enrollmentId: uuidSchema }),
  'certificate.issued.v1': z.strictObject({ certificateId: uuidSchema }),
  'analytics.export.requested.v1': z.strictObject({ operationId: uuidSchema }),
} as const;
export type EventType = keyof typeof eventPayloadSchemas;
export type EventPayload<T extends EventType> = z.infer<(typeof eventPayloadSchemas)[T]>;
const eventTypes = Object.keys(eventPayloadSchemas) as [EventType, ...EventType[]];
export const eventTypeSchema = z.enum(eventTypes);
export const isGlobalScopeEventType = (
  type: string,
): type is (typeof globalScopeEventTypes)[number] =>
  (globalScopeEventTypes as readonly string[]).includes(type);
const eventShape = {
  id: uuidSchema,
  schemaVersion: z.literal(1),
  aggregateType: z.string().min(1).max(100),
  aggregateId: uuidSchema,
  sequence: digitStringSchema,
  timestamp: timestampSchema,
};
// A mapped union preserves the correlation between type, payload and nullable scope in TypeScript.
export type DomainEvent = {
  [T in EventType]: z.infer<typeof eventHeaderSchema> & {
    type: T;
    workspaceId: T extends (typeof globalScopeEventTypes)[number] ? null : string;
    payload: EventPayload<T>;
  };
}[EventType];
export const eventHeaderSchema = z.strictObject(eventShape);
const variants = eventTypes.map((type) =>
  z.strictObject({
    ...eventShape,
    type: z.literal(type),
    workspaceId: isGlobalScopeEventType(type) ? z.null() : uuidSchema,
    payload: eventPayloadSchemas[type],
  }),
);
export const domainEventSchema = z.discriminatedUnion(
  'type',
  variants as [(typeof variants)[number], ...(typeof variants)[number][]],
) as unknown as z.ZodType<DomainEvent>;
