'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { useUpsertAccommodationMutation } from '../hooks';
import type { AssessmentAccommodationItem } from '../types';

interface AccommodationsManagerProps {
  workspaceId: string;
  courseId: string;
  assessmentId: string;
  accommodations?: AssessmentAccommodationItem[];
}

export function AccommodationsManager({
  workspaceId,
  courseId,
  assessmentId,
  accommodations = [],
}: AccommodationsManagerProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [enrollmentId, setEnrollmentId] = React.useState('');
  const [extraMinutes, setExtraMinutes] = React.useState('30');
  const [extraAttempts, setExtraAttempts] = React.useState('1');
  const [availableUntil, setAvailableUntil] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const [items, setItems] = React.useState<AssessmentAccommodationItem[]>(accommodations);

  const upsertMutation = useUpsertAccommodationMutation(workspaceId, courseId, assessmentId);

  const handleOpenDialog = () => {
    setEnrollmentId('');
    setExtraMinutes('30');
    setExtraAttempts('1');
    setAvailableUntil('');
    setReason('');
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentId.trim()) {
      setFormError('Student enrollment ID is required.');
      return;
    }
    if (!reason.trim()) {
      setFormError('A documented reason is mandatory for accommodations.');
      return;
    }

    const extraSecs = (parseInt(extraMinutes, 10) || 0) * 60;
    const extraAtt = parseInt(extraAttempts, 10) || 0;

    try {
      setFormError(null);
      await upsertMutation.mutateAsync({
        enrollmentId: enrollmentId.trim(),
        input: {
          extraTimeSeconds: extraSecs,
          extraAttempts: extraAtt,
          availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
          reason: reason.trim(),
        },
      });

      // Update local state list
      const newItem: AssessmentAccommodationItem = {
        id: `acc-${Date.now()}`,
        enrollmentId: enrollmentId.trim(),
        extraTimeSeconds: extraSecs,
        extraAttempts: extraAtt,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
        reason: reason.trim(),
        grantedById: 'current-user',
      };
      setItems((prev) => [...prev.filter((i) => i.enrollmentId !== enrollmentId.trim()), newItem]);
      setDialogOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save accommodation');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-semibold">Student Accommodations</h3>
          <p className="text-xs text-muted-foreground">
            Grant individual student time extensions, additional attempts, or date overrides with
            audit reasoning.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenDialog}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Grant Accommodation
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No individual accommodations granted for this assessment.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enrollment ID</TableHead>
                <TableHead className="text-center">Extra Time</TableHead>
                <TableHead className="text-center">Extra Attempts</TableHead>
                <TableHead>Cutoff Override</TableHead>
                <TableHead>Documented Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.enrollmentId}</TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {item.extraTimeSeconds > 0
                      ? `+${Math.round(item.extraTimeSeconds / 60)} min`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    {item.extraAttempts > 0 ? `+${item.extraAttempts}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {item.availableUntil
                      ? new Date(item.availableUntil).toLocaleString()
                      : 'Default deadline'}
                  </TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{item.reason}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grant Accommodation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant Student Accommodation</DialogTitle>
            <DialogDescription>
              Overrides the standard time limit, attempts, or cutoff date for a specific enrolled
              student.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            {formError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="acc-enrollment">Student Enrollment ID</Label>
              <Input
                id="acc-enrollment"
                placeholder="UUID of course enrollment"
                value={enrollmentId}
                onChange={(e) => setEnrollmentId(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="acc-time">Extra Time (Minutes)</Label>
                <Input
                  id="acc-time"
                  type="number"
                  min="0"
                  max="1440"
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-attempts">Extra Attempts</Label>
                <Input
                  id="acc-attempts"
                  type="number"
                  min="0"
                  max="50"
                  value={extraAttempts}
                  onChange={(e) => setExtraAttempts(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-cutoff">Extended Availability Cutoff (Optional)</Label>
              <Input
                id="acc-cutoff"
                type="datetime-local"
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-reason">Documented Reason (Audited)</Label>
              <Textarea
                id="acc-reason"
                rows={2}
                placeholder="e.g. Accessibility medical exception, verified technical hardship..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={upsertMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={upsertMutation.isPending}>
                {upsertMutation.isPending ? 'Granting...' : 'Grant Accommodation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
