'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GraduationCap,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useEnrollmentResultsQuery } from '../hooks';
import { formatDateTimeString } from '../types';
import type { ReleasedResult } from '../types';

export interface HistoricalResultsViewProps {
  enrollmentId: string;
  courseTitle?: string;
}

export function HistoricalResultsView({
  enrollmentId,
  courseTitle: _courseTitle,
}: HistoricalResultsViewProps) {
  const { data: results, isLoading, isError, refetch } = useEnrollmentResultsQuery(enrollmentId);

  const [expandedAttempts, setExpandedAttempts] = React.useState<Record<string, boolean>>({});

  const toggleAttempt = (attemptId: string) => {
    setExpandedAttempts((prev) => ({
      ...prev,
      [attemptId]: !prev[attemptId],
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96" />
        <div className="space-y-3 pt-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center sm:p-12">
        <AlertCircle className="size-10 text-destructive" />
        <h3 className="mt-3 text-lg font-semibold text-destructive">Failed to Load Results</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Could not retrieve assessment grades for this enrollment.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
          <RotateCcw className="mr-2 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const resultsList = results || [];

  return (
    <div className="space-y-6">
      {/* Historical records notice */}
      <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-foreground/90">
        <ShieldCheck className="size-5 shrink-0 text-primary" />
        <div>
          <span className="font-semibold text-foreground">Permanent Academic Record.</span> All
          released grades and instructor feedback remain permanently accessible to you, even after
          course access expires.
        </div>
      </div>

      {resultsList.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
            <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
              <GraduationCap className="size-8" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">No released grades yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              You haven&apos;t taken any assessments or the instructor has not yet released the
              final grades for completed attempts.
            </p>
            <div className="mt-5">
              <Button asChild size="sm" variant="outline">
                <Link href={`/student/enrollments/${enrollmentId}`}>View Course Outline</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {resultsList.map((result: ReleasedResult) => {
            const isExpanded = expandedAttempts[result.attemptId] ?? true;
            const percentNum = parseFloat(result.percent) || 0;

            return (
              <Card
                key={result.attemptId}
                className="overflow-hidden border-border/80 transition-shadow hover:shadow-sm"
              >
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`rounded-xl p-2 ${
                          result.passed
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {result.passed ? (
                          <CheckCircle2 className="size-5" />
                        ) : (
                          <XCircle className="size-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-semibold">
                            Attempt #{result.number}
                          </CardTitle>
                          <Badge
                            variant="outline"
                            className={
                              result.passed
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs'
                                : 'border-destructive/40 bg-destructive/10 text-destructive text-xs'
                            }
                          >
                            {result.passed ? 'Passed' : 'Not Passed'}
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-1.5 text-xs mt-0.5">
                          <Clock className="size-3 text-muted-foreground" />
                          <span>Graded on {formatDateTimeString(result.gradedAt)}</span>
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-bold text-foreground">
                          {result.awardedPoints} / {result.totalPoints}{' '}
                          <span className="text-xs font-normal text-muted-foreground">pts</span>
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground">
                          {percentNum.toFixed(1)}%
                        </div>
                      </div>

                      {result.answers && result.answers.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAttempt(result.attemptId)}
                          className="h-8 w-8 p-0"
                          aria-label={isExpanded ? 'Collapse breakdown' : 'Expand breakdown'}
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {/* Question breakdown */}
                {isExpanded && result.answers && result.answers.length > 0 && (
                  <CardContent className="border-t border-border/60 bg-muted/10 p-4 sm:p-5 space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Question Feedback Breakdown
                    </h4>

                    <div className="divide-y divide-border/40 rounded-lg border border-border bg-card">
                      {result.answers.map((answer, index) => (
                        <div key={answer.attemptQuestionId} className="p-3.5 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between font-medium">
                            <span className="text-foreground">Question {index + 1}</span>
                            <div className="flex items-center gap-2">
                              {answer.isCorrect !== null && (
                                <Badge
                                  variant="outline"
                                  className={
                                    answer.isCorrect
                                      ? 'border-emerald-500/40 text-emerald-600 text-[10px]'
                                      : 'border-destructive/40 text-destructive text-[10px]'
                                  }
                                >
                                  {answer.isCorrect ? 'Correct' : 'Incorrect'}
                                </Badge>
                              )}
                              <span className="font-semibold text-foreground">
                                {answer.awardedPoints} pts
                              </span>
                            </div>
                          </div>

                          {answer.feedback && (
                            <div className="rounded-md bg-muted/40 p-2.5 text-muted-foreground">
                              <p className="font-semibold text-[11px] text-foreground/80">
                                Instructor Feedback:
                              </p>
                              <p className="mt-0.5 leading-relaxed">{answer.feedback}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
