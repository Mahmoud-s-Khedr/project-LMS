'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LearnerOutlineLesson } from '../types';

interface PlayerNavigationProps {
  enrollmentId: string;
  prevLesson?: LearnerOutlineLesson | null;
  nextLesson?: LearnerOutlineLesson | null;
  isCompleted?: boolean;
  onMarkComplete?: () => void;
  isMarkingComplete?: boolean;
  showCompleteButton?: boolean;
}

export function PlayerNavigation({
  enrollmentId,
  prevLesson,
  nextLesson,
  isCompleted = false,
  onMarkComplete,
  isMarkingComplete = false,
  showCompleteButton = true,
}: PlayerNavigationProps) {
  const isNextLocked = nextLesson ? !nextLesson.access.allowed : false;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t bg-card/60 p-4 backdrop-blur supports-[backdrop-filter]:bg-card/40"
      aria-label="Lesson navigation"
      data-testid="player-navigation"
    >
      <div>
        {prevLesson ? (
          <Button
            variant="outline"
            size="sm"
            asChild
            className="gap-1.5 text-xs"
            data-testid="prev-lesson-button"
          >
            <Link
              href={`/learn/${enrollmentId}/lessons/${prevLesson.lessonId}`}
              aria-label={`Previous lesson: ${prevLesson.title}`}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs opacity-50">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {showCompleteButton && (
          <Button
            variant={isCompleted ? 'secondary' : 'default'}
            size="sm"
            onClick={onMarkComplete}
            disabled={isMarkingComplete || isCompleted}
            className="gap-1.5 text-xs"
            data-testid="mark-complete-button"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>
              {isCompleted
                ? 'Completed'
                : isMarkingComplete
                  ? 'Saving...'
                  : 'Mark as Complete'}
            </span>
          </Button>
        )}

        {nextLesson ? (
          isNextLocked ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-1.5 text-xs cursor-not-allowed opacity-60"
              title="Next lesson is locked"
              data-testid="next-lesson-locked-button"
            >
              <span>Next</span>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              asChild
              className="gap-1.5 text-xs"
              data-testid="next-lesson-button"
            >
              <Link
                href={`/learn/${enrollmentId}/lessons/${nextLesson.lessonId}`}
                aria-label={`Next lesson: ${nextLesson.title}`}
              >
                <span>Next</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )
        ) : (
          <Button variant="outline" size="sm" disabled className="gap-1.5 text-xs opacity-50">
            <span>Next</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </nav>
  );
}
