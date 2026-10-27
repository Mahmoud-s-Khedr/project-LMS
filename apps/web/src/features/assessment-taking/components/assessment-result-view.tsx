'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, XCircle, Clock, ArrowRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ReleasedResult, LearnerQuestion } from '../types';

interface AssessmentResultViewProps {
  enrollmentId: string;
  result: ReleasedResult | null;
  questions?: LearnerQuestion[];
  isPendingGrading?: boolean;
  isGradeHeld?: boolean;
}

export function AssessmentResultView({
  enrollmentId,
  result,
  questions = [],
  isPendingGrading = false,
  isGradeHeld = false,
}: AssessmentResultViewProps) {
  // If result is not released yet (e.g. pending manual grading or held per policy)
  if (!result || isPendingGrading || isGradeHeld) {
    const isHeld = isGradeHeld || (!result && !isPendingGrading);

    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl border bg-card p-8 md:p-12 text-center max-w-xl mx-auto shadow-sm"
        data-testid="grading-pending-view"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
          <Clock className="h-8 w-8" />
        </div>

        <Badge
          variant="outline"
          className="mb-2 text-xs font-semibold text-amber-600 border-amber-300"
        >
          {isHeld ? 'Grade Held by Policy' : 'Grading in Progress'}
        </Badge>

        <h3 className="text-xl font-bold text-foreground">
          {isHeld ? 'Grade Scheduled for Later Release' : 'Submission Received!'}
        </h3>
        <p className="mt-2 text-xs md:text-sm text-muted-foreground leading-relaxed max-w-md">
          {isHeld
            ? 'Your answers have been evaluated, but detailed scores and feedback are held per assessment release policy (e.g. after the assessment deadline). Check back after the release window.'
            : 'Your answers have been securely recorded. Instructor evaluations or delayed policy releases are currently pending. Your final score and detailed feedback will appear here once published.'}
        </p>

        <Button asChild size="default" className="mt-8 gap-2" data-testid="back-to-course-button">
          <Link href={`/learn/${enrollmentId}`}>
            <span>Back to Course</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  const percentNumber = parseFloat(result.percent);
  const totalPointsNumber = parseFloat(result.totalPoints);
  const awardedPointsNumber = parseFloat(result.awardedPoints);

  return (
    <div
      className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:p-8 max-w-3xl mx-auto shadow-sm"
      data-testid="assessment-result-view"
    >
      {/* Score Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b pb-6 text-center sm:text-left">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${
              result.passed
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}
          >
            {result.passed ? <CheckCircle2 className="h-9 w-9" /> : <XCircle className="h-9 w-9" />}
          </div>
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {result.passed ? 'Assessment Passed' : 'Assessment Not Passed'}
              </h2>
              <Badge variant={result.passed ? 'default' : 'destructive'} className="text-xs">
                {result.passed ? 'PASSED' : 'FAILED'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Graded on {new Date(result.gradedAt).toLocaleDateString()} at{' '}
              {new Date(result.gradedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        {/* Score Stats */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">Score</span>
            <p className="text-2xl font-black text-foreground">{percentNumber.toFixed(0)}%</p>
          </div>
          <div className="h-10 w-px bg-border" />
          <div className="text-center">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground">
              Points
            </span>
            <p className="text-lg font-bold text-foreground">
              {awardedPointsNumber.toFixed(1)} / {totalPointsNumber.toFixed(1)}
            </p>
          </div>
        </div>
      </div>

      {/* Per-Question Feedback Breakdown */}
      {result.answers && result.answers.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Question Review ({result.answers.length})
          </h3>

          <div className="space-y-3">
            {result.answers.map((ans, idx) => {
              const matchedQuestion = questions.find(
                (q) => q.attemptQuestionId === ans.attemptQuestionId,
              );

              const promptSnippet =
                matchedQuestion?.prompt?.content
                  ?.map((b) => b.content?.map((n) => n.text).join('') || '')
                  .join(' ')
                  .slice(0, 140) || `Question ${idx + 1}`;

              return (
                <div
                  key={ans.attemptQuestionId}
                  className="rounded-xl border bg-muted/20 p-4 text-xs space-y-2"
                  data-testid={`answer-result-${ans.attemptQuestionId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      Question {idx + 1}: {matchedQuestion?.type.replace('_', ' ') || ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">
                        {parseFloat(ans.awardedPoints).toFixed(1)} pts
                      </span>
                      {ans.isCorrect === true && (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                          Correct
                        </Badge>
                      )}
                      {ans.isCorrect === false && (
                        <Badge variant="outline" className="text-rose-600 border-rose-300">
                          Incorrect
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className="text-muted-foreground line-clamp-2">{promptSnippet}</p>

                  {ans.feedback && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg bg-background p-2.5 text-xs text-foreground border">
                      <MessageSquare className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      <div>
                        <span className="font-semibold text-[11px] text-primary">
                          Instructor Feedback:
                        </span>
                        <p className="mt-0.5 leading-relaxed">{ans.feedback}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4 border-t">
        <Button asChild size="default" className="gap-2" data-testid="result-return-button">
          <Link href={`/learn/${enrollmentId}`}>
            <span>Continue Course</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
