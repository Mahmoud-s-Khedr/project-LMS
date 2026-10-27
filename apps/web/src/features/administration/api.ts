import type {
  AdminUsersQuery,
  AdminUserUpdate,
  AdminWorkspace,
  AdminWorkspacesQuery,
  AdminWorkspaceUpdate,
  AuditLog,
  AuditLogsQuery,
  CursorResponse,
  MemberUpdate,
  MembersQuery,
  OperationEvent,
  OperationsEventsQuery,
  SafeUser,
  WebhooksQuery,
  WorkspaceInvitation,
  WorkspaceInvitationCreate,
  WorkspaceMember,
} from '@lms/shared';
import { api } from '@/lib/api';
import type { AdminUsersResult, AdminWorkspacesResult, WebhooksResult } from './types';

function unwrapEnvelope<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) {
      return inner as T;
    }
  }
  return payload as T;
}

// Platform Users (SUPER_ADMIN)
export async function fetchAdminUsers(params?: AdminUsersQuery): Promise<AdminUsersResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.platformRole) query.set('platformRole', params.platformRole);

  const qs = query.toString();
  return api.get<AdminUsersResult>(qs ? `/admin/users?${qs}` : '/admin/users');
}

export async function updateAdminUser(
  userId: string,
  input: AdminUserUpdate,
  updatedAt: string,
): Promise<SafeUser> {
  const response = await api.patch<{ data: SafeUser } | SafeUser>(
    `/admin/users/${encodeURIComponent(userId)}`,
    input,
    { headers: { 'If-Match': `"${new Date(updatedAt).toISOString()}"` } },
  );
  return unwrapEnvelope<SafeUser>(response);
}

// Platform Workspaces (SUPER_ADMIN)
export async function fetchAdminWorkspaces(
  params?: AdminWorkspacesQuery,
): Promise<AdminWorkspacesResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);

  const qs = query.toString();
  return api.get<AdminWorkspacesResult>(qs ? `/admin/workspaces?${qs}` : '/admin/workspaces');
}

export async function updateAdminWorkspace(
  workspaceId: string,
  input: AdminWorkspaceUpdate,
  updatedAt: string,
): Promise<AdminWorkspace> {
  const response = await api.patch<{ data: AdminWorkspace } | AdminWorkspace>(
    `/admin/workspaces/${encodeURIComponent(workspaceId)}`,
    input,
    { headers: { 'If-Match': `"${workspaceId}:${new Date(updatedAt).getTime()}"` } },
  );
  return unwrapEnvelope<AdminWorkspace>(response);
}

// Workspace Team & Members (Admin)
export async function fetchWorkspaceMembers(
  workspaceId: string,
  params?: Partial<MembersQuery>,
): Promise<CursorResponse<WorkspaceMember>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.role) query.set('role', params.role);
  if (params?.status) query.set('status', params.status);
  if (params?.search) query.set('search', params.search);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/members${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<WorkspaceMember>>(path);
}

export async function updateWorkspaceMember(
  workspaceId: string,
  memberId: string,
  input: MemberUpdate,
): Promise<WorkspaceMember> {
  const response = await api.patch<{ data: WorkspaceMember } | WorkspaceMember>(
    `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
    input,
  );
  return unwrapEnvelope<WorkspaceMember>(response);
}

export async function removeWorkspaceMember(workspaceId: string, memberId: string): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
  );
}

// Invitations (Admin)
export async function fetchWorkspaceInvitations(
  workspaceId: string,
  params?: {
    cursor?: string;
    limit?: number;
    status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  },
): Promise<CursorResponse<WorkspaceInvitation>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/invitations${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<WorkspaceInvitation>>(path);
}

export async function createWorkspaceInvitation(
  workspaceId: string,
  input: WorkspaceInvitationCreate,
): Promise<WorkspaceInvitation> {
  const response = await api.post<{ data: WorkspaceInvitation } | WorkspaceInvitation>(
    `/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
    input,
  );
  return unwrapEnvelope<WorkspaceInvitation>(response);
}

export async function revokeWorkspaceInvitation(
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
  );
}

// Audit Logs (Admin)
export async function fetchAuditLogs(
  workspaceId: string,
  params?: Partial<AuditLogsQuery>,
): Promise<CursorResponse<AuditLog>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.actorId) query.set('actorId', params.actorId);
  if (params?.resourceType) query.set('resourceType', params.resourceType);
  if (params?.resourceId) query.set('resourceId', params.resourceId);
  if (params?.action) query.set('action', params.action);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/audit-logs${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<AuditLog>>(path);
}

// Operations / Outbox Failures (Admin)
export async function fetchOperationsEvents(
  workspaceId: string,
  params?: Partial<OperationsEventsQuery>,
): Promise<CursorResponse<OperationEvent>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);
  if (params?.type) query.set('type', params.type);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/operations/events${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<OperationEvent>>(path);
}

export async function replayOperationEvent(
  workspaceId: string,
  eventId: string,
  input: { reason: string },
): Promise<{ operationId: string; status: 'PENDING' }> {
  const response = await api.post<
    | { data: { operationId: string; status: 'PENDING' } }
    | { operationId: string; status: 'PENDING' }
  >(
    `/workspaces/${encodeURIComponent(workspaceId)}/operations/events/${encodeURIComponent(eventId)}/replay`,
    input,
  );
  return unwrapEnvelope<{ operationId: string; status: 'PENDING' }>(response);
}

// Stripe Webhooks Inbox (SUPER_ADMIN)
export async function fetchWebhooks(params?: WebhooksQuery): Promise<WebhooksResult> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.status) query.set('status', params.status);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  return api.get<WebhooksResult>(qs ? `/admin/webhooks${qs ? `?${qs}` : ''}` : '/admin/webhooks');
}

export async function replayWebhook(
  webhookId: string,
  input: { reason: string } = { reason: 'Admin manual retry' },
): Promise<{ operationId: string; status: 'PENDING' }> {
  const response = await api.post<
    | { data: { operationId: string; status: 'PENDING' } }
    | { operationId: string; status: 'PENDING' }
  >(`/admin/webhooks/${encodeURIComponent(webhookId)}/replay`, input);
  return unwrapEnvelope<{ operationId: string; status: 'PENDING' }>(response);
}
