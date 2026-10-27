'use client';

import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
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
import { useAddManualGrantMutation } from '../hooks';

interface ManualGrantDialogProps {
  workspaceId: string;
  courseId: string;
  enrollmentId: string | null;
  onClose: () => void;
}

export function ManualGrantDialog({
  workspaceId,
  courseId,
  enrollmentId,
  onClose,
}: ManualGrantDialogProps) {
  const [startsAt, setStartsAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [expiresAt, setExpiresAt] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const grantMutation = useAddManualGrantMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentId) return;
    if (reason.trim().length < 3) {
      setErrorMessage('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    const startIso = new Date(startsAt).toISOString();
    let expireIso: string | null = null;
    if (expiresAt) {
      expireIso = new Date(expiresAt).toISOString();
      if (Date.parse(expireIso) <= Date.parse(startIso)) {
        setErrorMessage('Grant expiry must be strictly after the start date.');
        return;
      }
    }

    try {
      setErrorMessage(null);
      await grantMutation.mutateAsync({
        workspaceId,
        courseId,
        enrollmentId,
        input: {
          startsAt: startIso,
          expiresAt: expireIso,
          reason: reason.trim(),
        },
      });
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to issue manual grant');
    }
  };

  return (
    <Dialog open={Boolean(enrollmentId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Issue Manual Access Grant</DialogTitle>
          <DialogDescription>
            Attach an independent manual access entitlement to this learner&apos;s enrollment.
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="grant-start">Starts At *</Label>
              <Input
                id="grant-start"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grant-expiry">Expires At (Optional)</Label>
              <Input
                id="grant-expiry"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="grant-reason" className="flex items-center justify-between">
              <span>Grant Reason *</span>
              <span className="text-[11px] text-muted-foreground">Required for provenance</span>
            </Label>
            <Textarea
              id="grant-reason"
              placeholder="E.g., 30-day extension granted for medical leave..."
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
              disabled={grantMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={grantMutation.isPending}>
              {grantMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Issue Grant
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
