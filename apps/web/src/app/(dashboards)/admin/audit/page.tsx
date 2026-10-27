'use client';

import * as React from 'react';
import { AuditLogsTable } from '@/features/administration';
import { useActiveWorkspace } from '@/features/workspaces';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminAuditPage() {
  const { activeWorkspace, activeWorkspaceId, isLoading } = useActiveWorkspace();

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
        <p className="text-xs">Select a workspace from the dashboard header to view its immutable audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Audit Trail ({activeWorkspace?.name ?? 'Workspace'})
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cryptographically attributed audit entries for administrative role changes, revocations, and operational modifications.
        </p>
      </div>

      <AuditLogsTable workspaceId={activeWorkspaceId} />
    </div>
  );
}
