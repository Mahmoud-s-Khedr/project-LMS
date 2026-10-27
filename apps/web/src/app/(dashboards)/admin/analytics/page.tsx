'use client';

import * as React from 'react';
import { ExportJobsTracker, ExportTriggerModal, RevenueAnalyticsCard } from '@/features/reporting';
import { useActiveWorkspace } from '@/features/workspaces';
import { BarChart3, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminAnalyticsPage() {
  const { activeWorkspace, activeWorkspaceId, isLoading } = useActiveWorkspace();
  const [trackedExportIds, setTrackedExportIds] = React.useState<string[]>([]);

  const handleExportStarted = (operationId: string) => {
    setTrackedExportIds((prev) => [operationId, ...prev]);
  };

  const handleDismissExport = (operationId: string) => {
    setTrackedExportIds((prev) => prev.filter((id) => id !== operationId));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <div className="p-8 text-center rounded-lg border border-dashed text-muted-foreground flex flex-col items-center gap-2">
        <ShieldAlert className="h-8 w-8 text-amber-500" />
        <p className="font-semibold text-foreground">No active workspace selected</p>
        <p className="text-xs">
          Select a workspace from the dashboard header to view revenue metrics and trigger reports.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Financial Ledger & Analytics ({activeWorkspace?.name ?? 'Workspace'})
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative multi-currency revenue totals, refund reconciliation, and asynchronous
            report generation.
          </p>
        </div>

        <ExportTriggerModal workspaceId={activeWorkspaceId} onExportStarted={handleExportStarted} />
      </div>

      {/* Export Jobs Poller */}
      <ExportJobsTracker
        workspaceId={activeWorkspaceId}
        operationIds={trackedExportIds}
        onDismiss={handleDismissExport}
      />

      {/* Revenue Card */}
      <RevenueAnalyticsCard workspaceId={activeWorkspaceId} />
    </div>
  );
}
