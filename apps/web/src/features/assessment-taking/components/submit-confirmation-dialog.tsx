'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SubmitConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  hasUnansweredRequired?: boolean;
}

export function SubmitConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  totalQuestions,
  answeredCount,
  unansweredCount,
  hasUnansweredRequired = false,
}: SubmitConfirmationDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" data-testid="submit-dialog-content">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {unansweredCount > 0 ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50">
                <AlertTriangle className="h-5 w-5" />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50">
                <CheckCircle className="h-5 w-5" />
              </div>
            )}
            <div>
              <DialogTitle className="text-base font-semibold">Submit Assessment?</DialogTitle>
              <DialogDescription className="text-xs">
                This action is final and will record your attempt for evaluation.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="my-3 space-y-2 rounded-lg bg-muted/40 p-3.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Answered questions:</span>
            <span className="font-semibold text-foreground">
              {answeredCount} / {totalQuestions}
            </span>
          </div>

          {unansweredCount > 0 && (
            <div className="flex justify-between text-amber-600 dark:text-amber-400">
              <span className="font-medium">Unanswered questions:</span>
              <span className="font-bold">{unansweredCount}</span>
            </div>
          )}

          {hasUnansweredRequired && (
            <p className="mt-2 text-xs font-medium text-destructive">
              Warning: Some required questions are not answered. Submitting will result in zero
              points for those items.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Review Answers
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="gap-1.5 text-xs"
            data-testid="confirm-submit-button"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <span>Submit Final Answers</span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
