import { useQuery } from '@tanstack/react-query';
import type { EnrollmentsQueryParams } from './types';
import {
  fetchMyEnrollments,
  fetchEnrollment,
  fetchEnrollmentOutline,
  fetchEnrollmentResults,
  fetchStudentAnalytics,
} from './api';

export const STUDENT_QUERY_KEYS = {
  all: ['student'] as const,
  enrollments: (query?: EnrollmentsQueryParams) => ['student', 'enrollments', query] as const,
  enrollment: (id: string) => ['student', 'enrollment', id] as const,
  outline: (id: string) => ['student', 'outline', id] as const,
  results: (id: string) => ['student', 'results', id] as const,
  analytics: ['student', 'analytics'] as const,
};

export function useMyEnrollmentsQuery(query?: EnrollmentsQueryParams) {
  return useQuery({
    queryKey: STUDENT_QUERY_KEYS.enrollments(query),
    queryFn: () => fetchMyEnrollments(query),
  });
}

export function useEnrollmentQuery(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: STUDENT_QUERY_KEYS.enrollment(enrollmentId),
    queryFn: () => fetchEnrollment(enrollmentId),
    enabled: (options?.enabled ?? true) && Boolean(enrollmentId),
  });
}

export function useEnrollmentOutlineQuery(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: STUDENT_QUERY_KEYS.outline(enrollmentId),
    queryFn: () => fetchEnrollmentOutline(enrollmentId),
    enabled: (options?.enabled ?? true) && Boolean(enrollmentId),
  });
}

export function useEnrollmentResultsQuery(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: STUDENT_QUERY_KEYS.results(enrollmentId),
    queryFn: () => fetchEnrollmentResults(enrollmentId),
    enabled: (options?.enabled ?? true) && Boolean(enrollmentId),
  });
}

export function useStudentAnalyticsQuery() {
  return useQuery({
    queryKey: STUDENT_QUERY_KEYS.analytics,
    queryFn: fetchStudentAnalytics,
  });
}
