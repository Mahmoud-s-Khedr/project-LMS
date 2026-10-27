'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useActiveWorkspace } from '@/features/workspaces';
import { useMeQuery } from '@/features/auth';
import { AttemptGradingView } from '@/features/grading';
import { Skeleton } from '@/components/ui/skeleton';
import { extractEffectiveRoles } from '@/features/shell';
import { Role } from '@lms/shared';

interface AttemptDetailPageProps {
  params: Promise<{ attemptId: string }>;
}

export default function AttemptDetailPage({ params }: AttemptDetailPageProps) {
  const resolvedParams = React.use(params);
  const { attemptId } = resolvedParams;

  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId') || '10000000-0000-4000-8000-000000000002';
  const assessmentId = searchParams.get('assessmentId') || '10000000-0000-4000-8000-000000000007';

  const { activeWorkspaceId, isLoading: loadingWorkspace } = useActiveWorkspace();
  const { data: meData } = useMeQuery();

  const userRoles = React.useMemo(() => {
    return extractEffectiveRoles(meData);
  }, [meData]);

  const workspaceId = activeWorkspaceId ?? 'default-ws';

  if (loadingWorkspace) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <AttemptGradingView
        workspaceId={workspaceId}
        courseId={courseId}
        assessmentId={assessmentId}
        attemptId={attemptId}
        userRoles={userRoles.length > 0 ? userRoles : [Role.INSTRUCTOR]}
      />
    </div>
  );
}
