'use client';

import * as React from 'react';
import { AlertCircle, RefreshCw, RotateCw, Webhook as WebhookIcon } from 'lucide-react';
import type { WebhookStatus } from '@lms/shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useReplayWebhookMutation, useWebhooksQuery } from '../hooks';

export function WebhooksTable() {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const pageSize = 10;

  const queryParams = React.useMemo(() => {
    return {
      page,
      pageSize,
      status: statusFilter !== 'ALL' ? (statusFilter as WebhookStatus) : undefined,
    };
  }, [page, pageSize, statusFilter]);

  const { data, isLoading, isError, error, refetch } = useWebhooksQuery(queryParams);
  const replayMutation = useReplayWebhookMutation();

  const handleReplay = async (webhookId: string) => {
    if (!confirm('Replay this Stripe webhook event through the ingestion pipeline?')) return;
    try {
      await replayMutation.mutateAsync({ webhookId });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to replay webhook');
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-md border border-input bg-background px-2.5 py-0.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter webhooks by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="PROCESSED">Processed</option>
            <option value="FAILED">Failed</option>
            <option value="RECEIVED">Received</option>
            <option value="PROCESSING">Processing</option>
          </select>
        </div>

        <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 gap-1 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Webhooks Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Error Code</TableHead>
              <TableHead>Received At</TableHead>
              <TableHead>Processed At</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
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
                    <p className="font-medium">Failed to retrieve webhook events.</p>
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
                  <WebhookIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="font-medium">No webhook events in inbox.</p>
                  <p className="text-xs">
                    Stripe webhook receipts and signatures will be listed here.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((hook) => (
                <TableRow key={hook.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-xs font-medium">{hook.type}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        hook.status === 'PROCESSED'
                          ? 'outline'
                          : hook.status === 'FAILED'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-[11px]"
                    >
                      {hook.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {hook.attempts}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-destructive">
                    {hook.errorCode ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(hook.receivedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {hook.processedAt ? new Date(hook.processedAt).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReplay(hook.id)}
                      disabled={replayMutation.isPending}
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
    </div>
  );
}
