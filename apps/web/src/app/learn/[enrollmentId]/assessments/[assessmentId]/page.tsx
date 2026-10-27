'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { siteConfig } from '@/features/marketing/site-config';
import { useEnrollment } from '@/features/player';
import {
  useLearnerAssessment,
  useStartAttemptMutation,
  useLearnerAttempt,
  useAttemptResult,
  AssessmentStartCard,
  AssessmentRunner,
  AssessmentResultView,
} from '@/features/assessment-taking';

export default function AssessmentTakingPage() {
  const params = useParams();
  const enrollmentId = String(params?.enrollmentId ?? '');
  const assessmentId = String(params?.assessmentId ?? '');

  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  const {
    data: enrollment,
    isLoading: isEnrollmentLoading,
    error: enrollmentError,
  } = useEnrollment(enrollmentId);

  const {
    data: assessment,
    isLoading: isAssessmentLoading,
    error: assessmentError,
    refetch: refetchAssessment,
  } = useLearnerAssessment(enrollmentId, assessmentId);

  const startMutation = useStartAttemptMutation(enrollmentId, assessmentId);

  const { data: attempt, refetch: refetchAttempt } = useLearnerAttempt(activeAttemptId ?? '', {
    enabled: Boolean(activeAttemptId),
  });

  const isAttemptSubmitted =
    attempt?.status === 'SUBMITTED' ||
    attempt?.status === 'GRADING' ||
    attempt?.status === 'GRADED';

  const { data: result } = useAttemptResult(activeAttemptId ?? '', {
    enabled: Boolean(activeAttemptId && isAttemptSubmitted),
  });

  const handleStartAttempt = async () => {
    try {
      const started = await startMutation.mutateAsync();
      setActiveAttemptId(started.attemptId);
    } catch (err) {
      console.error('Failed to start attempt:', err);
    }
  };

  if (isEnrollmentLoading || isAssessmentLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Preparing assessment environment...</p>
        </div>
      </div>
    );
  }

  if (enrollmentError || assessmentError || !enrollment || !assessment) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground">Assessment Unavailable</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          {enrollmentError?.message ||
            assessmentError?.message ||
            'Unable to load assessment details.'}
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button size="sm" onClick={() => void refetchAssessment()}>
            Retry
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/learn/${enrollmentId}`}>Back to Course</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href={`/learn/${enrollmentId}`}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Course Player</span>
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-xs font-semibold text-muted-foreground">{siteConfig.name}</span>
        </div>

        <ThemeToggle />
      </header>

      {/* Main Viewport */}
      <main className="p-4 md:p-8">
        {!activeAttemptId || !attempt ? (
          <AssessmentStartCard
            assessment={assessment}
            onStart={handleStartAttempt}
            isStarting={startMutation.isPending}
          />
        ) : isAttemptSubmitted ? (
          <AssessmentResultView
            enrollmentId={enrollmentId}
            result={result ?? null}
            questions={attempt.questions}
            isPendingGrading={attempt.status === 'SUBMITTED' || attempt.status === 'GRADING'}
            isGradeHeld={attempt.status === 'GRADED' && result === null}
          />
        ) : (
          <AssessmentRunner
            attempt={attempt}
            assessment={assessment}
            workspaceId={enrollment.workspaceId}
            enrollmentId={enrollmentId}
            onSubmitted={() => {
              void refetchAttempt();
            }}
          />
        )}
      </main>
    </div>
  );
}
