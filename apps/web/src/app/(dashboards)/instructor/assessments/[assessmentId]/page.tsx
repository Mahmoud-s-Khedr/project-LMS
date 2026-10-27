'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  AssessmentVersionEditor,
  useAssessmentDetailQuery,
} from '@/features/assessment-authoring';
import type { Assessment } from '@lms/shared';

interface AssessmentDetailPageProps {
  params: Promise<{ assessmentId: string }>;
}

export default function AssessmentDetailPage({ params }: AssessmentDetailPageProps) {
  const resolvedParams = React.use(params);
  const { assessmentId } = resolvedParams;

  const searchParams = useSearchParams();
  const courseIdParam = searchParams.get('courseId') || '10000000-0000-4000-8000-000000000002';

  const { activeWorkspaceId, isLoading: loadingWorkspace } = useActiveWorkspace();
  const workspaceId = activeWorkspaceId ?? 'default-ws';

  const { data: assessmentData } = useAssessmentDetailQuery(
    workspaceId,
    courseIdParam,
    assessmentId,
    { enabled: Boolean(workspaceId && assessmentId) },
  );

  // Fallback assessment model if loading from clean demo state
  const assessment: Assessment = assessmentData ?? {
    id: assessmentId,
    workspaceId,
    courseId: courseIdParam,
    lessonId: '10000000-0000-4000-8000-000000000005',
    kind: 'QUIZ',
    title: 'Consensus Algorithms Assessment',
    currentPublishedVersion: null,
    createdAt: '2026-10-26T08:00:00.000Z',
    updatedAt: '2026-10-26T08:00:00.000Z',
  };

  if (loadingWorkspace) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/instructor/assessments"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Assessments
        </Link>
      </div>

      <AssessmentVersionEditor
        workspaceId={workspaceId}
        courseId={courseIdParam}
        assessment={assessment}
        initialVersionNumber={assessment.currentPublishedVersion ?? 1}
        initialStatus={assessment.currentPublishedVersion ? 'PUBLISHED' : 'DRAFT'}
      />
    </div>
  );
}
