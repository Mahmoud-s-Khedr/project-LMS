'use client';

import * as React from 'react';
import { Clock, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useExportOperationQuery } from '../hooks';

interface ExportJobItemProps {
  workspaceId: string;
  operationId: string;
  onDismiss?: (operationId: string) => void;
}

function ExportJobItem({ workspaceId, operationId, onDismiss }: ExportJobItemProps) {
  const { data, isLoading, isError } = useExportOperationQuery(workspaceId, operationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border bg-card text-xs">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="font-mono text-muted-foreground">{operationId.slice(0, 8)}...</span>
        </div>
        <span className="text-muted-foreground">Checking status...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs text-destructive">
        <span>Failed to poll export {operationId.slice(0, 8)}...</span>
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(operationId)}
            className="h-6 text-xs p-1"
          >
            Dismiss
          </Button>
        )}
      </div>
    );
  }

  const isReady = data.status === 'READY';
  const isFailed = data.status === 'FAILED';
  const isExpired = data.status === 'EXPIRED';
  const isPending = data.status === 'PENDING' || data.status === 'PROCESSING';

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border bg-card text-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          <span className="font-mono font-medium">{operationId}</span>
          <Badge
            variant={
              isReady ? 'outline' : isFailed ? 'destructive' : isExpired ? 'secondary' : 'default'
            }
            className={`text-[10px] ${isReady ? 'text-emerald-600 border-emerald-300' : ''}`}
          >
            {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {data.status}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Expires: {new Date(data.expiresAt).toLocaleString()} (Valid 24h)
        </p>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        {isReady && data.url && (
          <Button
            size="sm"
            asChild
            className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <a href={data.url} target="_blank" rel="noopener noreferrer" download>
              <Download className="h-3.5 w-3.5" />
              Download CSV
            </a>
          </Button>
        )}
        {onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDismiss(operationId)}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}

interface ExportJobsTrackerProps {
  workspaceId: string;
  operationIds: string[];
  onDismiss: (operationId: string) => void;
}

export function ExportJobsTracker({
  workspaceId,
  operationIds,
  onDismiss,
}: ExportJobsTrackerProps) {
  if (operationIds.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Active Export Jobs
        </CardTitle>
        <CardDescription className="text-xs">
          Asynchronous reports being rendered in the background. Artifacts automatically expire
          after 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {operationIds.map((opId) => (
          <ExportJobItem
            key={opId}
            workspaceId={workspaceId}
            operationId={opId}
            onDismiss={onDismiss}
          />
        ))}
      </CardContent>
    </Card>
  );
}
