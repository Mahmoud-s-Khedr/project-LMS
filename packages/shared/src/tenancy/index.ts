import { z } from 'zod';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import { workspaceKindSchema, workspaceStatusSchema, membershipStatusSchema } from '../enums';
import { emailSchema } from '../users';
import {
  entityShape,
  nameSchema,
  slugSchema,
  timezoneSchema,
  currencySchema,
  reasonSchema,
  timestampSchema,
  uuidSchema,
  searchSchema,
  nonemptyPatch,
  responseSchema,
  httpsUrlSchema,
} from '../primitives';
export const workspaceRoleSchema = z.enum(['ADMIN', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT']);
export const workspaceSettingsSchema = z.strictObject({});
export const workspaceCreateSchema = z.strictObject({
  kind: workspaceKindSchema,
  slug: slugSchema.max(100),
  name: nameSchema,
  description: z.string().max(10000).nullable().optional(),
  logoUrl: httpsUrlSchema.nullable().optional(),
  defaultCurrency: currencySchema.default('usd'),
  timezone: timezoneSchema.default('UTC'),
  settings: workspaceSettingsSchema.optional(),
});
export const workspaceUpdateSchema = nonemptyPatch(
  workspaceCreateSchema.omit({ kind: true, slug: true }).shape,
);
export const workspaceSchema = z.strictObject({
  ...entityShape,
  ...workspaceCreateSchema.shape,
  description: z.string().max(10000).nullable(),
  logoUrl: httpsUrlSchema.nullable(),
  settings: workspaceSettingsSchema,
  status: workspaceStatusSchema,
  ownerId: uuidSchema,
});
export const publicWorkspaceSchema = workspaceSchema.pick({
  id: true,
  kind: true,
  slug: true,
  name: true,
  description: true,
  logoUrl: true,
  timezone: true,
});
export const workspaceMemberSchema = z.strictObject({
  ...entityShape,
  userId: uuidSchema,
  role: workspaceRoleSchema,
  status: membershipStatusSchema,
  joinedAt: timestampSchema,
});
export const memberUpdateSchema = nonemptyPatch({
  role: workspaceRoleSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export const membersQuerySchema = cursorQuerySchema.extend({
  role: workspaceRoleSchema.optional(),
  status: membershipStatusSchema.optional(),
  search: searchSchema.optional(),
});
export const transferOwnershipSchema = z.strictObject({
  userId: uuidSchema,
  reason: reasonSchema,
  password: z.string().min(1).max(128),
});
export const workspaceInvitationCreateSchema = z.strictObject({
  email: emailSchema,
  role: workspaceRoleSchema,
});
export const workspaceInvitationSchema = z.strictObject({
  ...entityShape,
  email: emailSchema,
  role: workspaceRoleSchema,
  invitedById: uuidSchema,
  expiresAt: timestampSchema,
  acceptedAt: timestampSchema.nullable(),
  revokedAt: timestampSchema.nullable(),
});
export const invitationsQuerySchema = cursorQuerySchema.extend({
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
});
export const invitationAcceptSchema = z.strictObject({ token: z.string().min(32).max(4096) });
export const workspaceResponseSchema = responseSchema(workspaceSchema);
export const publicWorkspaceResponseSchema = responseSchema(publicWorkspaceSchema);
export const workspacesResponseSchema = cursorResponseSchema(workspaceSchema);
export const workspaceMemberResponseSchema = responseSchema(workspaceMemberSchema);
export const membersResponseSchema = cursorResponseSchema(workspaceMemberSchema);
export const workspaceInvitationResponseSchema = responseSchema(workspaceInvitationSchema);
export const invitationsResponseSchema = cursorResponseSchema(workspaceInvitationSchema);
export type Workspace = z.infer<typeof workspaceSchema>;
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;
export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
export type MembersQuery = z.infer<typeof membersQuerySchema>;
export type WorkspaceInvitation = z.infer<typeof workspaceInvitationSchema>;
export type WorkspaceInvitationCreate = z.infer<typeof workspaceInvitationCreateSchema>;
export type InvitationsQuery = z.infer<typeof invitationsQuerySchema>;
export type TransferOwnership = z.infer<typeof transferOwnershipSchema>;
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;

export const workspacePermissionSchema = z.enum([
  'workspace.manage',
  'members.manage',
  'courses.create',
  'courses.edit',
  'courses.grade',
  'learners.manage',
  'commerce.manage',
  'analytics.read',
]);
export const myWorkspaceSchema = workspaceSchema.extend({
  membership: workspaceMemberSchema,
  permissions: z.array(workspacePermissionSchema),
});
export const myWorkspacesResponseSchema = cursorResponseSchema(myWorkspaceSchema);
export type MyWorkspace = z.infer<typeof myWorkspaceSchema>;
