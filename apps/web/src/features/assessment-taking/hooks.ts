'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLearnerAssessment,
  startAssessmentAttempt,
  fetchAttempt,
  saveAnswer,
  submitAttempt,
  fetchAttemptResult,
} from './api';
import type {
  LearnerAssessment,
  AttemptStart,
  LearnerAttempt,
  SavedAnswer,
  AttemptState,
  ReleasedResult,
  AutosaveStatus,
  QuestionResponse,
} from './types';
import { ApiError } from '@/lib/api';

export const ASSESSMENT_QUERY_KEYS = {
  all: ['assessment-taking'] as const,
  assessment: (enrollmentId: string, assessmentId: string) =>
    ['assessment-taking', 'assessment', enrollmentId, assessmentId] as const,
  attempt: (attemptId: string) => ['assessment-taking', 'attempt', attemptId] as const,
  result: (attemptId: string) => ['assessment-taking', 'result', attemptId] as const,
};

/**
 * Hook to retrieve assessment config, timing limits, instructions, and policies.
 */
export function useLearnerAssessment(
  enrollmentId: string,
  assessmentId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<LearnerAssessment>({
    queryKey: ASSESSMENT_QUERY_KEYS.assessment(enrollmentId, assessmentId),
    queryFn: () => fetchLearnerAssessment(enrollmentId, assessmentId),
    enabled: Boolean(enrollmentId && assessmentId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Mutation hook to start or resume an attempt.
 * Retains stable Idempotency-Key across retries of the start action.
 */
export function useStartAttemptMutation(enrollmentId: string, assessmentId: string) {
  const idempotencyKeyRef = useRef<string | null>(null);

  return useMutation<AttemptStart, Error, void>({
    mutationFn: () => {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      return startAssessmentAttempt(enrollmentId, assessmentId, idempotencyKeyRef.current);
    },
    onSuccess: () => {
      idempotencyKeyRef.current = null;
      // Start responses omit saved answers. Let useLearnerAttempt fetch the full snapshot,
      // including answers when resuming an existing attempt.
    },
  });
}

/**
 * Hook to query active or completed attempt details and saved answers.
 */
export function useLearnerAttempt(attemptId: string, options?: { enabled?: boolean }) {
  return useQuery<LearnerAttempt>({
    queryKey: ASSESSMENT_QUERY_KEYS.attempt(attemptId),
    queryFn: () => fetchAttempt(attemptId),
    enabled: Boolean(attemptId) && (options?.enabled ?? true),
    staleTime: 5_000,
  });
}

/**
 * Accurate countdown timer derived strictly from server `deadlineAt`.
 * - No browser-authoritative extension: computed against current wall-clock and server deadline.
 * - Auto-fires `onExpire` when time lapses.
 */
export function useServerDeadlineTimer(deadlineAt: string | null, onExpire?: () => void) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(() => {
    if (!deadlineAt) return null;
    const diff = Math.floor((Date.parse(deadlineAt) - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const expiredFiredRef = useRef(false);

  useEffect(() => {
    if (!deadlineAt) {
      setRemainingSeconds(null);
      return;
    }

    const calculateRemaining = () => {
      const diff = Math.floor((Date.parse(deadlineAt) - Date.now()) / 1000);
      const remaining = Math.max(0, diff);
      setRemainingSeconds(remaining);

      if (remaining <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);
    return () => clearInterval(interval);
  }, [deadlineAt]);

  const formattedTime = remainingSeconds !== null ? formatSeconds(remainingSeconds) : null;
  const isExpiringSoon =
    remainingSeconds !== null && remainingSeconds <= 300 && remainingSeconds > 0;
  const isCritical = remainingSeconds !== null && remainingSeconds <= 60 && remainingSeconds > 0;
  const isExpired = remainingSeconds !== null && remainingSeconds <= 0;

  return {
    remainingSeconds,
    formattedTime,
    isExpiringSoon,
    isCritical,
    isExpired,
  };
}

function formatSeconds(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

interface UseAutosaveAnswerOptions {
  attemptId: string;
  attemptQuestionId: string;
  initialVersion?: number;
  debounceMs?: number;
}

/**
 * Intelligent autosave engine for learner question responses.
 * Debounces fast input (typing essays/text/numbers), executes immediately for radio/options,
 * handles version conflict retry and network recovery.
 */
export function useAutosaveAnswer({
  attemptId,
  attemptQuestionId,
  initialVersion = 1,
  debounceMs = 1000,
}: UseAutosaveAnswerOptions) {
  const [status, setStatus] = useState<AutosaveStatus>('IDLE');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const versionRef = useRef(initialVersion);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const saveMutation = useMutation<
    SavedAnswer,
    Error,
    { response: QuestionResponse; attachmentIds?: string[] }
  >({
    mutationFn: async ({ response, attachmentIds }) => {
      setStatus('SAVING');
      try {
        const result = await saveAnswer(attemptId, attemptQuestionId, {
          version: versionRef.current,
          response,
          attachmentIds,
        });
        versionRef.current = result.version;
        setLastSavedAt(result.savedAt);
        setStatus('SAVED');
        return result;
      } catch (err) {
        if (!navigator.onLine) {
          setStatus('OFFLINE');
        } else if (err instanceof ApiError && err.status === 409) {
          setStatus('CONFLICT');
        } else {
          setStatus('ERROR');
        }
        throw err;
      }
    },
  });

  const triggerSave = useCallback(
    (response: QuestionResponse, attachmentIds?: string[], immediate = false) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      if (immediate) {
        saveMutation.mutate({ response, attachmentIds });
      } else {
        debounceTimerRef.current = setTimeout(() => {
          saveMutation.mutate({ response, attachmentIds });
        }, debounceMs);
      }
    },
    [debounceMs, saveMutation],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return {
    save: triggerSave,
    status,
    lastSavedAt,
    isSaving: saveMutation.isPending,
    error: saveMutation.error,
  };
}

/**
 * Mutation hook for final attempt submission.
 * Retains stable Idempotency-Key across retries of the submit action.
 */
export function useSubmitAttemptMutation(attemptId: string) {
  const queryClient = useQueryClient();
  const submitKeyRef = useRef<string | null>(null);

  return useMutation<AttemptState, Error, void>({
    mutationFn: () => {
      if (!submitKeyRef.current) {
        submitKeyRef.current = crypto.randomUUID();
      }
      return submitAttempt(attemptId, submitKeyRef.current);
    },
    onSuccess: (data) => {
      submitKeyRef.current = null;
      queryClient.setQueryData(ASSESSMENT_QUERY_KEYS.attempt(attemptId), (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...old, status: data.status, submittedAt: data.submittedAt };
        }
        return old;
      });
      void queryClient.invalidateQueries({
        queryKey: ASSESSMENT_QUERY_KEYS.result(attemptId),
      });
    },
  });
}

/**
 * Hook to retrieve released scores and feedback.
 * Gracefully flags 409 GRADE_NOT_RELEASED as pending feedback state rather than fatal error.
 */
export function useAttemptResult(attemptId: string, options?: { enabled?: boolean }) {
  return useQuery<ReleasedResult | null>({
    queryKey: ASSESSMENT_QUERY_KEYS.result(attemptId),
    queryFn: async () => {
      try {
        return await fetchAttemptResult(attemptId);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 409 ||
            err.code === 'GRADE_NOT_RELEASED' ||
            err.message.includes('Grade has not been released'))
        ) {
          // Feedback/grading is held according to course policy
          return null;
        }
        throw err;
      }
    },
    enabled: Boolean(attemptId) && (options?.enabled ?? true),
    staleTime: 30_000,
    retry: false,
  });
}
