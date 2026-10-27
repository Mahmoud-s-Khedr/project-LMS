'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlusCircle, Sparkles } from 'lucide-react';
import type { Workspace } from '@lms/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateWorkspaceForm, WorkspaceChooser, useMyWorkspacesQuery } from '@/features/workspaces';

export default function OnboardingPage() {
  const router = useRouter();
  const { data: workspacesResponse, isLoading } = useMyWorkspacesQuery();
  const workspaces = workspacesResponse?.data ?? [];
  const hasWorkspaces = workspaces.length > 0;

  const [activeTab, setActiveTab] = React.useState<string>(hasWorkspaces ? 'choose' : 'create');

  React.useEffect(() => {
    if (!isLoading && !hasWorkspaces) {
      setActiveTab('create');
    }
  }, [isLoading, hasWorkspaces]);

  function handleWorkspaceCreated(workspace: Workspace) {
    if (workspace.kind === 'ACADEMY') {
      router.push('/admin');
    } else {
      router.push('/instructor');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-4 sm:py-8">
      {/* Page Header */}
      <div className="space-y-2 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>Workspace Setup &amp; Onboarding</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Create or choose your workspace
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Set up an independent instructor studio or educational academy to publish courses,
          collaborate with teaching assistants, and manage learner enrollments.
        </p>
      </div>

      {hasWorkspaces ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 rounded-xl sm:w-80">
            <TabsTrigger value="choose" className="text-xs">
              Existing Workspaces ({workspaces.length})
            </TabsTrigger>
            <TabsTrigger value="create" className="text-xs">
              Create New
            </TabsTrigger>
          </TabsList>

          <TabsContent value="choose" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Your Workspaces</h2>
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <PlusCircle className="size-3.5" aria-hidden="true" />
                <span>Add another workspace</span>
              </button>
            </div>
            <WorkspaceChooser onCreateNew={() => setActiveTab('create')} />
          </TabsContent>

          <TabsContent value="create">
            <Card className="rounded-2xl border-border">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">New Workspace</CardTitle>
                <CardDescription>
                  Configure your workspace details. You will automatically be granted owner
                  administrator permissions.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreateWorkspaceForm
                  onSuccess={handleWorkspaceCreated}
                  onCancel={() => setActiveTab('choose')}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="rounded-2xl border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Create Your First Workspace</CardTitle>
            <CardDescription>
              Configure your workspace details. You will automatically be granted owner
              administrator permissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateWorkspaceForm onSuccess={handleWorkspaceCreated} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
