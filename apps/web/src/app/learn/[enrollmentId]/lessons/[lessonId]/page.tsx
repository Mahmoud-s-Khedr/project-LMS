'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PlayerShell,
  useEnrollment,
  useLearnerOutline,
  useLearnerLesson,
  ContentUnavailableView,
  isContentUnavailableError,
} from '@/features/player';

export default function LessonPlayerPage() {
  const params = useParams();
  const enrollmentId = String(params?.enrollmentId ?? '');
  const lessonId = String(params?.lessonId ?? '');

  const {
    data: enrollment,
    isLoading: isEnrollmentLoading,
    error: enrollmentError,
    refetch: refetchEnrollment,
  } = useEnrollment(enrollmentId);

  const {
    data: outline,
    isLoading: isOutlineLoading,
    error: outlineError,
    refetch: refetchOutline,
  } = useLearnerOutline(enrollmentId);

  const {
    data: lesson,
    isLoading: isLessonLoading,
    error: lessonError,
    refetch: refetchLesson,
  } = useLearnerLesson(enrollmentId, lessonId);

  if (isEnrollmentLoading || isOutlineLoading || isLessonLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading lesson player...</p>
        </div>
      </div>
    );
  }

  if (enrollmentError || outlineError || !enrollment || !outline) {
    const errorObj = enrollmentError || outlineError;
    if (isContentUnavailableError(errorObj)) {
      return (
        <div className="flex min-h-screen w-full items-center justify-center p-6">
          <ContentUnavailableView
            onRetry={() => {
              void refetchEnrollment();
              void refetchOutline();
            }}
            backHref="/student"
          />
        </div>
      );
    }

    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground">Course Unavailable</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          {enrollmentError?.message ||
            outlineError?.message ||
            'Unable to load your enrollment details.'}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => {
              void refetchEnrollment();
              void refetchOutline();
            }}
          >
            Retry
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/student">Back to My Courses</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (lessonError || !lesson) {
    if (isContentUnavailableError(lessonError)) {
      return (
        <PlayerShell
          enrollment={enrollment}
          outline={outline}
          lesson={null}
          courseTitle="Course Player"
        >
          <ContentUnavailableView
            onRetry={() => void refetchLesson()}
            backHref={`/learn/${enrollmentId}`}
            backLabel="Back to Course Outline"
          />
        </PlayerShell>
      );
    }
  }

  return (
    <PlayerShell
      enrollment={enrollment}
      outline={outline}
      lesson={lesson}
      courseTitle="Course Player"
    />
  );
}
