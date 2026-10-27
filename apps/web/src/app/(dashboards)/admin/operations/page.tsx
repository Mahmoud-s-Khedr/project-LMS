'use client';

import * as React from 'react';
import { OperationsEventsTable, WebhooksTable } from '@/features/administration';
import { useActiveWorkspace } from '@/features/workspaces';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RotateCw, Webhook, Cpu } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminOperationsPage() {
  const { activeWorkspaceId, isLoading } = useActiveWorkspace();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" />
          Operations & Failure Recovery
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor transactional outbox projections and Stripe webhook inbox health. Trigger audited
          replays of stalled tasks.
        </p>
      </div>

      <Tabs defaultValue="outbox" className="space-y-4">
        <TabsList>
          <TabsTrigger value="outbox" className="gap-2">
            <RotateCw className="h-4 w-4" />
            Transactional Outbox Events
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" />
            Stripe Webhooks Inbox
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outbox" className="space-y-4">
          {activeWorkspaceId ? (
            <OperationsEventsTable workspaceId={activeWorkspaceId} />
          ) : (
            <div className="p-6 text-center text-xs text-muted-foreground border rounded-md">
              Please select an active workspace to view scoped outbox event projections.
            </div>
          )}
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-4">
          <WebhooksTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
