'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUsersQuery,
  AdminUserUpdate,
  AdminWorkspacesQuery,
  AdminWorkspaceUpdate,
  AuditLog,
  AuditLogsQuery,
  CursorResponse,
  MemberUpdate,
  MembersQuery,
  OperationEvent,
  OperationsEventsQuery,
  WebhooksQuery,
  WorkspaceInvitation,
  WorkspaceInvitationCreate,
  WorkspaceMember,
} from '@lms/shared';
import {
  createWorkspaceInvitation,
  fetchAdminUsers,
  fetchAdminWorkspaces,
  fetchAuditLogs,
  fetchOperationsEvents,
  fetchWebhooks,
  fetchWorkspaceInvitations,
  fetchWorkspaceMembers,
  removeWorkspaceMember,
  replayOperationEvent,
  replayWebhook,
  revokeWorkspaceInvitation,
  updateAdminUser,
  updateAdminWorkspace,
  updateWorkspaceMember,
} from './api';
import type { AdminUsersResult, AdminWorkspacesResult, WebhooksResult } from './types';

export const ADMIN_QUERY_KEYS = {
  all: ['admin'] as const,
  users: (params?: AdminUsersQuery) => ['admin', 'users', params] as const,
  workspaces: (params?: AdminWorkspacesQuery) => ['admin', 'workspaces', params] as const,
  members: (workspaceId: string, params?: MembersQuery) =>
    ['admin', 'members', workspaceId, params] as const,
  invitations: (workspaceId: string, params?: Record<string, unknown>) =>
    ['admin', 'invitations', workspaceId, params] as const,
  auditLogs: (workspaceId: string, params?: AuditLogsQuery) =>
    ['admin', 'audit-logs', workspaceId, params] as const,
  operationsEvents: (workspaceId: string, params?: OperationsEventsQuery) =>
    ['admin', 'operations-events', workspaceId, params] as const,
  webhooks: (params?: WebhooksQuery) => ['admin', 'webhooks', params] as const,
};

export function useAdminUsersQuery(params?: AdminUsersQuery, options?: { enabled?: boolean }) {
  return useQuery<AdminUsersResult>({
    queryKey: ADMIN_QUERY_KEYS.users(params),
    queryFn: () => fetchAdminUsers(params),
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useUpdateAdminUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input, updatedAt }: { userId: string; input: AdminUserUpdate; updatedAt: string }) =>
      updateAdminUser(userId, input, updatedAt),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useAdminWorkspacesQuery(
  params?: AdminWorkspacesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<AdminWorkspacesResult>({
    queryKey: ADMIN_QUERY_KEYS.workspaces(params),
    queryFn: () => fetchAdminWorkspaces(params),
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useUpdateAdminWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
      updatedAt,
    }: {
      workspaceId: string;
      input: AdminWorkspaceUpdate;
      updatedAt: string;
    }) => updateAdminWorkspace(workspaceId, input, updatedAt),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

export function useWorkspaceMembersQuery(
  workspaceId: string,
  params?: Partial<MembersQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<WorkspaceMember>>({
    queryKey: ADMIN_QUERY_KEYS.members(workspaceId, params as MembersQuery),
    queryFn: () => fetchWorkspaceMembers(workspaceId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useUpdateWorkspaceMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      memberId,
      input,
    }: {
      workspaceId: string;
      memberId: string;
      input: MemberUpdate;
    }) => updateWorkspaceMember(workspaceId, memberId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'members', variables.workspaceId],
      });
    },
  });
}

export function useRemoveWorkspaceMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      memberId,
    }: {
      workspaceId: string;
      memberId: string;
    }) => removeWorkspaceMember(workspaceId, memberId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'members', variables.workspaceId],
      });
    },
  });
}

export function useWorkspaceInvitationsQuery(
  workspaceId: string,
  params?: { cursor?: string; limit?: number; status?: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED' },
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<WorkspaceInvitation>>({
    queryKey: ADMIN_QUERY_KEYS.invitations(workspaceId, params),
    queryFn: () => fetchWorkspaceInvitations(workspaceId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useCreateWorkspaceInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      input,
    }: {
      workspaceId: string;
      input: WorkspaceInvitationCreate;
    }) => createWorkspaceInvitation(workspaceId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'invitations', variables.workspaceId],
      });
    },
  });
}

export function useRevokeWorkspaceInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      invitationId,
    }: {
      workspaceId: string;
      invitationId: string;
    }) => revokeWorkspaceInvitation(workspaceId, invitationId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'invitations', variables.workspaceId],
      });
    },
  });
}

export function useAuditLogsQuery(
  workspaceId: string,
  params?: Partial<AuditLogsQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<AuditLog>>({
    queryKey: ADMIN_QUERY_KEYS.auditLogs(workspaceId, params as AuditLogsQuery),
    queryFn: () => fetchAuditLogs(workspaceId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 10_000,
  });
}

export function useOperationsEventsQuery(
  workspaceId: string,
  params?: Partial<OperationsEventsQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<OperationEvent>>({
    queryKey: ADMIN_QUERY_KEYS.operationsEvents(workspaceId, params as OperationsEventsQuery),
    queryFn: () => fetchOperationsEvents(workspaceId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 10_000,
  });
}

export function useReplayOperationEventMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      eventId,
      input,
    }: {
      workspaceId: string;
      eventId: string;
      input: { reason: string };
    }) => replayOperationEvent(workspaceId, eventId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'operations-events', variables.workspaceId],
      });
    },
  });
}

export function useWebhooksQuery(params?: WebhooksQuery, options?: { enabled?: boolean }) {
  return useQuery<WebhooksResult>({
    queryKey: ADMIN_QUERY_KEYS.webhooks(params),
    queryFn: () => fetchWebhooks(params),
    enabled: options?.enabled ?? true,
    staleTime: 15_000,
  });
}

export function useReplayWebhookMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      webhookId,
      input,
    }: {
      webhookId: string;
      input?: { reason: string };
    }) => replayWebhook(webhookId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'webhooks'] });
    },
  });
}
