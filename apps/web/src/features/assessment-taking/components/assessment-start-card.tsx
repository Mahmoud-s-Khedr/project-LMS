'use client';

import React from 'react';
import {
  Clock,
  RotateCcw,
  Award,
  AlertCircle,
  Play,
  RefreshCw,
  HelpCircle,
  ClipboardList,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LearnerAssessment } from '../types';

interface AssessmentStartCardProps {
  assessment: LearnerAssessment;
  onStart: () => void;
  isStarting?: boolean;
}

export function AssessmentStartCard({
  assessment,
  onStart,
  isStarting = false,
}: AssessmentStartCardProps) {
  const isQuiz = assessment.kind === 'QUIZ';
  const isAssignment = assessment.kind === 'ASSIGNMENT';
  const Icon = isQuiz ? HelpCircle : isAssignment ? ClipboardList : GraduationCap;

  const isWindowOpen =
    (!assessment.availableFrom || Date.parse(assessment.availableFrom) <= Date.now()) &&
    (!assessment.availableUntil || Date.parse(assessment.availableUntil) > Date.now());

  const canStart = assessment.remainingAttempts > 0 && isWindowOpen;

  const instructionsText =
    assessment.instructions?.content
      ?.map((b) => b.content?.map((n) => n.text).join('') || '')
      .join('\n\n') || 'Please read all questions carefully before submitting.';

  const formatDuration = (secs: number | null) => {
    if (!secs) return 'Untimed';
    const m = Math.floor(secs / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h} hr ${m % 60} mins`;
    return `${m} minutes`;
  };

  return (
    <div
      className="flex flex-col gap-6 rounded-2xl border bg-card p-6 md:p-8 max-w-2xl mx-auto shadow-sm"
      data-testid="assessment-start-card"
    >
      <div className="flex items-start justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg md:text-xl font-bold text-foreground">{assessment.title}</h2>
              <Badge variant="outline">{assessment.kind}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Version {assessment.version}</p>
          </div>
        </div>
      </div>

      {/* Rules / Specs Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-muted/20 p-3.5 text-center">
          <Clock className="mx-auto h-4 w-4 text-primary mb-1" />
          <span className="text-[10px] text-muted-foreground uppercase font-medium">
            Time Limit
          </span>
          <p className="text-xs font-bold text-foreground mt-0.5">
            {formatDuration(assessment.timeLimitSeconds)}
          </p>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3.5 text-center">
          <RotateCcw className="mx-auto h-4 w-4 text-primary mb-1" />
          <span className="text-[10px] text-muted-foreground uppercase font-medium">Remaining</span>
          <p className="text-xs font-bold text-foreground mt-0.5">
            {assessment.remainingAttempts}{' '}
            {assessment.remainingAttempts === 1 ? 'attempt' : 'attempts'}
          </p>
        </div>

        <div className="rounded-xl border bg-muted/20 p-3.5 text-center col-span-2 sm:col-span-1">
          <Award className="mx-auto h-4 w-4 text-primary mb-1" />
          <span className="text-[10px] text-muted-foreground uppercase font-medium">
            Pass Score
          </span>
          <p className="text-xs font-bold text-foreground mt-0.5">
            {parseFloat(assessment.passPercent).toFixed(0)}%
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instructions
        </h4>
        <div className="rounded-xl border bg-muted/10 p-4 text-xs md:text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {instructionsText}
        </div>
      </div>

      {!canStart && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>
            {assessment.remainingAttempts <= 0
              ? 'You have used all available attempts for this assessment.'
              : 'This assessment is currently closed according to the schedule.'}
          </span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          size="default"
          onClick={onStart}
          disabled={!canStart || isStarting}
          className="gap-2 px-6"
          data-testid="start-attempt-button"
        >
          {isStarting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Starting Attempt...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-current" />
              <span>Start Attempt</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
