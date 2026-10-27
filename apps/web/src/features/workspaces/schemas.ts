import {
  z,
  workspaceCreateSchema,
  workspaceUpdateSchema,
  workspaceSchema,
  myWorkspaceSchema,
  myWorkspacesResponseSchema,
  workspaceResponseSchema,
  workspaceRoleSchema,
  workspaceKindSchema,
  workspacePermissionSchema,
  type WorkspaceCreate,
  type WorkspaceUpdate,
  type Workspace,
  type MyWorkspace,
  type WorkspaceMember,
} from '@lms/shared';

export {
  workspaceCreateSchema,
  workspaceUpdateSchema,
  workspaceSchema,
  myWorkspaceSchema,
  myWorkspacesResponseSchema,
  workspaceResponseSchema,
  workspaceRoleSchema,
  workspaceKindSchema,
  workspacePermissionSchema,
  type WorkspaceCreate,
  type WorkspaceUpdate,
  type Workspace,
  type MyWorkspace,
  type WorkspaceMember,
};

export const workspaceFormSchema = z.object({
  kind: z.enum(['PERSONAL', 'ACADEMY']),
  name: z
    .string()
    .trim()
    .min(1, 'Workspace name is required')
    .max(100, 'Workspace name must be at most 100 characters'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be at most 100 characters')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Slug must consist of lowercase letters, numbers, and hyphens',
    ),
  description: z.string().max(10000, 'Description must be at most 10,000 characters').optional(),
  defaultCurrency: z.string().trim().toLowerCase().min(3).max(3),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid IANA timezone'),
  logoUrl: z
    .string()
    .trim()
    .url('Must be a valid URL')
    .startsWith('https://', 'Logo URL must use HTTPS')
    .or(z.literal(''))
    .optional(),
});

export type WorkspaceFormValues = z.infer<typeof workspaceFormSchema>;
