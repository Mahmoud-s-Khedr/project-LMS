'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle, ClipboardList, GraduationCap, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { LearnerLesson } from '../types';

interface AssessmentLessonCardProps {
  enrollmentId: string;
  lesson: LearnerLesson;
}

export function AssessmentLessonCard({ enrollmentId, lesson }: AssessmentLessonCardProps) {
  const isQuiz = lesson.payload.type === 'QUIZ';
  const isAssignment = lesson.payload.type === 'ASSIGNMENT';
  const isExam = lesson.payload.type === 'EXAM';

  const kindLabel = isQuiz ? 'Quiz' : isAssignment ? 'Assignment' : 'Exam';
  const Icon = isQuiz ? HelpCircle : isAssignment ? ClipboardList : GraduationCap;
  const isCompleted = Boolean(lesson.progress?.completedAt);

  const assessmentHref = `/learn/${enrollmentId}/assessments/${lesson.assessmentId}`;

  return (
    <div
      className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-xs max-w-2xl mx-auto my-6"
      data-testid="assessment-lesson-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{lesson.title}</h3>
              <Badge variant="outline">{kindLabel}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isExam
                ? 'Comprehensive timed examination'
                : isAssignment
                  ? 'Practical coursework assignment with rubric feedback'
                  : 'Knowledge check assessment'}
            </p>
          </div>
        </div>

        {isCompleted && (
          <Badge
            variant="secondary"
            className="gap-1 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Passed</span>
          </Badge>
        )}
      </div>

      <div className="rounded-lg bg-muted/40 p-4 text-xs space-y-2 text-muted-foreground">
        <div className="flex justify-between">
          <span className="font-medium text-foreground">Completion Requirement:</span>
          <span>Score at or above required passing percentage</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium text-foreground">Format:</span>
          <span>
            {isExam
              ? 'Timed exam with automatic countdown'
              : isAssignment
                ? 'Document / essay submission'
                : 'Interactive questions'}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button asChild size="default" className="gap-2" data-testid="start-assessment-button">
          <Link href={assessmentHref}>
            <span>{isCompleted ? 'Review Assessment' : 'Open Assessment'}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
