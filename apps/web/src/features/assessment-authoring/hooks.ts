'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  QuestionBanksQuery,
  QuestionBankCreate,
  QuestionBankUpdate,
  QuestionsQuery,
  QuestionCreate,
  QuestionUpdate,
  AuthorQuestionPayload,
  AssessmentCreate,
  AssessmentVersionConfig,
  AssessmentQuestionsReplace,
  AssessmentPoolsReplace,
  AccommodationUpsert,
  CursorQuery,
} from '@lms/shared';
import {
  fetchQuestionBanks,
  createQuestionBank,
  updateQuestionBank,
  archiveQuestionBank,
  fetchQuestionsInBank,
  fetchQuestionDetail,
  createQuestionInBank,
  updateQuestionMetadata,
  createQuestionVersion,
  fetchQuestionVersions,
  archiveQuestion,
  createAssessment,
  fetchAssessmentDetail,
  fetchAssessmentVersions,
  fetchSelectedQuestions,
  fetchSelectedPools,
  createAssessmentVersion,
  updateAssessmentVersion,
  replaceAssessmentQuestions,
  replaceAssessmentPools,
  publishAssessmentVersion,
  upsertAccommodation,
} from './api';

export const ASSESSMENT_AUTHORING_KEYS = {
  all: ['assessment-authoring'] as const,
  banks: (workspaceId: string, params?: Partial<QuestionBanksQuery>) =>
    ['assessment-authoring', 'banks', workspaceId, params] as const,
  bankQuestions: (workspaceId: string, bankId: string, params?: Partial<QuestionsQuery>) =>
    ['assessment-authoring', 'bank-questions', workspaceId, bankId, params] as const,
  question: (workspaceId: string, questionId: string) =>
    ['assessment-authoring', 'question', workspaceId, questionId] as const,
  questionVersions: (workspaceId: string, questionId: string, params?: Partial<CursorQuery>) =>
    ['assessment-authoring', 'question-versions', workspaceId, questionId, params] as const,
  assessment: (workspaceId: string, courseId: string, assessmentId: string) =>
    ['assessment-authoring', 'assessment', workspaceId, courseId, assessmentId] as const,
  versions: (
    workspaceId: string,
    courseId: string,
    assessmentId: string,
    params?: Partial<CursorQuery>,
  ) => ['assessment-authoring', 'versions', workspaceId, courseId, assessmentId, params] as const,
  selectedQuestions: (
    workspaceId: string,
    courseId: string,
    assessmentId: string,
    versionId: string,
  ) =>
    [
      'assessment-authoring',
      'selected-questions',
      workspaceId,
      courseId,
      assessmentId,
      versionId,
    ] as const,
  selectedPools: (workspaceId: string, courseId: string, assessmentId: string, versionId: string) =>
    [
      'assessment-authoring',
      'selected-pools',
      workspaceId,
      courseId,
      assessmentId,
      versionId,
    ] as const,
};

// -------------------------------------------------------------
// Bank Hooks
// -------------------------------------------------------------

export function useQuestionBanksQuery(
  workspaceId: string,
  query: Partial<QuestionBanksQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.banks(workspaceId, query),
    queryFn: () => fetchQuestionBanks(workspaceId, query),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useCreateQuestionBankMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionBankCreate) => createQuestionBank(workspaceId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'banks', workspaceId],
      });
    },
  });
}

export function useUpdateQuestionBankMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      bankId,
      input,
      ifMatch,
    }: {
      bankId: string;
      input: QuestionBankUpdate;
      ifMatch?: string | { id: string; updatedAt: Date | string };
    }) => updateQuestionBank(workspaceId, bankId, input, ifMatch),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'banks', workspaceId],
      });
    },
  });
}

export function useArchiveQuestionBankMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      param:
        | string
        | {
            bankId: string;
            ifMatch?: string | { id: string; updatedAt: Date | string };
          },
    ) => {
      const bankId = typeof param === 'string' ? param : param.bankId;
      const ifMatch = typeof param === 'string' ? undefined : param.ifMatch;
      return archiveQuestionBank(workspaceId, bankId, ifMatch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'banks', workspaceId],
      });
    },
  });
}

// -------------------------------------------------------------
// Question Hooks
// -------------------------------------------------------------

export function useQuestionsInBankQuery(
  workspaceId: string,
  bankId: string,
  query: Partial<QuestionsQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.bankQuestions(workspaceId, bankId, query),
    queryFn: () => fetchQuestionsInBank(workspaceId, bankId, query),
    enabled: Boolean(workspaceId && bankId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useQuestionDetailQuery(
  workspaceId: string,
  questionId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.question(workspaceId, questionId),
    queryFn: () => fetchQuestionDetail(workspaceId, questionId),
    enabled: Boolean(workspaceId && questionId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useCreateQuestionMutation(workspaceId: string, bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: QuestionCreate) => createQuestionInBank(workspaceId, bankId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'bank-questions', workspaceId, bankId],
      });
    },
  });
}

