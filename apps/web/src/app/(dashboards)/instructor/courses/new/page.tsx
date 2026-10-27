'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useActiveWorkspace } from '@/features/workspaces';
import { CourseForm, useCreateCourseMutation } from '@/features/authoring';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { CourseCreate, CourseUpdate } from '@/features/authoring';

export default function NewCoursePage() {
  const router = useRouter();
  const { activeWorkspaceId, isLoading: isWorkspaceLoading } = useActiveWorkspace();
  const createMutation = useCreateCourseMutation(activeWorkspaceId ?? '');

  if (isWorkspaceLoading) {
    return (
      <div role="status" className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-sm">Loading workspace context...</span>
      </div>
    );
  }

  if (!activeWorkspaceId) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Please select an active workspace first to create a course.
      </div>
    );
  }

  const handleCreate = async (data: CourseCreate | CourseUpdate) => {
    const created = await createMutation.mutateAsync(data as CourseCreate);
    router.push(`/instructor/courses/${created.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Link href="/instructor/courses">
            <ArrowLeft className="h-4 w-4" />
            Back to Courses
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create New Course</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Establish foundational metadata, delivery format, and URL slug for your curriculum.
        </p>
      </div>

      <CourseForm
        workspaceId={activeWorkspaceId}
        onSubmit={handleCreate}
        isSubmitting={createMutation.isPending}
        submitLabel="Create Draft & Open Studio"
        isCreate
      />
    </div>
  );
}
