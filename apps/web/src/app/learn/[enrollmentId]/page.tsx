'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PlayCircle, CheckCircle2, Lock, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useEnrollment,
  useLearnerOutline,
  ContentUnavailableView,
  isContentUnavailableError,
} from '@/features/player';
import { siteConfig } from '@/features/marketing/site-config';
import { ThemeToggle } from '@/components/theme-toggle';

export default function EnrollmentOverviewPage() {
  const params = useParams();
  const enrollmentId = String(params?.enrollmentId ?? '');

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

  if (isEnrollmentLoading || isOutlineLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading course curriculum...</p>
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
            'Unable to load your enrollment details. Please ensure your access is active.'}
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

  // Find first uncompleted and unlocked lesson, or fallback to first lesson
  const allLessons = outline.sections.flatMap((s) => s.lessons);
  const nextLesson =
    allLessons.find((l) => !l.completedAt && l.access.allowed) ??
    allLessons.find((l) => l.access.allowed) ??
    allLessons[0];

  const percentNumber = Math.min(100, Math.max(0, parseFloat(enrollment.completionPercent) || 0));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link
            href="/student"
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            &larr; My Courses
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-xs font-semibold text-muted-foreground">{siteConfig.name}</span>
        </div>
        <ThemeToggle />
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b pb-6">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {enrollment.status}
                </Badge>
                {percentNumber >= 100 && (
                  <Badge variant="secondary" className="text-xs text-emerald-600">
                    Completed
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                Course Curriculum
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {percentNumber.toFixed(0)}% completed &bull; {allLessons.length} lessons in total
              </p>
            </div>

            {nextLesson && (
              <Button
                asChild
                size="lg"
                className="gap-2 shrink-0"
                data-testid="resume-learning-button"
              >
                <Link href={`/learn/${enrollmentId}/lessons/${nextLesson.lessonId}`}>
                  <PlayCircle className="h-5 w-5" />
                  <span>{percentNumber > 0 ? 'Resume Learning' : 'Start Course'}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-6 space-y-1.5">
            <div className="flex justify-between text-xs font-medium text-muted-foreground">
              <span>Overall Progress</span>
              <span>{percentNumber.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentNumber}%` }}
              />
            </div>
          </div>

          {/* Curriculum Sections */}
          <div className="mt-8 space-y-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Syllabus & Modules
            </h2>

            {outline.sections.map((section, sIdx) => (
              <div key={section.sectionId} className="rounded-xl border bg-muted/10 p-4">
                <h3 className="text-sm font-bold text-foreground mb-3">
                  Section {sIdx + 1}: {section.title}
                </h3>

                <ul className="space-y-2">
                  {section.lessons.map((lesson) => {
                    const isCompleted = Boolean(lesson.completedAt);
                    const isLocked = !lesson.access.allowed;

                    return (
                      <li key={lesson.lessonId}>
                        {isLocked ? (
                          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground opacity-75">
                            <div className="flex items-center gap-2.5">
                              <Lock className="h-4 w-4 shrink-0" />
                              <span className="font-medium">{lesson.title}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px]">
                              {!lesson.access.allowed
                                ? lesson.access.reason.replace(/_/g, ' ')
                                : 'Locked'}
                            </Badge>
                          </div>
                        ) : (
                          <Link
                            href={`/learn/${enrollmentId}/lessons/${lesson.lessonId}`}
                            className="flex items-center justify-between rounded-lg border bg-card px-3.5 py-2.5 text-xs font-medium hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
                              )}
                              <span className="text-foreground">{lesson.title}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground capitalize">
                              {lesson.type.toLowerCase().replace('_', ' ')}
                            </span>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
