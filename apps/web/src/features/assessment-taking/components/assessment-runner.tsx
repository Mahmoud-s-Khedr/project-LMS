'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AssessmentTimer } from './assessment-timer';
import { AutosaveIndicator } from './autosave-indicator';
import { QuestionPalette } from './question-palette';
import { QuestionCard } from './question-card';
import { SubmitConfirmationDialog } from './submit-confirmation-dialog';
import { useSubmitAttemptMutation, saveAnswer, fetchAttempt } from '../index';
import { ApiError } from '@/lib/api';
import type {
  LearnerAttempt,
  LearnerAssessment,
  SavedAnswer,
  QuestionResponse,
  AutosaveStatus,
} from '../types';

interface AssessmentRunnerProps {
  attempt: LearnerAttempt;
  assessment: LearnerAssessment;
  workspaceId: string;
  enrollmentId: string;
  onSubmitted: () => void;
}

export function AssessmentRunner({
  attempt,
  assessment,
  workspaceId,
  enrollmentId: _enrollmentId,
  onSubmitted,
}: AssessmentRunnerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Initialize answers map from attempt.answers
  const [answersMap, setAnswersMap] = useState<Map<string, SavedAnswer | null>>(() => {
    const map = new Map<string, SavedAnswer | null>();
    for (const q of attempt.questions) {
      const existing = attempt.answers.find((a) => a.attemptQuestionId === q.attemptQuestionId);
      map.set(q.attemptQuestionId, existing ?? null);
    }
    return map;
  });

  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('IDLE');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);

  const currentQuestion = attempt.questions[currentIndex];
  const submitMutation = useSubmitAttemptMutation(attempt.attemptId);

  // Autosave answer handler
  const handleAnswerChange = useCallback(
    async (response: QuestionResponse, attachmentIds?: string[]) => {
      if (!currentQuestion) return;
      const qId = currentQuestion.attemptQuestionId;

      // Update local UI state optimistically
      setAnswersMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(qId);
        next.set(qId, {
          attemptQuestionId: qId,
          version: existing ? existing.version : 1,
          response,
          attachmentIds: attachmentIds ?? existing?.attachmentIds ?? [],
          savedAt: new Date().toISOString(),
        });
        return next;
      });

      setAutosaveStatus('SAVING');
      try {
        const currentAns = answersMap.get(qId);
        const expectedVersion = currentAns ? currentAns.version : 1;

        const saved = await saveAnswer(attempt.attemptId, qId, {
          version: expectedVersion,
          response,
          attachmentIds,
        });

        setAnswersMap((prev) => {
          const next = new Map(prev);
          next.set(qId, saved);
          return next;
        });
        setLastSavedAt(saved.savedAt);
        setAutosaveStatus('SAVED');
      } catch (err: unknown) {
        if (!navigator.onLine) {
          setAutosaveStatus('OFFLINE');
        } else if (err instanceof ApiError && err.status === 409) {
          setAutosaveStatus('CONFLICT');
        } else {
          setAutosaveStatus('ERROR');
        }
      }
    },
    [currentQuestion, answersMap, attempt.attemptId],
  );

  const toggleFlag = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.attemptQuestionId;
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleFinalSubmit = useCallback(async () => {
    try {
      await submitMutation.mutateAsync();
      setIsSubmitDialogOpen(false);
      onSubmitted();
    } catch (err) {
      console.error('Failed to submit attempt:', err);
    }
  }, [submitMutation, onSubmitted]);

  // Auto-submit when server deadline expires
  const handleTimeExpire = useCallback(() => {
    void handleFinalSubmit();
  }, [handleFinalSubmit]);

  // Compute answered and unanswered counts
  const answeredCount = useMemo(() => {
    let count = 0;
    for (const q of attempt.questions) {
      if (answersMap.get(q.attemptQuestionId)?.response) count++;
    }
    return count;
  }, [attempt.questions, answersMap]);

  const unansweredCount = attempt.questions.length - answeredCount;

  const hasUnansweredRequired = useMemo(() => {
    return attempt.questions.some(
      (q) => q.isRequired && !answersMap.get(q.attemptQuestionId)?.response,
    );
  }, [attempt.questions, answersMap]);

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto py-4" data-testid="assessment-runner">
      {/* Top Banner: Title, Timer, Autosave Status, and Submit Button */}
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-3.5 backdrop-blur shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {assessment.kind}:
          </span>
          <h2 className="text-sm font-bold text-foreground truncate max-w-xs md:max-w-md">
            {assessment.title}
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <AutosaveIndicator status={autosaveStatus} lastSavedAt={lastSavedAt} />

          {/* Strict countdown deriving from server deadline */}
          <AssessmentTimer deadlineAt={attempt.deadlineAt} onExpire={handleTimeExpire} />

          <Button
            size="sm"
            onClick={() => setIsSubmitDialogOpen(true)}
            className="gap-1.5 text-xs font-semibold"
            data-testid="submit-attempt-button"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Submit</span>
          </Button>
        </div>
      </div>

      {/* Main Layout: Question viewport and Question Palette */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Question Viewport */}
        <div className="lg:col-span-3 space-y-4">
          {autosaveStatus === 'CONFLICT' && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between"
            >
              <span>Answer version conflict: This question response was modified elsewhere.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    const refreshed = await fetchAttempt(attempt.attemptId);
                    if (currentQuestion) {
                      const ans = refreshed.answers.find(
                        (a) => a.attemptQuestionId === currentQuestion.attemptQuestionId,
                      );
                      setAnswersMap((prev) => {
                        const next = new Map(prev);
                        next.set(currentQuestion.attemptQuestionId, ans ?? null);
                        return next;
                      });
                    }
                    setAutosaveStatus('IDLE');
                  } catch {
                    // ignore
                  }
                }}
                className="h-7 text-xs"
              >
                Reload Answer
              </Button>
            </div>
          )}

          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              index={currentIndex}
              totalQuestions={attempt.questions.length}
              attemptId={attempt.attemptId}
              workspaceId={workspaceId}
              currentAnswer={answersMap.get(currentQuestion.attemptQuestionId)}
              isFlagged={flaggedIds.has(currentQuestion.attemptQuestionId)}
              onToggleFlag={toggleFlag}
              onAnswerChange={handleAnswerChange}
              allowedFileTypes={assessment.allowedFileTypes}
              maxUploadBytes={assessment.maxUploadBytes}
              maxFiles={assessment.maxFiles}
            />
          )}

          {/* Question Stepper Navigation */}
          <div className="flex items-center justify-between border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIndex((idx) => Math.max(0, idx - 1))}
              disabled={currentIndex === 0}
              className="gap-1 text-xs"
              data-testid="prev-question-button"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Previous</span>
            </Button>

            <span className="text-xs text-muted-foreground">
              {currentIndex + 1} of {attempt.questions.length}
            </span>

            <Button
              variant="default"
              size="sm"
              onClick={() =>
                setCurrentIndex((idx) => Math.min(attempt.questions.length - 1, idx + 1))
              }
              disabled={currentIndex === attempt.questions.length - 1}
              className="gap-1 text-xs"
              data-testid="next-question-button"
            >
              <span>Next</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Sidebar Palette */}
        <div className="lg:col-span-1">
          <div className="sticky top-32">
            <QuestionPalette
              questions={attempt.questions}
              answers={answersMap}
              flaggedIds={flaggedIds}
              currentIndex={currentIndex}
              onSelectIndex={setCurrentIndex}
            />
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <SubmitConfirmationDialog
        isOpen={isSubmitDialogOpen}
        onClose={() => setIsSubmitDialogOpen(false)}
        onConfirm={handleFinalSubmit}
        isSubmitting={submitMutation.isPending}
        totalQuestions={attempt.questions.length}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        hasUnansweredRequired={hasUnansweredRequired}
      />
    </div>
  );
}
