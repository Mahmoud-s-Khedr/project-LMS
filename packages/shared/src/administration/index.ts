import { z } from 'zod';
import { workspaceStatusSchema, outboxStatusSchema, webhookStatusSchema } from '../enums';
import { eventTypeSchema } from '../events';
import { publicWorkspaceSchema } from '../tenancy';
import {
  pageQuerySchema,
  paginatedResponseSchema,
  cursorQuerySchema,
  cursorResponseSchema,
} from '../pagination';
import {
  uuidSchema,
  timestampSchema,
  digitStringSchema,
  reasonSchema,
  searchSchema,
  dateRangeShape,
  validDateRange,
  responseSchema,
} from '../primitives';
export const adminWorkspacesQuerySchema = pageQuerySchema.extend({
  search: searchSchema.optional(),
  status: workspaceStatusSchema.optional(),
});
export const adminWorkspaceUpdateSchema = z
  .strictObject({
    status: workspaceStatusSchema,
    suspendedAt: timestampSchema.nullable(),
    reason: reasonSchema,
  })
  .refine(
    (v) => (v.status === 'SUSPENDED') === (v.suspendedAt !== null),
    'Suspension timestamp must agree with status',
  );
export const adminWorkspaceSchema = publicWorkspaceSchema.extend({
  status: workspaceStatusSchema,
  suspendedAt: timestampSchema.nullable(),
  ownerId: uuidSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export const auditLogsQuerySchema = cursorQuerySchema
  .extend({
    actorId: uuidSchema.optional(),
    resourceType: z.string().min(1).max(100).optional(),
    resourceId: z.string().min(1).max(128).optional(),
    action: z.string().min(1).max(120).optional(),
    ...dateRangeShape,
  })
  .refine(validDateRange, 'Invalid date range');
// No arbitrary value bags: the audit owner redacts and projects only safe field names and attribution.
export const auditLogSchema = z.strictObject({
  id: uuidSchema,
  workspaceId: uuidSchema.nullable(),
  actorId: uuidSchema.nullable(),
  action: z.string().min(1).max(120),
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().min(1).max(128),
  requestId: z.string().min(1).max(100),
  changes: z.strictObject({
    fields: z.array(z.string().min(1).max(100)).max(100),
    reason: reasonSchema.optional(),
  }),
  createdAt: timestampSchema,
});
export const operationsEventsQuerySchema = cursorQuerySchema.extend({
  status: outboxStatusSchema.optional(),
  type: eventTypeSchema.optional(),
});
export const operationEventSchema = z.strictObject({
  id: uuidSchema,
  workspaceId: uuidSchema.nullable(),
  type: eventTypeSchema,
  schemaVersion: z.literal(1),
  aggregateType: z.string().max(100),
  aggregateId: z.string().max(128),
  sequence: digitStringSchema,
  status: outboxStatusSchema,
  attempts: z.number().int().nonnegative(),
  availableAt: timestampSchema,
  createdAt: timestampSchema,
  publishedAt: timestampSchema.nullable(),
  errorCode: z.string().max(100).nullable(),
});
export const replayInputSchema = z.strictObject({ reason: reasonSchema });
export const replayAcceptedResponseSchema = responseSchema(
  z.strictObject({ operationId: uuidSchema, status: z.literal('PENDING') }),
);
export const webhooksQuerySchema = pageQuerySchema
  .extend({ status: webhookStatusSchema.optional(), ...dateRangeShape })
  .refine(validDateRange, 'Invalid date range');
export const webhookSchema = z.strictObject({
  id: uuidSchema,
  workspaceId: uuidSchema.nullable(),
  type: z.string().max(160),
  status: webhookStatusSchema,
  attempts: z.number().int().nonnegative(),
  receivedAt: timestampSchema,
  processedAt: timestampSchema.nullable(),
  errorCode: z.string().max(100).nullable(),
});
export const healthLiveResponseSchema = responseSchema(z.strictObject({ status: z.literal('ok') }));
export const healthResponseSchema = responseSchema(
  z.strictObject({
    status: z.enum(['ok', 'unavailable']),
    database: z.enum(['ok', 'unavailable']),
    redis: z.enum(['ok', 'unavailable']),
  }),
);
export const adminWorkspaceResponseSchema = responseSchema(adminWorkspaceSchema);
export const adminWorkspacesResponseSchema = paginatedResponseSchema(adminWorkspaceSchema);
export const auditLogsResponseSchema = cursorResponseSchema(auditLogSchema);
export const operationsEventsResponseSchema = cursorResponseSchema(operationEventSchema);
export const webhooksResponseSchema = paginatedResponseSchema(webhookSchema);
export type AdminWorkspacesQuery = z.infer<typeof adminWorkspacesQuerySchema>;
export type AdminWorkspaceUpdate = z.infer<typeof adminWorkspaceUpdateSchema>;
export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type OperationsEventsQuery = z.infer<typeof operationsEventsQuerySchema>;
export type OperationEvent = z.infer<typeof operationEventSchema>;
export type WebhooksQuery = z.infer<typeof webhooksQuerySchema>;
export type Webhook = z.infer<typeof webhookSchema>;