export function useUpdateQuestionMetadataMutation(workspaceId: string, questionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      param:
        | QuestionUpdate
        | {
            input: QuestionUpdate;
            ifMatch?: string | { id: string; updatedAt: Date | string };
          },
    ) => {
      const input = 'input' in param ? param.input : param;
      const ifMatch = 'ifMatch' in param ? param.ifMatch : undefined;
      return updateQuestionMetadata(workspaceId, questionId, input, ifMatch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.question(workspaceId, questionId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'bank-questions', workspaceId],
      });
    },
  });
}

export function useCreateQuestionVersionMutation(workspaceId: string, questionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AuthorQuestionPayload) =>
      createQuestionVersion(workspaceId, questionId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.question(workspaceId, questionId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'question-versions', workspaceId, questionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'bank-questions', workspaceId],
      });
    },
  });
}

export function useQuestionVersionsQuery(
  workspaceId: string,
  questionId: string,
  query: Partial<CursorQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.questionVersions(workspaceId, questionId, query),
    queryFn: () => fetchQuestionVersions(workspaceId, questionId, query),
    enabled: Boolean(workspaceId && questionId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

export function useArchiveQuestionMutation(workspaceId: string, bankId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      param:
        | string
        | {
            questionId: string;
            ifMatch?: string | { id: string; updatedAt: Date | string };
          },
    ) => {
      const questionId = typeof param === 'string' ? param : param.questionId;
      const ifMatch = typeof param === 'string' ? undefined : param.ifMatch;
      return archiveQuestion(workspaceId, questionId, ifMatch);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'bank-questions', workspaceId, bankId],
      });
    },
  });
}

// -------------------------------------------------------------
// Assessment Hooks
// -------------------------------------------------------------

export function useAssessmentDetailQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
    queryFn: () => fetchAssessmentDetail(workspaceId, courseId, assessmentId),
    enabled: Boolean(workspaceId && courseId && assessmentId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useAssessmentVersionsQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  query: Partial<CursorQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.versions(workspaceId, courseId, assessmentId, query),
    queryFn: () => fetchAssessmentVersions(workspaceId, courseId, assessmentId, query),
    enabled: Boolean(workspaceId && courseId && assessmentId) && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useSelectedQuestionsQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.selectedQuestions(
      workspaceId,
      courseId,
      assessmentId,
      versionId,
    ),
    queryFn: () => fetchSelectedQuestions(workspaceId, courseId, assessmentId, versionId),
    enabled:
      Boolean(workspaceId && courseId && assessmentId && versionId) && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useSelectedPoolsQuery(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ASSESSMENT_AUTHORING_KEYS.selectedPools(
      workspaceId,
      courseId,
      assessmentId,
      versionId,
    ),
    queryFn: () => fetchSelectedPools(workspaceId, courseId, assessmentId, versionId),
    enabled:
      Boolean(workspaceId && courseId && assessmentId && versionId) && (options?.enabled ?? true),
    staleTime: 10_000,
  });
}

export function useCreateAssessmentMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, input }: { lessonId: string; input: AssessmentCreate }) =>
      createAssessment(workspaceId, courseId, lessonId, input),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, created.id),
      });
    },
  });
}

export function useCreateAssessmentVersionMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => createAssessmentVersion(workspaceId, courseId, assessmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'versions', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useUpdateAssessmentVersionMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      versionId,
      input,
    }: {
      versionId: string;
      input: Partial<AssessmentVersionConfig> & { version: number };
    }) => updateAssessmentVersion(workspaceId, courseId, assessmentId, versionId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'versions', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useReplaceAssessmentQuestionsMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: AssessmentQuestionsReplace }) =>
      replaceAssessmentQuestions(workspaceId, courseId, assessmentId, versionId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.selectedQuestions(
          workspaceId,
          courseId,
          assessmentId,
          variables.versionId,
        ),
      });
    },
  });
}

export function useReplaceAssessmentPoolsMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: AssessmentPoolsReplace }) =>
      replaceAssessmentPools(workspaceId, courseId, assessmentId, versionId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.selectedPools(
          workspaceId,
          courseId,
          assessmentId,
          variables.versionId,
        ),
      });
    },
  });
}

export function usePublishAssessmentVersionMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId }: { versionId: string; version?: number }) =>
      publishAssessmentVersion(workspaceId, courseId, assessmentId, versionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['assessment-authoring', 'versions', workspaceId, courseId, assessmentId],
      });
    },
  });
}

export function useUpsertAccommodationMutation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, input }: { enrollmentId: string; input: AccommodationUpsert }) =>
      upsertAccommodation(workspaceId, courseId, assessmentId, enrollmentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_AUTHORING_KEYS.assessment(workspaceId, courseId, assessmentId),
      });
    },
  });
}
