'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  fetchCourseAnalyticsOverview,
  fetchCourseAssessmentAnalytics,
  fetchCourseLearnerAnalytics,
  fetchExportOperation,
  fetchRevenueAnalytics,
  triggerExport,
} from './api';

export const REPORTING_QUERY_KEYS = {
  all: ['reporting'] as const,
  overview: (workspaceId: string, courseId: string, params?: AnalyticsQuery) =>
    ['reporting', 'overview', workspaceId, courseId, params] as const,
  learners: (workspaceId: string, courseId: string, params?: LearnerAnalyticsQuery) =>
    ['reporting', 'learners', workspaceId, courseId, params] as const,
  assessments: (workspaceId: string, courseId: string, params?: AnalyticsQuery) =>
    ['reporting', 'assessments', workspaceId, courseId, params] as const,
  revenue: (workspaceId: string, params?: RevenueQuery) =>
    ['reporting', 'revenue', workspaceId, params] as const,
  exportOp: (workspaceId: string, operationId: string) =>
    ['reporting', 'export-op', workspaceId, operationId] as const,
};

export function useCourseAnalyticsOverviewQuery(
  workspaceId: string,
  courseId: string,
  params?: AnalyticsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<CourseAnalyticsOverview>({
    queryKey: REPORTING_QUERY_KEYS.overview(workspaceId, courseId, params),
    queryFn: () => fetchCourseAnalyticsOverview(workspaceId, courseId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && courseId),
    staleTime: 30_000,
  });
}

export function useCourseLearnerAnalyticsQuery(
  workspaceId: string,
  courseId: string,
  params?: LearnerAnalyticsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<LearnerAnalytics>>({
    queryKey: REPORTING_QUERY_KEYS.learners(workspaceId, courseId, params),
    queryFn: () => fetchCourseLearnerAnalytics(workspaceId, courseId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && courseId),
    staleTime: 30_000,
  });
}

export function useCourseAssessmentAnalyticsQuery(
  workspaceId: string,
  courseId: string,
  params?: AnalyticsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<AssessmentAnalytics[]>({
    queryKey: REPORTING_QUERY_KEYS.assessments(workspaceId, courseId, params),
    queryFn: () => fetchCourseAssessmentAnalytics(workspaceId, courseId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && courseId),
    staleTime: 30_000,
  });
}

export function useRevenueAnalyticsQuery(
  workspaceId: string,
  params?: RevenueQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<RevenueMetric[]>({
    queryKey: REPORTING_QUERY_KEYS.revenue(workspaceId, params),
    queryFn: () => fetchRevenueAnalytics(workspaceId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useTriggerExportMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, input }: { workspaceId: string; input: ExportRequest }) =>
      triggerExport(workspaceId, input),
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: REPORTING_QUERY_KEYS.exportOp(variables.workspaceId, data.operationId),
      });
    },
  });
}

export function useExportOperationQuery(
  workspaceId: string,
  operationId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<ExportOperation>({
    queryKey: REPORTING_QUERY_KEYS.exportOp(workspaceId, operationId),
    queryFn: () => fetchExportOperation(workspaceId, operationId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && operationId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'PENDING' || status === 'PROCESSING') {
        return 1500;
      }
      return false;
    },
    staleTime: 1000,
  });
}
