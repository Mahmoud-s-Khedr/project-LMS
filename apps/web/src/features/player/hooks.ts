'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchEnrollment,
  fetchLearnerOutline,
  fetchLearnerLesson,
  updateLessonProgress,
  requestLessonAssetDownload,
  joinLiveSession,
  fetchEnrollmentResults,
} from './api';
import type {
  Enrollment,
  LearnerOutline,
  LearnerLesson,
  LessonProgress,
  ProgressUpdate,
  DownloadCapability,
  ReleasedResult,
} from './types';

export const PLAYER_QUERY_KEYS = {
  all: ['player'] as const,
  enrollment: (enrollmentId: string) => ['player', 'enrollment', enrollmentId] as const,
  outline: (enrollmentId: string) => ['player', 'outline', enrollmentId] as const,
  lesson: (enrollmentId: string, lessonId: string) =>
    ['player', 'lesson', enrollmentId, lessonId] as const,
  results: (enrollmentId: string) => ['player', 'results', enrollmentId] as const,
};

/**
 * Hook to retrieve enrollment status, completion percentage, and active access rules.
 */
export function useEnrollment(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery<Enrollment>({
    queryKey: PLAYER_QUERY_KEYS.enrollment(enrollmentId),
    queryFn: () => fetchEnrollment(enrollmentId),
    enabled: Boolean(enrollmentId) && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

/**
 * Hook to retrieve learner outline with section hierarchy and lock reasons.
 */
export function useLearnerOutline(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery<LearnerOutline>({
    queryKey: PLAYER_QUERY_KEYS.outline(enrollmentId),
    queryFn: () => fetchLearnerOutline(enrollmentId),
    enabled: Boolean(enrollmentId) && (options?.enabled ?? true),
    staleTime: 20_000,
  });
}

/**
 * Hook to retrieve specific lesson payload and asset references.
 */
export function useLearnerLesson(
  enrollmentId: string,
  lessonId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<LearnerLesson>({
    queryKey: lessonId
      ? PLAYER_QUERY_KEYS.lesson(enrollmentId, lessonId)
      : ['player', 'lesson', enrollmentId, 'none'],
    queryFn: () => {
      if (!lessonId) throw new Error('Lesson ID is required');
      return fetchLearnerLesson(enrollmentId, lessonId);
    },
    enabled: Boolean(enrollmentId && lessonId) && (options?.enabled ?? true),
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Mutation hook for updating lesson progress (acknowledge, view, or playback heartbeat).
 */
export function useProgressMutation(enrollmentId: string, lessonId: string) {
  const queryClient = useQueryClient();

  return useMutation<LessonProgress, Error, ProgressUpdate>({
    mutationFn: (update) => updateLessonProgress(enrollmentId, lessonId, update),
    onSuccess: (data) => {
      // Optimistically or accurately update lesson progress in cache
      queryClient.setQueryData<LearnerLesson | undefined>(
        PLAYER_QUERY_KEYS.lesson(enrollmentId, lessonId),
        (old) => (old ? { ...old, progress: data } : old),
      );
      // Invalidate outline and enrollment so completion percentages and next lesson availability refresh
      void queryClient.invalidateQueries({
        queryKey: PLAYER_QUERY_KEYS.outline(enrollmentId),
      });
      void queryClient.invalidateQueries({
        queryKey: PLAYER_QUERY_KEYS.enrollment(enrollmentId),
      });
    },
  });
}

/**
 * Hook to request and auto-renew signed asset capability URLs.
 * Strict secure delivery requirements:
 * - Signed URLs are stored strictly in memory (never localStorage / sessionStorage).
 * - Renewed automatically before expiry (buffer of 10s).
 * - Safe for media playback renewal.
 */
export function useAssetSignedUrl(
  enrollmentId: string,
  lessonId: string,
  assetId: string | null,
  options?: { enabled?: boolean },
) {
  const [capability, setCapability] = useState<DownloadCapability | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchUrl = useCallback(async (): Promise<string | null> => {
    if (!assetId || !lessonId || !enrollmentId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const data = await requestLessonAssetDownload(enrollmentId, lessonId, assetId);
      setCapability(data);

      // Schedule renewal before expiration (e.g. 10s buffer for short-lived <=60s URLs)
      if (timerRef.current) clearTimeout(timerRef.current);
      const expiresAtMs = Date.parse(data.expiresAt);
      const remainingMs = expiresAtMs - Date.now();
      const bufferMs = remainingMs > 25_000 ? 10_000 : 5_000;
      const delayMs = Math.max(3_000, remainingMs - bufferMs);
      timerRef.current = setTimeout(() => {
        void fetchUrl();
      }, delayMs);
      return data.url;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [assetId, lessonId, enrollmentId]);

  useEffect(() => {
    if (options?.enabled !== false && assetId && lessonId && enrollmentId) {
      void fetchUrl();
    } else {
      setCapability(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchUrl, assetId, lessonId, enrollmentId, options?.enabled]);

  return {
    url: capability?.url ?? null,
    expiresAt: capability?.expiresAt ?? null,
    isLoading,
    error,
    renew: fetchUrl,
  };
}

interface UsePlaybackHeartbeatOptions {
  enrollmentId: string;
  lessonId: string;
  isPlaying: boolean;
  currentTime: number;
  intervalMs?: number;
}

/**
 * Playback heartbeat manager.
 * Sends periodic PLAYBACK events with bounded elapsedSeconds (1..120),
 * clean UUID eventIds, and exact playback timestamps.
 */
export function usePlaybackHeartbeat({
  enrollmentId,
  lessonId,
  isPlaying,
  currentTime,
  intervalMs = 10_000,
}: UsePlaybackHeartbeatOptions) {
  const progressMutation = useProgressMutation(enrollmentId, lessonId);
  const lastHeartbeatTimeRef = useRef<number>(Date.now());
  const currentTimeRef = useRef<number>(currentTime);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!isPlaying) {
      lastHeartbeatTimeRef.current = Date.now();
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const rawElapsed = Math.round((now - lastHeartbeatTimeRef.current) / 1000);
      lastHeartbeatTimeRef.current = now;

      // Bound elapsed seconds strictly to schema requirements: min 1, max 120
      const elapsedSeconds = Math.min(120, Math.max(1, rawElapsed));
      const positionSeconds = Math.max(0, Math.floor(currentTimeRef.current));

      progressMutation.mutate({
        type: 'PLAYBACK',
        eventId: crypto.randomUUID(),
        positionSeconds,
        elapsedSeconds,
        occurredAt: new Date(now).toISOString(),
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, intervalMs, progressMutation]);

  return progressMutation;
}

/**
 * Hook to request live session join link.
 */
export function useJoinLiveSessionMutation(enrollmentId: string) {
  return useMutation<DownloadCapability, Error, string>({
    mutationFn: (sessionId) => joinLiveSession(enrollmentId, sessionId),
  });
}

/**
 * Hook to retrieve student's historical assessment results for this enrollment.
 */
export function useEnrollmentResults(enrollmentId: string, options?: { enabled?: boolean }) {
  return useQuery<ReleasedResult[]>({
    queryKey: PLAYER_QUERY_KEYS.results(enrollmentId),
    queryFn: () => fetchEnrollmentResults(enrollmentId),
    enabled: Boolean(enrollmentId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}
