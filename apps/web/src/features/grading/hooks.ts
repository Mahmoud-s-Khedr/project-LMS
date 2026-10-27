'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GradingInput, AttemptsQuery } from '@lms/shared';
import {
  fetchAssessmentAttempts,
  fetchStaffAttemptDetail,
  submitAttemptGrades,
  regradeAttempt,
  voidAttempt,
  requestAttemptAttachmentDownload,
} from './api';

export const GRADING_QUERY_KEYS = {
  all: ['grading'] as const,
  attempts: (workspaceId: string, courseId: string, assessmentId: string, params?: unknown) =>
    ['grading', 'attempts', workspaceId, courseId, assessmentId, params] as const,
  detail: (workspaceId: string, courseId: string, assessmentId: string, attemptId: string) =>
    ['grading', 'detail', workspaceId, courseId, assessmentId, attemptId] as const,
};

export function useAssessmentAttemptsQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  query: Partial<AttemptsQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: GRADING_QUERY_KEYS.attempts(workspaceId, courseId, assessmentId, query),
    queryFn: () => fetchAssessmentAttempts(workspaceId, courseId, assessmentId, query),
    enabled: Boolean(workspaceId && courseId && assessmentId) && (options?.enabled ?? true),
    staleTime: 15_000,
  });
}

export function useStaffAttemptDetailQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: GRADING_QUERY_KEYS.detail(workspaceId, courseId, assessmentId, attemptId),
    queryFn: () => fetchStaffAttemptDetail(workspaceId, courseId, assessmentId, attemptId),
    enabled:
      Boolean(workspaceId && courseId && assessmentId && attemptId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useSubmitGradesMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GradingInput) =>
      submitAttemptGrades(workspaceId, courseId, assessmentId, attemptId, input),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        GRADING_QUERY_KEYS.detail(workspaceId, courseId, assessmentId, attemptId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: ['grading', 'attempts', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useRegradeMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GradingInput) =>
      regradeAttempt(workspaceId, courseId, assessmentId, attemptId, input),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        GRADING_QUERY_KEYS.detail(workspaceId, courseId, assessmentId, attemptId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: ['grading', 'attempts', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useVoidAttemptMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { version: number; reason: string }) =>
      voidAttempt(workspaceId, courseId, assessmentId, attemptId, input),
    onSuccess: (updated) => {
      void queryClient.setQueryData(
        GRADING_QUERY_KEYS.detail(workspaceId, courseId, assessmentId, attemptId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: ['grading', 'attempts', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useDownloadAttachmentMutation(workspaceId: string, attemptId: string) {
  return useMutation({
    mutationFn: (assetId: string) =>
      requestAttemptAttachmentDownload(workspaceId, attemptId, assetId),
  });
}
