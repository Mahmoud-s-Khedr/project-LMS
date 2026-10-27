import { api } from '@/lib/api';
import type { CursorMeta } from '@lms/shared';
import type {
  Enrollment,
  LearnerOutline,
  ReleasedResult,
  StudentAnalytics,
  EnrollmentsQueryParams,
} from './types';

export interface PaginatedEnrollmentsResponse {
  data: Enrollment[];
  meta?: CursorMeta;
}

export async function fetchMyEnrollments(
  query?: EnrollmentsQueryParams,
): Promise<PaginatedEnrollmentsResponse> {
  const searchParams = new URLSearchParams();
  if (query?.status) searchParams.set('status', query.status);
  if (query?.courseId) searchParams.set('courseId', query.courseId);
  if (query?.cohortId) searchParams.set('cohortId', query.cohortId);
  if (query?.workspaceId) searchParams.set('workspaceId', query.workspaceId);
  if (query?.cursor) searchParams.set('cursor', query.cursor);
  if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));

  const qs = searchParams.toString();
  const path = qs ? `/me/enrollments?${qs}` : '/me/enrollments';
  return api.get<PaginatedEnrollmentsResponse>(path);
}

export async function fetchEnrollment(enrollmentId: string): Promise<Enrollment> {
  const response = await api.get<{ data: Enrollment }>(`/me/enrollments/${enrollmentId}`);
  return response.data;
}

export async function fetchEnrollmentOutline(enrollmentId: string): Promise<LearnerOutline> {
  const response = await api.get<{ data: LearnerOutline }>(`/me/enrollments/${enrollmentId}/outline`);
  return response.data;
}

export async function fetchEnrollmentResults(enrollmentId: string): Promise<ReleasedResult[]> {
  const response = await api.get<{ data: ReleasedResult[] }>(`/me/enrollments/${enrollmentId}/results`);
  return response.data;
}

export async function fetchStudentAnalytics(): Promise<StudentAnalytics> {
  const response = await api.get<{ data: StudentAnalytics }>('/me/analytics/progress');
  return response.data;
}
