'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Rocket,
} from 'lucide-react';
import { validateCourseForPublish } from '../utils/publish-validation';
import type { Course, SectionWithLessons } from '../types';

interface PublishChecklistDialogProps {
  course: Course;
  sections: SectionWithLessons[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmPublish: () => Promise<void>;
  isPublishing?: boolean;
}

export function PublishChecklistDialog({
  course,
  sections,
  isOpen,
  onOpenChange,
  onConfirmPublish,
  isPublishing = false,
}: PublishChecklistDialogProps) {
  const validation = React.useMemo(() => {
    return validateCourseForPublish(course, sections);
  }, [course, sections]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <DialogTitle>Publish Invariant Checklist</DialogTitle>
          </div>
          <DialogDescription className="text-left text-sm text-muted-foreground">
            Before making this course live to learners, we verify required metadata, curriculum
            integrity, and delivery rules.
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 space-y-3 max-h-[360px] overflow-y-auto pr-1">
          {/* Status summary */}
          <div
            className={`flex items-center justify-between p-3 rounded-md text-xs font-medium border ${
              validation.isValid
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}
          >
            <span>
              {validation.isValid
                ? 'All mandatory publish invariants passed!'
                : `${validation.errors.length} requirement(s) must be resolved`}
            </span>
            <Badge variant={validation.isValid ? 'default' : 'destructive'} className="text-[10px]">
              {validation.isValid ? 'READY TO PUBLISH' : 'ACTION REQUIRED'}
            </Badge>
          </div>

          {/* Validation errors */}
          {validation.errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                Blocking Issues
              </p>
              {validation.errors.map((err, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{err.field}: </span>
                    <span>{err.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {validation.warnings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Advisory Recommendations
              </p>
              {validation.warnings.map((warn, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{warn.field}: </span>
                    <span>{warn.message}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Satisfied invariants */}
          {validation.isValid && (
            <div className="space-y-1.5 pt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Verified Invariants
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Course title and summary populated</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>At least one section and published lesson</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>No protected activities exposed as free previews</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>Completion rules match lesson types</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="default"
            disabled={!validation.isValid || isPublishing}
            onClick={() => void onConfirmPublish()}
            className="flex items-center gap-2"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                Publish Course
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
