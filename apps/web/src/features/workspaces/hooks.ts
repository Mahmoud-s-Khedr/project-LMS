'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CursorQuery,
  CursorResponse,
  MyWorkspace,
  Workspace,
  WorkspaceCreate,
} from '@lms/shared';
import { AUTH_QUERY_KEYS } from '@/features/auth/hooks';
import { createWorkspace, fetchMyWorkspaces, fetchWorkspace } from './api';

export const WORKSPACE_QUERY_KEYS = {
  all: ['workspaces'] as const,
  mine: () => ['workspaces', 'me'] as const,
  detail: (id: string) => ['workspaces', 'detail', id] as const,
};

export function useMyWorkspacesQuery(params?: CursorQuery, options?: { enabled?: boolean }) {
  return useQuery<CursorResponse<MyWorkspace>>({
    queryKey: [...WORKSPACE_QUERY_KEYS.mine(), params],
    queryFn: () => fetchMyWorkspaces(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useWorkspaceQuery(workspaceId: string, options?: { enabled?: boolean }) {
  return useQuery<Workspace>({
    queryKey: WORKSPACE_QUERY_KEYS.detail(workspaceId),
    queryFn: () => fetchWorkspace(workspaceId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useCreateWorkspaceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceCreate) => createWorkspace(input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_QUERY_KEYS.all });
      void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEYS.me });
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('lms_active_workspace_id', created.id);
        } catch {
          // ignore storage errors
        }
      }
    },
  });
}

export function useActiveWorkspace() {
  const { data: workspacesResponse, isLoading, error } = useMyWorkspacesQuery();
  const workspaces = React.useMemo(
    () => workspacesResponse?.data ?? [],
    [workspacesResponse?.data],
  );

  const [activeWorkspaceId, setActiveWorkspaceIdState] = React.useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem('lms_active_workspace_id');
      } catch {
        return null;
      }
    }
    return null;
  });

  const activeWorkspace = React.useMemo(() => {
    if (!workspaces || workspaces.length === 0) return null;
    if (activeWorkspaceId) {
      const found = workspaces.find((w) => w.id === activeWorkspaceId);
      if (found) return found;
    }
    return workspaces[0] ?? null;
  }, [workspaces, activeWorkspaceId]);

  const setActiveWorkspaceId = React.useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('lms_active_workspace_id', id);
      } catch {
        // ignore
      }
    }
  }, []);

  return {
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id ?? activeWorkspaceId,
    setActiveWorkspaceId,
    workspaces,
    isLoading,
    error,
  };
}
