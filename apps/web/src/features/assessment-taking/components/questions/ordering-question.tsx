'use client';

import React, { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface OrderingQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'ORDERING' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'ORDERING' }>) => void;
  disabled?: boolean;
}

export function OrderingQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: OrderingQuestionProps) {
  // Ordered keys initialized from value or question options
  const [orderedKeys, setOrderedKeys] = useState<string[]>(() => {
    if (value?.optionKeys && value.optionKeys.length === question.options.length) {
      return value.optionKeys;
    }
    return question.options.map((o) => o.key);
  });

  useEffect(() => {
    if (value?.optionKeys && value.optionKeys.length === question.options.length) {
      setOrderedKeys(value.optionKeys);
    }
  }, [value?.optionKeys, question.options.length]);

  const move = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderedKeys.length || disabled) return;
    const next = [...orderedKeys];
    const moved = next.splice(fromIdx, 1)[0];
    if (!moved) return;
    next.splice(toIdx, 0, moved);
    setOrderedKeys(next);
    onChange({ type: 'ORDERING', optionKeys: next });
  };

  const getOptionText = (key: string) => {
    const opt = question.options.find((o) => o.key === key);
    return (
      opt?.content?.content?.map((b) => b.content?.map((n) => n.text).join('')).join(' ') || key
    );
  };

  return (
    <div className="space-y-3" data-testid="ordering-question">
      <p className="text-xs text-muted-foreground">
        Arrange the items in the correct order using the move buttons:
      </p>

      <ul className="space-y-2">
        {orderedKeys.map((key, idx) => (
          <li
            key={key}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm shadow-xs"
            data-testid={`order-item-${key}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {idx + 1}
              </span>
              <span className="truncate font-medium text-foreground">{getOptionText(key)}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(idx, idx - 1)}
                disabled={disabled || idx === 0}
                aria-label={`Move ${getOptionText(key)} up`}
                data-testid={`move-up-${key}`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => move(idx, idx + 1)}
                disabled={disabled || idx === orderedKeys.length - 1}
                aria-label={`Move ${getOptionText(key)} down`}
                data-testid={`move-down-${key}`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
