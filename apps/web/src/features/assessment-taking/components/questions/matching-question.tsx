'use client';

import React from 'react';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface MatchingQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'MATCHING' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'MATCHING' }>) => void;
  disabled?: boolean;
}

export function MatchingQuestion({
  question,
  value,
  onChange,
  disabled = false,
}: MatchingQuestionProps) {
  const leftOptions = question.options.filter((o) => o.group === 'LEFT');
  const rightOptions = question.options.filter((o) => o.group === 'RIGHT');

  const pairsMap = new Map<string, string>();
  for (const pair of value?.pairs ?? []) {
    pairsMap.set(pair.leftKey, pair.rightKey);
  }

  const handleMatchChange = (leftKey: string, rightKey: string) => {
    const nextMap = new Map(pairsMap);
    if (!rightKey) {
      nextMap.delete(leftKey);
    } else {
      nextMap.set(leftKey, rightKey);
    }

    const nextPairs = Array.from(nextMap.entries()).map(([l, r]) => ({
      leftKey: l,
      rightKey: r,
    }));
    onChange({ type: 'MATCHING', pairs: nextPairs });
  };

  const getOptionText = (opt: LearnerQuestion['options'][number]) => {
    return (
      opt.content?.content?.map((b) => b.content?.map((n) => n.text).join('')).join(' ') || opt.key
    );
  };

  return (
    <div className="space-y-3" data-testid="matching-question">
      <p className="text-xs text-muted-foreground">
        Match each item on the left with its corresponding item on the right:
      </p>

      <div className="space-y-2">
        {leftOptions.map((left) => {
          const matchedRight = pairsMap.get(left.key) || '';

          return (
            <div
              key={left.key}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm"
              data-testid={`match-row-${left.key}`}
            >
              <div className="flex-1 font-medium text-foreground">{getOptionText(left)}</div>

              <div className="sm:w-64">
                <select
                  value={matchedRight}
                  onChange={(e) => handleMatchChange(left.key, e.target.value)}
                  disabled={disabled}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  aria-label={`Match for ${getOptionText(left)}`}
                  data-testid={`match-select-${left.key}`}
                >
                  <option value="">-- Select a match --</option>
                  {rightOptions.map((right) => (
                    <option key={right.key} value={right.key}>
                      {getOptionText(right)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
