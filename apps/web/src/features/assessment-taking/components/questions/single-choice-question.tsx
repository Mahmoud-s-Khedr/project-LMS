'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface SingleChoiceQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'SINGLE_CHOICE' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'SINGLE_CHOICE' }>) => void;
  disabled?: boolean;
}

export function SingleChoiceQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: SingleChoiceQuestionProps) {
  const selectedKey = value?.optionKey ?? null;

  return (
    <fieldset className="space-y-2.5" disabled={disabled} data-testid="single-choice-question">
      <legend className="sr-only">Choose one option for this question</legend>

      {question.options.map((option) => {
        const isSelected = selectedKey === option.key;

        // Render option rich text content
        const optionText =
          option.content?.content?.map((b) => b.content?.map((n) => n.text).join('')).join(' ') ||
          option.key;

        return (
          <label
            key={option.key}
            className={cn(
              'flex items-center gap-3 rounded-lg border p-3.5 text-sm cursor-pointer transition-all',
              isSelected
                ? 'border-primary bg-primary/5 font-medium ring-1 ring-primary'
                : 'border-border bg-card hover:bg-muted/50 text-foreground',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            data-testid={`option-label-${option.key}`}
          >
            <input
              type="radio"
              name={`question-${question.attemptQuestionId}`}
              value={option.key}
              checked={isSelected}
              onChange={() => onChange({ type: 'SINGLE_CHOICE', optionKey: option.key })}
              disabled={disabled}
              className="h-4 w-4 text-primary focus:ring-primary"
              data-testid={`option-radio-${option.key}`}
            />
            <span className="flex-1 select-none leading-relaxed">{optionText}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
