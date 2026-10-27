import type {
  CursorQuery,
  CursorResponse,
  MyWorkspace,
  Workspace,
  WorkspaceCreate,
} from '@lms/shared';
import { api } from '@/lib/api';

function unwrapEnvelope<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) {
      return inner as T;
    }
  }
  return payload as T;
}

export async function fetchMyWorkspaces(
  params?: CursorQuery,
): Promise<CursorResponse<MyWorkspace>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  const queryString = query.toString();
  const path = queryString ? `/me/workspaces?${queryString}` : '/me/workspaces';
  return api.get<CursorResponse<MyWorkspace>>(path);
}

export async function fetchWorkspace(workspaceId: string): Promise<Workspace> {
  const response = await api.get<{ data: Workspace } | Workspace>(
    `/workspaces/${encodeURIComponent(workspaceId)}`,
  );
  return unwrapEnvelope<Workspace>(response);
}

export async function createWorkspace(input: WorkspaceCreate): Promise<Workspace> {
  const response = await api.post<{ data: Workspace } | Workspace>('/workspaces', input);
  return unwrapEnvelope<Workspace>(response);
}
