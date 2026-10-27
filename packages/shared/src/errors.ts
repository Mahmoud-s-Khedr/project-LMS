import { z } from 'zod';
import { timestampSchema } from './primitives';
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  ACCESS_EXPIRED: 'ACCESS_EXPIRED',
  ENROLLMENT_REQUIRED: 'ENROLLMENT_REQUIRED',
  CONTENT_LOCKED: 'CONTENT_LOCKED',
  PREREQUISITE_UNMET: 'PREREQUISITE_UNMET',
  COHORT_FULL: 'COHORT_FULL',
  ATTEMPT_LIMIT_REACHED: 'ATTEMPT_LIMIT_REACHED',
  ATTEMPT_CLOSED: 'ATTEMPT_CLOSED',
  GRADE_NOT_RELEASED: 'GRADE_NOT_RELEASED',
  ASSET_NOT_READY: 'ASSET_NOT_READY',
  COUPON_EXHAUSTED: 'COUPON_EXHAUSTED',
  REFUND_LIMIT_EXCEEDED: 'REFUND_LIMIT_EXCEEDED',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  REFRESH_REUSED: 'REFRESH_REUSED',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  OPERATION_IN_PROGRESS: 'OPERATION_IN_PROGRESS',
  PRECONDITION_REQUIRED: 'PRECONDITION_REQUIRED',
  CAPABILITY_EXPIRED: 'CAPABILITY_EXPIRED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SEMANTIC_RULE_FAILED: 'SEMANTIC_RULE_FAILED',
} as const;
export const errorCodeSchema = z.enum(ErrorCode);
export const validationDetailSchema = z.strictObject({
  path: z.string().max(500),
  code: z.string().max(100),
  message: z.string().max(1000),
});
export const lockDetailSchema = z.strictObject({
  reason: z.string().max(1000),
  unlockAt: timestampSchema.nullable().optional(),
});
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema.or(
      z
        .string()
        .min(1)
        .max(100)
        .regex(/^[A-Z][A-Z0-9_]*$/),
    ),
    message: z.string().min(1).max(2000),
    details: z.union([z.array(validationDetailSchema).max(100), lockDetailSchema]).optional(),
    requestId: z.string().min(1).max(100),
    timestamp: timestampSchema.optional(),
    path: z.string().max(1000).optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof apiErrorSchema>;
export type ApiErrorDetail = ApiErrorEnvelope['error'];
export type ValidationDetail = z.infer<typeof validationDetailSchema>;
