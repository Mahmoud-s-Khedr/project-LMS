'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import type { OperationEvent, OutboxStatus } from '@lms/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useOperationsEventsQuery, useReplayOperationEventMutation } from '../hooks';

interface OperationsEventsTableProps {
  workspaceId: string;
}

export function OperationsEventsTable({ workspaceId }: OperationsEventsTableProps) {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  const queryParams = React.useMemo(() => {
    return {
      status: statusFilter !== 'ALL' ? (statusFilter as OutboxStatus) : undefined,
    };
  }, [statusFilter]);

  const { data, isLoading, isError, error, refetch } = useOperationsEventsQuery(
    workspaceId,
    queryParams,
  );

  const [replayEvent, setReplayEvent] = React.useState<OperationEvent | null>(null);
  const [reason, setReason] = React.useState('');
  const [replayError, setReplayError] = React.useState<string | null>(null);

  const replayMutation = useReplayOperationEventMutation();

  const handleOpenReplay = (event: OperationEvent) => {
    setReplayEvent(event);
    setReason('');
    setReplayError(null);
  };

  const handleConfirmReplay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replayEvent) return;
    if (reason.trim().length < 3) {
      setReplayError('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    try {
      setReplayError(null);
      await replayMutation.mutateAsync({
        workspaceId,
        eventId: replayEvent.id,
        input: { reason: reason.trim() },
      });
      setReplayEvent(null);
    } catch (err: unknown) {
      setReplayError(err instanceof Error ? err.message : 'Failed to trigger event replay');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter events by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="DEAD">Dead Letter / Failed</option>
            <option value="PENDING">Pending</option>
            <option value="PROCESSING">Processing</option>
            <option value="PUBLISHED">Published</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Main Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Type</TableHead>
              <TableHead>Aggregate</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error Code</TableHead>
              <TableHead>Available At</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-7 w-16 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to retrieve operations outbox events.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : 'Error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500/70" />
                  <p className="font-medium">Outbox pipeline is clear.</p>
                  <p className="text-xs">No dead-lettered or stalled domain events found.</p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((evt) => (
                <TableRow key={evt.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-xs font-medium">{evt.type}</TableCell>
                  <TableCell className="text-xs">
                    <span className="font-semibold">{evt.aggregateType ?? 'Event'}</span>
                    <span className="text-muted-foreground ml-1 font-mono text-[10px]">
                      ({evt.aggregateId ? `${evt.aggregateId.slice(0, 8)}...` : '—'})
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        evt.status === 'PUBLISHED'
                          ? 'outline'
                          : evt.status === 'DEAD'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-[11px]"
                    >
                      {evt.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {evt.attempts}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-destructive">
                    {evt.errorCode ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(evt.availableAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenReplay(evt)}
                      disabled={evt.status === 'PUBLISHED'}
                      className="h-7 text-xs gap-1"
                    >
                      <RotateCw className="h-3 w-3" />
                      Replay
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Replay Confirmation Dialog */}
      <Dialog open={Boolean(replayEvent)} onOpenChange={(open) => !open && setReplayEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Replay Outbox Event</DialogTitle>
            <DialogDescription>
              Replay domain event &quot;{replayEvent?.type}&quot; for aggregate{' '}
              {replayEvent?.aggregateType} ({replayEvent?.aggregateId}).
            </DialogDescription>
          </DialogHeader>

          {replayError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{replayError}</span>
            </div>
          )}

          <form onSubmit={handleConfirmReplay} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="replay-reason" className="flex items-center justify-between">
                <span>Reason for Administrative Replay *</span>
                <span className="text-[11px] text-muted-foreground">Required for audit trail</span>
              </Label>
              <Textarea
                id="replay-reason"
                placeholder="E.g., Downstream worker was recovered; reprocessing order fulfillment..."
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
                onClick={() => setReplayEvent(null)}
                disabled={replayMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={replayMutation.isPending}>
                {replayMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Trigger Replay
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
