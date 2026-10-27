'use client';

import * as React from 'react';
import { AlertCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTriggerExportMutation } from '../hooks';

interface ExportTriggerModalProps {
  workspaceId: string;
  defaultCourseId?: string;
  onExportStarted: (operationId: string) => void;
}

export function ExportTriggerModal({
  workspaceId,
  defaultCourseId,
  onExportStarted,
}: ExportTriggerModalProps) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<'LEARNERS' | 'ASSESSMENTS' | 'REVENUE' | 'PROGRESS'>(
    'LEARNERS',
  );
  const [courseId, setCourseId] = React.useState(defaultCourseId ?? '');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const exportMutation = useTriggerExportMutation();

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setErrorMessage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isRevenue = kind === 'REVENUE';
    const trimmedCourseId = courseId.trim();

    if (!isRevenue && !trimmedCourseId) {
      setErrorMessage('Course ID is required for course reports');
      return;
    }

    try {
      setErrorMessage(null);
      const res = await exportMutation.mutateAsync({
        workspaceId,
        input: {
          kind,
          parameters: {
            courseId: isRevenue ? undefined : trimmedCourseId,
            from: fromDate ? new Date(fromDate).toISOString() : undefined,
            to: toDate ? new Date(toDate).toISOString() : undefined,
          },
        },
      });
      onExportStarted(res.operationId);
      handleOpenChange(false);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to enqueue export job');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
          <FileSpreadsheet className="h-4 w-4" />
          Request Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request Report Export</DialogTitle>
          <DialogDescription>
            Enqueue an asynchronous export job. You will be able to poll progress and download the
            secure signed artifact when ready.
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

        <form onSubmit={handleSubmit} noValidate className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="export-kind">Report Type</Label>
            <select
              id="export-kind"
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as 'LEARNERS' | 'ASSESSMENTS' | 'REVENUE' | 'PROGRESS')
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="LEARNERS">Learner Roster & Completion Progress</option>
              <option value="ASSESSMENTS">Assessment Attempt Scores & Statistics</option>
              <option value="REVENUE">Financial Ledger & Revenue By Currency</option>
              <option value="PROGRESS">Granular Lesson Navigation & Playback</option>
            </select>
          </div>

          {kind !== 'REVENUE' && (
            <div className="space-y-2">
              <Label htmlFor="export-courseId">Course ID (Required)</Label>
              <Input
                id="export-courseId"
                placeholder="e.g. 10000000-0000-4000-8000-000000000002"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="export-from">From Date</Label>
              <Input
                id="export-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-to">To Date</Label>
              <Input
                id="export-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={exportMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={exportMutation.isPending}>
              {exportMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enqueue Job
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
