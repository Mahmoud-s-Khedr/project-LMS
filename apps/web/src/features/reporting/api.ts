import type {
  AnalyticsQuery,
  AssessmentAnalytics,
  CourseAnalyticsOverview,
  CursorResponse,
  ExportOperation,
  ExportRequest,
  LearnerAnalytics,
  LearnerAnalyticsQuery,
  RevenueMetric,
  RevenueQuery,
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

export async function fetchCourseAnalyticsOverview(
  workspaceId: string,
  courseId: string,
  params?: AnalyticsQuery,
): Promise<CourseAnalyticsOverview> {
  const query = new URLSearchParams();
  if (params?.cohortId) query.set('cohortId', params.cohortId);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/analytics/overview${qs ? `?${qs}` : ''}`;
  const response = await api.get<{ data: CourseAnalyticsOverview } | CourseAnalyticsOverview>(path);
  return unwrapEnvelope<CourseAnalyticsOverview>(response);
}

export async function fetchCourseLearnerAnalytics(
  workspaceId: string,
  courseId: string,
  params?: LearnerAnalyticsQuery,
): Promise<CursorResponse<LearnerAnalytics>> {
  const query = new URLSearchParams();
  if (params?.cursor) query.set('cursor', params.cursor);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cohortId) query.set('cohortId', params.cohortId);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/analytics/learners${qs ? `?${qs}` : ''}`;
  return api.get<CursorResponse<LearnerAnalytics>>(path);
}

export async function fetchCourseAssessmentAnalytics(
  workspaceId: string,
  courseId: string,
  params?: AnalyticsQuery,
): Promise<AssessmentAnalytics[]> {
  const query = new URLSearchParams();
  if (params?.cohortId) query.set('cohortId', params.cohortId);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/analytics/assessments${qs ? `?${qs}` : ''}`;
  const response = await api.get<{ data: AssessmentAnalytics[] } | AssessmentAnalytics[]>(path);
  return unwrapEnvelope<AssessmentAnalytics[]>(response);
}

export async function fetchRevenueAnalytics(
  workspaceId: string,
  params?: RevenueQuery,
): Promise<RevenueMetric[]> {
  const query = new URLSearchParams();
  if (params?.productId) query.set('productId', params.productId);
  if (params?.currency) query.set('currency', params.currency);
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);

  const qs = query.toString();
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/analytics/revenue${qs ? `?${qs}` : ''}`;
  const response = await api.get<{ data: RevenueMetric[] } | RevenueMetric[]>(path);
  return unwrapEnvelope<RevenueMetric[]>(response);
}

export async function triggerExport(
  workspaceId: string,
  input: ExportRequest,
): Promise<{ operationId: string; status: 'PENDING' }> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/analytics/exports`;
  const response = await api.post<
    | { data: { operationId: string; status: 'PENDING' } }
    | { operationId: string; status: 'PENDING' }
  >(path, input);
  return unwrapEnvelope<{ operationId: string; status: 'PENDING' }>(response);
}

export async function fetchExportOperation(
  workspaceId: string,
  operationId: string,
): Promise<ExportOperation> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/analytics/exports/${encodeURIComponent(operationId)}`;
  const response = await api.get<{ data: ExportOperation } | ExportOperation>(path);
  return unwrapEnvelope<ExportOperation>(response);
}
