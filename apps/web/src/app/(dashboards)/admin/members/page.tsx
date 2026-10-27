'use client';

import * as React from 'react';
import { MembersTable } from '@/features/administration';
import { useActiveWorkspace } from '@/features/workspaces';
import { Users2, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminMembersPage() {
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
        <p className="text-xs">
          Select or switch to a workspace from the dashboard header to manage its staff.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users2 className="h-6 w-6 text-primary" />
          Workspace Team & Staff ({activeWorkspace?.name ?? 'Workspace'})
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite instructors, teaching assistants, or co-administrators to collaborate within this
          tenant.
        </p>
      </div>

      <MembersTable workspaceId={activeWorkspaceId} />
    </div>
  );
}
