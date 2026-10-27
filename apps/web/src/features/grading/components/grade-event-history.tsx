'use client';

import * as React from 'react';
import { History, Bot, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { GradeEvent, StaffAttempt } from '@lms/shared';
import { resolveGradeEventQuestion } from '../utils';

interface GradeEventHistoryProps {
  events: GradeEvent[];
  questions?: StaffAttempt['questions'];
}

export function GradeEventHistory({ events, questions }: GradeEventHistoryProps) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
        No grading history events recorded for this attempt.
      </div>
    );
  }

  // Sort descending by createdAt
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <History className="h-3.5 w-3.5" />
        Grading Audit Trail & Revision History
      </div>

      <div className="space-y-2">
        {sorted.map((ev) => {
          const matchedQuestion = resolveGradeEventQuestion(ev, questions);
          const questionIndex =
            matchedQuestion && questions
              ? questions.findIndex(
                  (q) =>
                    q.delivery.attemptQuestionId === matchedQuestion.delivery.attemptQuestionId,
                )
              : -1;

          return (
            <div
              key={ev.id}
              className="rounded-lg border p-3 bg-muted/20 text-xs space-y-1.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {questionIndex >= 0 && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      Q{questionIndex + 1}
                    </Badge>
                  )}
                  {ev.isAutomatic ? (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Bot className="h-3 w-3" /> Auto-Graded
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <User className="h-3 w-3" /> Grader (
                      {ev.gradedById ? ev.gradedById.slice(0, 8) : 'Staff'})
                    </Badge>
                  )}
                  <span className="font-mono font-bold text-foreground">
                    {ev.awardedPoints} pts
                  </span>
                  {ev.previousPoints !== null && (
                    <span className="text-muted-foreground">(was {ev.previousPoints} pts)</span>
                  )}
                </div>
                <span className="text-muted-foreground text-[10px]">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>

              {ev.reason && (
                <div className="text-foreground">
                  <span className="font-semibold text-muted-foreground">Reason:</span> {ev.reason}
                </div>
              )}

              {ev.feedback && (
                <div className="text-muted-foreground italic">&quot;{ev.feedback}&quot;</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
