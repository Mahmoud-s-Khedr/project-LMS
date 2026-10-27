'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CursorResponse,
  Enrollment,
  EnrollmentUpdate,
  ManualEnrollment,
  ManualGrant,
  RosterQuery,
} from '@lms/shared';
import {
  addManualGrant,
  createManualEnrollment,
  fetchCourseEnrollments,
  fetchStaffEnrollment,
  revokeGrant,
  updateEnrollment,
} from './api';
import type { StaffEnrollmentDetail } from './types';

export const ROSTER_QUERY_KEYS = {
  all: ['roster'] as const,
  courseEnrollments: (workspaceId: string, courseId: string, params?: RosterQuery) =>
    ['roster', 'enrollments', workspaceId, courseId, params] as const,
  enrollmentDetail: (workspaceId: string, courseId: string, enrollmentId: string) =>
    ['roster', 'enrollment-detail', workspaceId, courseId, enrollmentId] as const,
};

export function useCourseEnrollmentsQuery(
  workspaceId: string,
  courseId: string,
  params?: Partial<RosterQuery>,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Enrollment>>({
    queryKey: ROSTER_QUERY_KEYS.courseEnrollments(workspaceId, courseId, params as RosterQuery),
    queryFn: () => fetchCourseEnrollments(workspaceId, courseId, params),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && courseId),
    staleTime: 15_000,
  });
}

export function useStaffEnrollmentQuery(
  workspaceId: string,
  courseId: string,
  enrollmentId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<StaffEnrollmentDetail>({
    queryKey: ROSTER_QUERY_KEYS.enrollmentDetail(workspaceId, courseId, enrollmentId),
    queryFn: () => fetchStaffEnrollment(workspaceId, courseId, enrollmentId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId && courseId && enrollmentId),
    staleTime: 30_000,
  });
}

export function useCreateManualEnrollmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      courseId,
      input,
    }: {
      workspaceId: string;
      courseId: string;
      input: ManualEnrollment;
    }) => createManualEnrollment(workspaceId, courseId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['roster', 'enrollments', variables.workspaceId, variables.courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['reporting', 'overview', variables.workspaceId, variables.courseId],
      });
    },
  });
}

export function useUpdateEnrollmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      courseId,
      enrollmentId,
      input,
      ifMatch,
      updatedAt,
    }: {
      workspaceId: string;
      courseId: string;
      enrollmentId: string;
      input: EnrollmentUpdate;
      ifMatch?: string;
      updatedAt?: Date | string;
    }) =>
      updateEnrollment(workspaceId, courseId, enrollmentId, input, {
        ifMatch,
        updatedAt,
      }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['roster', 'enrollments', variables.workspaceId, variables.courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: [
          'roster',
          'enrollment-detail',
          variables.workspaceId,
          variables.courseId,
          variables.enrollmentId,
        ],
      });
    },
  });
}

export function useAddManualGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      courseId,
      enrollmentId,
      input,
    }: {
      workspaceId: string;
      courseId: string;
      enrollmentId: string;
      input: ManualGrant;
    }) => addManualGrant(workspaceId, courseId, enrollmentId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'roster',
          'enrollment-detail',
          variables.workspaceId,
          variables.courseId,
          variables.enrollmentId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ['roster', 'enrollments', variables.workspaceId, variables.courseId],
      });
    },
  });
}

export function useRevokeGrantMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspaceId,
      courseId,
      enrollmentId,
      grantId,
      input,
    }: {
      workspaceId: string;
      courseId: string;
      enrollmentId: string;
      grantId: string;
      input: { reason: string };
    }) => revokeGrant(workspaceId, courseId, enrollmentId, grantId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: [
          'roster',
          'enrollment-detail',
          variables.workspaceId,
          variables.courseId,
          variables.enrollmentId,
        ],
      });
      void queryClient.invalidateQueries({
        queryKey: ['roster', 'enrollments', variables.workspaceId, variables.courseId],
      });
    },
  });
}
