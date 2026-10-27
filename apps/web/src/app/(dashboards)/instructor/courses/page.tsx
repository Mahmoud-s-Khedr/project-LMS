'use client';

import * as React from 'react';
import { useActiveWorkspace } from '@/features/workspaces';
import { CourseList } from '@/features/authoring';
import { Loader2, Building2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function InstructorCoursesPage() {
  const { activeWorkspaceId, isLoading } = useActiveWorkspace();

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-sm">Resolving active instructor studio workspace...</span>
      </div>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center max-w-md mx-auto my-12">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground/60" />
        <h3 className="mt-3 text-base font-semibold">No Workspace Selected</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          You need an active teaching studio or academy workspace to build and publish courses.
        </p>
        <Button asChild className="mt-4" size="sm">
          <Link href="/onboarding">Choose or Create Workspace</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CourseList workspaceId={activeWorkspaceId} />
    </div>
  );
}
