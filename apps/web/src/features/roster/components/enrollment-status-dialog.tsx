'use client';

import * as React from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';
import type { Enrollment } from '@lms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateEnrollmentMutation } from '../hooks';
import { fetchStaffEnrollment } from '../api';

interface EnrollmentStatusDialogProps {
  workspaceId: string;
  courseId: string;
  enrollment: Enrollment | null;
  onClose: () => void;
}

export function EnrollmentStatusDialog({
  workspaceId,
  courseId,
  enrollment,
  onClose,
}: EnrollmentStatusDialogProps) {
  const [targetStatus, setTargetStatus] = React.useState<'ACTIVE' | 'SUSPENDED' | 'REVOKED'>(
    'ACTIVE',
  );
  const [targetCohortId, setTargetCohortId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isConflict, setIsConflict] = React.useState(false);

  const updateMutation = useUpdateEnrollmentMutation();

  React.useEffect(() => {
    if (enrollment) {
      setTargetStatus(
        enrollment.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : enrollment.status === 'REVOKED'
            ? 'REVOKED'
            : 'ACTIVE',
      );
      setTargetCohortId(enrollment.cohortId ?? '');
      setReason('');
      setErrorMessage(null);
      setIsConflict(false);
    }
  }, [enrollment]);

  const handleReload = async () => {
    if (!enrollment) return;
    try {
      const fresh = await fetchStaffEnrollment(workspaceId, courseId, enrollment.id);
      setTargetStatus(
        fresh.status === 'SUSPENDED'
          ? 'SUSPENDED'
          : fresh.status === 'REVOKED'
            ? 'REVOKED'
            : 'ACTIVE',
      );
      setTargetCohortId(fresh.cohortId ?? '');
      setReason('');
      setIsConflict(false);
      setErrorMessage(null);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollment) return;
    if (reason.trim().length < 3) {
      setErrorMessage('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    try {
      setErrorMessage(null);
      setIsConflict(false);
      await updateMutation.mutateAsync({
        workspaceId,
        courseId,
        enrollmentId: enrollment.id,
        updatedAt: enrollment.updatedAt,
        input: {
          status: targetStatus,
          cohortId: targetCohortId.trim() || null,
          reason: reason.trim(),
        },
      });
      onClose();
    } catch (err: unknown) {
      const is409 =
        (typeof err === 'object' && err !== null && (err as { status?: number }).status === 409) ||
        (err instanceof Error && /409|conflict|precondition/i.test(err.message));
      if (is409) {
        setIsConflict(true);
        setErrorMessage(
          'This enrollment was modified by another session. Please reload to review the latest changes.',
        );
      } else {
        setIsConflict(false);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to update enrollment');
      }
    }
  };

  return (
    <Dialog open={Boolean(enrollment)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Enrollment Status</DialogTitle>
          <DialogDescription>
            Modify active delivery state or move learner to a different cohort.
          </DialogDescription>
        </DialogHeader>

        {isConflict && (
          <div
            role="alert"
            className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200 flex flex-col gap-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReload}
                className="text-xs gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reload Latest Enrollment
              </Button>
            </div>
          </div>
        )}

        {errorMessage && !isConflict && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="enroll-status">Enrollment Status</Label>
            <select
              id="enroll-status"
              value={targetStatus}
              onChange={(e) =>
                setTargetStatus(e.target.value as 'ACTIVE' | 'SUSPENDED' | 'REVOKED')
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="ACTIVE">ACTIVE (Normal learning access)</option>
              <option value="SUSPENDED">SUSPENDED (Temporary freeze; progress retained)</option>
              <option value="REVOKED">REVOKED (Access terminated)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-cohort">Cohort ID (Optional)</Label>
            <Input
              id="target-cohort"
              placeholder="Leave empty for unassigned / self-paced"
              value={targetCohortId}
              onChange={(e) => setTargetCohortId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-reason" className="flex items-center justify-between">
              <span>Reason for Administrative Change *</span>
              <span className="text-[11px] text-muted-foreground">Required for audit trail</span>
            </Label>
            <Textarea
              id="status-reason"
              placeholder="E.g., Learner requested cohort transfer to Spring 2026..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
