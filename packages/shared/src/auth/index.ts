import { z } from 'zod';
import { emailSchema, userSchema } from '../users';

export const passwordSchema = z.string().min(12).max(128);
export const registerSchema = z.strictObject({
  email: emailSchema,
  name: z.string().trim().min(1).max(160),
  password: passwordSchema,
  onboardingMode: z.enum(['STUDENT', 'INSTRUCTOR']).default('STUDENT'),
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export const emailRequestSchema = z.strictObject({ email: emailSchema });
export const tokenRequestSchema = z.strictObject({ token: z.string().regex(/^[a-f0-9]{64}$/) });
export const resetPasswordSchema = tokenRequestSchema.extend({ password: passwordSchema });
export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  password: passwordSchema,
});
export const authResponseSchema = z.strictObject({
  data: z.strictObject({ accessToken: z.string(), expiresIn: z.literal(600), user: userSchema }),
});
export const acceptedResponseSchema = z.strictObject({
  data: z.strictObject({ message: z.string() }),
});
export const csrfResponseSchema = z.strictObject({
  data: z.strictObject({ csrfToken: z.string() }),
});
export const sessionSchema = z.strictObject({
  familyId: z.uuid(),
  current: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  userAgent: z.string().nullable(),
});
export const sessionsResponseSchema = z.strictObject({ data: z.array(sessionSchema) });
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
