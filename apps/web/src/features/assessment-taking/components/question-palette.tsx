'use client';

import React from 'react';
import { Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LearnerQuestion, SavedAnswer } from '../types';

interface QuestionPaletteProps {
  questions: LearnerQuestion[];
  answers: Map<string, SavedAnswer | null>;
  flaggedIds: Set<string>;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  className?: string;
}

export function QuestionPalette({
  questions,
  answers,
  flaggedIds,
  currentIndex,
  onSelectIndex,
  className,
}: QuestionPaletteProps) {
  const answeredCount = questions.filter((q) => {
    const ans = answers.get(q.attemptQuestionId);
    return Boolean(ans && ans.response);
  }).length;

  return (
    <div
      className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs', className)}
      data-testid="question-palette"
    >
      <div className="flex items-center justify-between border-b pb-2">
        <h4 className="text-xs font-semibold text-foreground">Questions</h4>
        <span className="text-[11px] font-medium text-muted-foreground">
          {answeredCount} of {questions.length} answered
        </span>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 md:grid-cols-5">
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = Boolean(answers.get(q.attemptQuestionId)?.response);
          const isFlagged = flaggedIds.has(q.attemptQuestionId);

          return (
            <button
              key={q.attemptQuestionId}
              type="button"
              onClick={() => onSelectIndex(idx)}
              className={cn(
                'relative flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-all',
                isCurrent && 'ring-2 ring-primary ring-offset-2 ring-offset-background font-bold',
                isAnswered
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border border-input bg-background hover:bg-muted text-foreground',
              )}
              aria-label={`Go to question ${idx + 1}${isAnswered ? ', answered' : ', unanswered'}${isFlagged ? ', flagged' : ''}`}
              aria-current={isCurrent ? 'true' : undefined}
              data-testid={`palette-question-${idx + 1}`}
            >
              <span>{idx + 1}</span>
              {isFlagged && (
                <span
                  className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-white"
                  title="Flagged for review"
                >
                  <Flag className="h-2 w-2 fill-current" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          <span>Answered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm border border-input" />
          <span>Unanswered</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          <span>Flagged</span>
        </div>
      </div>
    </div>
  );
}
