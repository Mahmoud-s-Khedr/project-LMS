'use client';

import * as React from 'react';
import { useActiveWorkspace } from '@/features/workspaces';
import { QuestionBanksList } from '@/features/assessment-authoring';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

export default function QuestionBanksPage() {
  const { activeWorkspaceId, isLoading } = useActiveWorkspace();

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <Card className="max-w-md mx-auto p-8 text-center border-dashed mt-8">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
        <h3 className="font-semibold text-base">No Active Workspace</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Select or create an instructor workspace in the navigation sidebar to manage question banks.
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6">
      <QuestionBanksList workspaceId={activeWorkspaceId} />
    </div>
  );
}
