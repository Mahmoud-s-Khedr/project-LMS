import type {
  CursorResponse,
  Enrollment,
  EnrollmentUpdate,
  ManualEnrollment,
  ManualGrant,
  RosterQuery,
  StaffGrant,
} from '@lms/shared';
import { ApiError, api } from '@/lib/api';
import type { StaffEnrollmentDetail } from './types';

export const etagOf = (updatedAt: Date | string): string => `"${new Date(updatedAt).getTime()}"`;

export interface UpdateEnrollmentOptions {
  ifMatch?: string;
  updatedAt?: Date | string;
}

function unwrapEnvelope<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) {
      return inner as T;
    }
  }
  return payload as T;
}

export async function fetchCourseEnrollments(
  workspaceId: string,
  courseId: string,
  params?: Partial<RosterQuery>,
): Promise<CursorResponse<Enrollment>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);
  if (params?.cohortId) query.set('cohortId', params.cohortId);
  if (params?.userId) query.set('userId', params.userId);
  if (params?.source) query.set('source', params.source);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<Enrollment>>(path);
}

export async function fetchStaffEnrollment(
  workspaceId: string,
  courseId: string,
  enrollmentId: string,
): Promise<StaffEnrollmentDetail> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}`;
  const response = await api.get<{ data: StaffEnrollmentDetail } | StaffEnrollmentDetail>(path);
  return unwrapEnvelope<StaffEnrollmentDetail>(response);
}

export async function createManualEnrollment(
  workspaceId: string,
  courseId: string,
  input: ManualEnrollment,
): Promise<Enrollment> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments/manual`;
  const response = await api.post<{ data: Enrollment } | Enrollment>(path, input);
  return unwrapEnvelope<Enrollment>(response);
}

export async function updateEnrollment(
  workspaceId: string,
  courseId: string,
  enrollmentId: string,
  input: EnrollmentUpdate,
  options?: UpdateEnrollmentOptions,
): Promise<Enrollment> {
  let ifMatch = options?.ifMatch;
  if (!ifMatch && options?.updatedAt) {
    ifMatch = etagOf(options.updatedAt);
  }
  if (!ifMatch) {
    const latest = await fetchStaffEnrollment(workspaceId, courseId, enrollmentId);
    ifMatch = etagOf(latest.updatedAt);
  } else if (!ifMatch.startsWith('"')) {
    ifMatch = `"${ifMatch}"`;
  }

  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}`;
  try {
    const response = await api.patch<{ data: Enrollment } | Enrollment>(path, input, {
      headers: { 'If-Match': ifMatch },
    });
    return unwrapEnvelope<Enrollment>(response);
  } catch (err: unknown) {
    if (
      (err instanceof ApiError && err.status === 409) ||
      (typeof err === 'object' && err !== null && (err as { status?: number }).status === 409)
    ) {
      await fetchStaffEnrollment(workspaceId, courseId, enrollmentId);
    }
    throw err;
  }
}

export async function addManualGrant(
  workspaceId: string,
  courseId: string,
  enrollmentId: string,
  input: ManualGrant,
): Promise<StaffGrant> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}/grants`;
  const response = await api.post<{ data: StaffGrant } | StaffGrant>(path, input);
  return unwrapEnvelope<StaffGrant>(response);
}

export async function revokeGrant(
  workspaceId: string,
  courseId: string,
  enrollmentId: string,
  grantId: string,
  input: { reason: string },
): Promise<void> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/enrollments/${encodeURIComponent(enrollmentId)}/grants/${encodeURIComponent(grantId)}/revoke`;
  await api.post(path, input);
}
