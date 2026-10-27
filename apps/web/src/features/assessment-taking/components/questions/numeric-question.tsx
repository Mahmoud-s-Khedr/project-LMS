'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface NumericQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'NUMERIC' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'NUMERIC' }>) => void;
  disabled?: boolean;
}

export function NumericQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: NumericQuestionProps) {
  const numericString = value?.value ?? '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits, single leading minus, and single decimal point
    if (/^-?\d*\.?\d*$/.test(raw)) {
      onChange({ type: 'NUMERIC', value: raw });
    }
  };

  return (
    <div className="space-y-2 max-w-xs" data-testid="numeric-question">
      <label
        htmlFor={`numeric-${question.attemptQuestionId}`}
        className="text-xs text-muted-foreground"
      >
        Numeric value:
      </label>
      <Input
        id={`numeric-${question.attemptQuestionId}`}
        type="text"
        inputMode="decimal"
        value={numericString}
        onChange={handleChange}
        disabled={disabled}
        placeholder="e.g. 42 or 3.1415"
        className="text-sm font-mono"
        data-testid="numeric-input"
      />
      <p className="text-[11px] text-muted-foreground">
        Enter a decimal or integer number (e.g. 15.5)
      </p>
    </div>
  );
}
