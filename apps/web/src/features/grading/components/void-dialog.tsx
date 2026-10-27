'use client';

import * as React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Role } from '@lms/shared';

interface VoidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRoles?: readonly Role[];
  onConfirm: (reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function VoidDialog({
  open,
  onOpenChange,
  userRoles = [],
  onConfirm,
  isSubmitting = false,
}: VoidDialogProps) {
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  // Teaching Assistant check
  // User is TA only if they have TEACHING_ASSISTANT and DO NOT have INSTRUCTOR, ADMIN, or SUPER_ADMIN
  const isTAOnly =
    userRoles.includes(Role.TEACHING_ASSISTANT) &&
    !userRoles.includes(Role.INSTRUCTOR) &&
    !userRoles.includes(Role.ADMIN) &&
    !userRoles.includes(Role.SUPER_ADMIN);

  React.useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isTAOnly) {
      setError('Teaching Assistants are not authorized to void attempts.');
      return;
    }
    if (!reason.trim()) {
      setError('A documented reason is mandatory when voiding an attempt.');
      return;
    }

    try {
      setError(null);
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Void attempt failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Void Assessment Attempt
          </DialogTitle>
          <DialogDescription>
            Voiding preserves the attempt submission history but excludes the attempt from attempt
            limits, grade aggregation, and completion records.
          </DialogDescription>
        </DialogHeader>

        {isTAOnly ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 space-y-2 text-destructive">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShieldAlert className="h-4 w-4" /> Action Restricted
            </div>
            <p className="text-xs">
              Teaching Assistants do not have permission to void student attempts. This action
              requires Course Instructor or Administrator authority.
            </p>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="void-reason">Documented Void Reason</Label>
              <Textarea
                id="void-reason"
                rows={3}
                placeholder="e.g. Verified catastrophic browser power crash mid-exam, proctored restart authorized..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isSubmitting || !reason.trim()}>
                {isSubmitting ? 'Voiding Attempt...' : 'Confirm Void'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
