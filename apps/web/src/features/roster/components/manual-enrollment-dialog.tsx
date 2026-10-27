'use client';

import * as React from 'react';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCreateManualEnrollmentMutation } from '../hooks';

interface ManualEnrollmentDialogProps {
  workspaceId: string;
  courseId: string;
}

export function ManualEnrollmentDialog({
  workspaceId,
  courseId,
}: ManualEnrollmentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [userId, setUserId] = React.useState('');
  const [cohortId, setCohortId] = React.useState('');
  const [startsAt, setStartsAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const enrollMutation = useCreateManualEnrollmentMutation();

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setUserId('');
      setCohortId('');
      setStartsAt(new Date().toISOString().slice(0, 16));
      setExpiresAt('');
      setReason('');
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      setErrorMessage('Student User ID is required.');
      return;
    }
    if (reason.trim().length < 3) {
      setErrorMessage('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    const startIso = new Date(startsAt).toISOString();
    let expireIso: string | null = null;
    if (expiresAt) {
      expireIso = new Date(expiresAt).toISOString();
      if (Date.parse(expireIso) <= Date.parse(startIso)) {
        setErrorMessage('Access expiry date must be strictly after the start date.');
        return;
      }
    }

    try {
      setErrorMessage(null);
      await enrollMutation.mutateAsync({
        workspaceId,
        courseId,
        input: {
          userId: userId.trim(),
          cohortId: cohortId.trim() || undefined,
          startsAt: startIso,
          expiresAt: expireIso,
          reason: reason.trim(),
        },
      });
      handleOpenChange(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create manual enrollment');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Enroll Learner
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manual Learner Enrollment</DialogTitle>
          <DialogDescription>
            Grant direct course access with an audited MANUAL grant.
          </DialogDescription>
        </DialogHeader>

        {errorMessage && (
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
            <Label htmlFor="enroll-userId">Learner User ID *</Label>
            <Input
              id="enroll-userId"
              placeholder="e.g. 10000000-0000-4000-8000-000000000004"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="font-mono text-xs"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="enroll-cohortId">Cohort ID (Optional)</Label>
            <Input
              id="enroll-cohortId"
              placeholder="Leave empty for self-paced"
              value={cohortId}
              onChange={(e) => setCohortId(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="enroll-start">Starts At *</Label>
              <Input
                id="enroll-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="enroll-expiry">Expires At (Optional)</Label>
              <Input
                id="enroll-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="enroll-reason" className="flex items-center justify-between">
              <span>Justification Reason *</span>
              <span className="text-[11px] text-muted-foreground">Required for audit</span>
            </Label>
            <Textarea
              id="enroll-reason"
              placeholder="E.g., Scholarship recipient cohort 4, manual bank transfer confirmed..."
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
              onClick={() => handleOpenChange(false)}
              disabled={enrollMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={enrollMutation.isPending}>
              {enrollMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Enrollment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
