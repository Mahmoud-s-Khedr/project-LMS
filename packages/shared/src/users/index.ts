import { z } from 'zod';

export const platformRoleSchema = z.enum(['STUDENT', 'SUPER_ADMIN']);
export const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'ANONYMIZED']);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const profileUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(160).optional(),
    locale: z
      .string()
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)
      .max(20)
      .optional(),
    timezone: z
      .string()
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Invalid IANA timezone')
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one profile field');
export const userSchema = z.strictObject({
  id: z.uuid(),
  email: emailSchema,
  name: z.string(),
  platformRole: platformRoleSchema,
  status: userStatusSchema,
  emailVerifiedAt: z.iso.datetime().nullable(),
  locale: z.string(),
  timezone: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  avatarUrl: z.url().nullable(),
});
export const membershipSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  role: z.enum(['ADMIN', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT']),
  workspace: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    kind: z.enum(['PERSONAL', 'ACADEMY']),
  }),
});
export const meSchema = userSchema.extend({ memberships: z.array(membershipSchema) });
export const meResponseSchema = z.strictObject({ data: meSchema });
export const userResponseSchema = z.strictObject({ data: userSchema });
export const adminUsersQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: userStatusSchema.optional(),
  platformRole: platformRoleSchema.optional(),
});
export const adminUserCreateSchema = z.strictObject({
  email: emailSchema,
  name: z.string().trim().min(1).max(160),
});
export const adminUserUpdateSchema = z
  .strictObject({
    platformRole: platformRoleSchema.optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine(
    (value) =>
      value.platformRole !== undefined || value.status !== undefined || value.name !== undefined,
    'Provide a change',
  );
export const adminUsersResponseSchema = z.strictObject({
  data: z.array(userSchema),
  meta: z.strictObject({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});
export const avatarUploadSchema = z.strictObject({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export const avatarUploadResponseSchema = z.strictObject({
  data: z.strictObject({
    url: z.url(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    expiresAt: z.iso.datetime(),
    uploadToken: z.string(),
  }),
});
export const instructorInvitationSchema = z.strictObject({
  email: emailSchema,
  role: z.literal('INSTRUCTOR').default('INSTRUCTOR'),
});
export const invitationResponseSchema = z.strictObject({
  data: z.strictObject({
    id: z.uuid(),
    email: emailSchema,
    role: z.literal('INSTRUCTOR'),
    expiresAt: z.iso.datetime(),
  }),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminUserCreate = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;
export type AvatarUpload = z.infer<typeof avatarUploadSchema>;
export type InstructorInvitation = z.infer<typeof instructorInvitationSchema>;
export type SafeUser = z.infer<typeof userSchema>;
export type Me = z.infer<typeof meSchema>;

export const avatarCompleteSchema = z.strictObject({ uploadToken: z.string().max(4096) });
export const adminUserDeleteSchema = z.strictObject({ reason: z.string().trim().min(3).max(1000) });
