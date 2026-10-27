'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface ShortAnswerQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'SHORT_ANSWER' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'SHORT_ANSWER' }>) => void;
  disabled?: boolean;
}

export function ShortAnswerQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: ShortAnswerQuestionProps) {
  const textValue = value?.text ?? '';

  return (
    <div className="space-y-2" data-testid="short-answer-question">
      <label
        htmlFor={`short-answer-${question.attemptQuestionId}`}
        className="text-xs text-muted-foreground"
      >
        Your answer:
      </label>
      <Input
        id={`short-answer-${question.attemptQuestionId}`}
        type="text"
        value={textValue}
        onChange={(e) => onChange({ type: 'SHORT_ANSWER', text: e.target.value })}
        disabled={disabled}
        placeholder="Type your response here..."
        maxLength={10000}
        className="max-w-xl text-sm"
        data-testid="short-answer-input"
      />
      <p className="text-[11px] text-muted-foreground">{textValue.length} / 10,000 characters</p>
    </div>
  );
}
