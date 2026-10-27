'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface TrueFalseQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'TRUE_FALSE' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'TRUE_FALSE' }>) => void;
  disabled?: boolean;
}

export function TrueFalseQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: TrueFalseQuestionProps) {
  const currentValue = value?.value ?? null;

  return (
    <fieldset
      className="grid grid-cols-2 gap-4"
      disabled={disabled}
      data-testid="true-false-question"
    >
      <legend className="sr-only">Indicate whether the statement is True or False</legend>

      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center cursor-pointer transition-all',
          currentValue === true
            ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold ring-2 ring-emerald-600'
            : 'border-border bg-card hover:bg-muted/50 text-foreground',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        data-testid="true-option-label"
      >
        <input
          type="radio"
          name={`tf-${question.attemptQuestionId}`}
          checked={currentValue === true}
          onChange={() => onChange({ type: 'TRUE_FALSE', value: true })}
          disabled={disabled}
          className="sr-only"
          data-testid="true-radio"
        />
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600">
          <Check className="h-5 w-5" />
        </div>
        <span className="text-base font-semibold">True</span>
      </label>

      <label
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border p-6 text-center cursor-pointer transition-all',
          currentValue === false
            ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 font-semibold ring-2 ring-rose-600'
            : 'border-border bg-card hover:bg-muted/50 text-foreground',
          disabled && 'cursor-not-allowed opacity-60',
        )}
        data-testid="false-option-label"
      >
        <input
          type="radio"
          name={`tf-${question.attemptQuestionId}`}
          checked={currentValue === false}
          onChange={() => onChange({ type: 'TRUE_FALSE', value: false })}
          disabled={disabled}
          className="sr-only"
          data-testid="false-radio"
        />
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600">
          <X className="h-5 w-5" />
        </div>
        <span className="text-base font-semibold">False</span>
      </label>
    </fieldset>
  );
}
