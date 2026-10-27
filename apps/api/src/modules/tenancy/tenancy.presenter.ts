import {
  workspaceSchema,
  workspaceMemberSchema,
  workspaceInvitationSchema,
  courseStaffSchema,
} from '@lms/shared';
import type { Workspace, WorkspaceMember, WorkspaceInvitation, CourseStaff } from '@prisma/client';

export const presentWorkspace = (row: Workspace) =>
  workspaceSchema.parse({
    id: row.id,
    workspaceId: row.id,
    kind: row.kind,
    slug: row.slug,
    name: row.name,
    description: row.description,
    logoUrl: row.logoUrl,
    defaultCurrency: row.defaultCurrency,
    timezone: row.timezone,
    settings: row.settings,
    status: row.status,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export const presentMember = (row: WorkspaceMember) =>
  workspaceMemberSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export const presentInvitation = (row: WorkspaceInvitation) =>
  workspaceInvitationSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    invitedById: row.invitedById,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
export const presentStaff = (row: CourseStaff, memberId: string) =>
  courseStaffSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    courseId: row.courseId,
    userId: row.userId,
    memberId,
    role: row.role,
    canEditContent: row.canEditContent,
    canGrade: row.canGrade,
    canManageLearners: row.canManageLearners,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
