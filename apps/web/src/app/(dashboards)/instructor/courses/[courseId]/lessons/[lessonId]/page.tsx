'use client';

import * as React from 'react';
import Link from 'next/link';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  useCourseQuery,
  useLessonQuery,
  LessonEditor,
  ConflictDialog,
  type OptimisticConflictState,
} from '@/features/authoring';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface LessonDetailPageProps {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export default function LessonDetailPage({ params }: LessonDetailPageProps) {
  const unwrappedParams = React.use(params);
  const { courseId, lessonId } = unwrappedParams;
  const { activeWorkspaceId } = useActiveWorkspace();

  const { data: course } = useCourseQuery(activeWorkspaceId ?? '', courseId);
  const {
    data: lesson,
    isLoading,
    error,
    refetch,
  } = useLessonQuery(activeWorkspaceId ?? '', courseId, lessonId);

  const [conflictState, setConflictState] = React.useState<OptimisticConflictState | null>(null);

  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-sm">Loading lesson editor...</span>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div role="alert" className="max-w-md mx-auto my-12 p-6 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-center">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <h3 className="font-semibold text-base">Lesson Not Found</h3>
        <p className="text-xs text-muted-foreground mt-1">
          This lesson does not exist in this course curriculum.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href={`/instructor/courses/${courseId}`}>Back to Course</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Link href={`/instructor/courses/${courseId}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to {course?.title ?? 'Course Outline'}
          </Link>
        </Button>
      </div>

      <LessonEditor
        workspaceId={activeWorkspaceId ?? ''}
        courseId={courseId}
        lesson={lesson}
        onConflict={setConflictState}
      />

      <ConflictDialog
        conflict={conflictState}
        onReload={() => void refetch()}
        onDismiss={() => setConflictState(null)}
      />
    </div>
  );
}
