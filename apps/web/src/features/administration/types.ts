import type {
  SafeUser,
  AdminUsersQuery,
  AdminUserUpdate,
  AdminWorkspace,
  AdminWorkspacesQuery,
  AdminWorkspaceUpdate,
  WorkspaceMember,
  MemberUpdate,
  MembersQuery,
  WorkspaceInvitation,
  WorkspaceInvitationCreate,
  InvitationsQuery,
  AuditLog,
  AuditLogsQuery,
  OperationEvent,
  OperationsEventsQuery,
  Webhook,
  WebhooksQuery,
  PaginatedResponse,
  CursorResponse,
} from '@lms/shared';

export type {
  SafeUser,
  AdminUsersQuery,
  AdminUserUpdate,
  AdminWorkspace,
  AdminWorkspacesQuery,
  AdminWorkspaceUpdate,
  WorkspaceMember,
  MemberUpdate,
  MembersQuery,
  WorkspaceInvitation,
  WorkspaceInvitationCreate,
  InvitationsQuery,
  AuditLog,
  AuditLogsQuery,
  OperationEvent,
  OperationsEventsQuery,
  Webhook,
  WebhooksQuery,
  PaginatedResponse,
  CursorResponse,
};

export interface AdminUsersResult {
  data: SafeUser[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminWorkspacesResult {
  data: AdminWorkspace[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface WebhooksResult {
  data: Webhook[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
