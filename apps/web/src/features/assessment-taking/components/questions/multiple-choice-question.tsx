'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface MultipleChoiceQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'MULTIPLE_CHOICE' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'MULTIPLE_CHOICE' }>) => void;
  disabled?: boolean;
}

export function MultipleChoiceQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: MultipleChoiceQuestionProps) {
  const selectedKeys = new Set(value?.optionKeys ?? []);

  const handleToggle = (key: string) => {
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange({ type: 'MULTIPLE_CHOICE', optionKeys: Array.from(next) });
  };

  return (
    <fieldset className="space-y-2.5" disabled={disabled} data-testid="multiple-choice-question">
      <legend className="text-xs text-muted-foreground mb-2">Select all options that apply:</legend>

      {question.options.map((option) => {
        const isSelected = selectedKeys.has(option.key);

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
              type="checkbox"
              value={option.key}
              checked={isSelected}
              onChange={() => handleToggle(option.key)}
              disabled={disabled}
              className="h-4 w-4 rounded text-primary focus:ring-primary"
              data-testid={`option-checkbox-${option.key}`}
            />
            <span className="flex-1 select-none leading-relaxed">{optionText}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
