'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveWorkspace } from '@/features/workspaces';
import { useStaffCoursesQuery } from '@/features/authoring';
import { GradingQueueView } from '@/features/grading';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function GradingQueuePage() {
  const router = useRouter();
  const { activeWorkspaceId, isLoading: loadingWorkspace } = useActiveWorkspace();

  const searchParams = useSearchParams();
  const queryCourseId = searchParams?.get('courseId') ?? '';
  const queryAssessmentId = searchParams?.get('assessmentId') ?? '';

  const [courseId, setCourseId] = React.useState(queryCourseId);
  const [assessmentId, setAssessmentId] = React.useState(queryAssessmentId);

  // Discover real courses from API for the active workspace
  const { data: coursesData, isLoading: loadingCourses } = useStaffCoursesQuery(
    activeWorkspaceId ?? '',
    {},
    { enabled: Boolean(activeWorkspaceId) },
  );
  const courses = React.useMemo(() => coursesData?.data ?? [], [coursesData?.data]);

  React.useEffect(() => {
    if (queryCourseId) {
      setCourseId(queryCourseId);
    } else if (!courseId && courses.length > 0 && courses[0]) {
      setCourseId(courses[0].id);
    }
  }, [queryCourseId, courses, courseId]);

  React.useEffect(() => {
    if (queryAssessmentId) {
      setAssessmentId(queryAssessmentId);
    }
  }, [queryAssessmentId]);

  const handleSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (courseId && assessmentId) {
      router.push(
        `/instructor/grading?courseId=${encodeURIComponent(courseId)}&assessmentId=${encodeURIComponent(assessmentId)}`,
      );
    }
  };

  if (loadingWorkspace || loadingCourses) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const workspaceId = activeWorkspaceId ?? '';
  const hasValidSelection = Boolean(queryCourseId && queryAssessmentId);

  if (!hasValidSelection) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Select Assessment for Grading</CardTitle>
            <CardDescription className="text-xs">
              Select an active course and enter the assessment ID to open the manual grading queue.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSelect} noValidate>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="grading-course-select">Course</Label>
                {courses.length > 0 ? (
                  <select
                    id="grading-course-select"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    required
                  >
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="grading-course-select"
                    placeholder="Course UUID"
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    required
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="grading-assessment-id">Assessment ID (UUID)</Label>
                <Input
                  id="grading-assessment-id"
                  placeholder="Enter assessment UUID"
                  value={assessmentId}
                  onChange={(e) => setAssessmentId(e.target.value)}
                  className="font-mono text-xs"
                  required
                />
              </div>
            </CardContent>

            <CardFooter className="flex justify-end pt-2">
              <Button type="submit" disabled={!courseId.trim() || !assessmentId.trim()}>
                Open Grading Queue
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            router.push('/instructor/grading');
          }}
          className="text-xs"
        >
          &larr; Switch Assessment
        </Button>
      </div>

      <GradingQueueView
        workspaceId={workspaceId}
        courseId={queryCourseId}
        assessmentId={queryAssessmentId}
        assessmentTitle="Assessment Grading Queue"
      />
    </div>
  );
}
