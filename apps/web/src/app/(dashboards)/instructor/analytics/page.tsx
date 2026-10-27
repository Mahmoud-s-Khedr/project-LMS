'use client';

import * as React from 'react';
import {
  AssessmentAnalyticsCard,
  CourseOverviewMetrics,
  ExportJobsTracker,
  ExportTriggerModal,
  LearnerAnalyticsTable,
} from '@/features/reporting';
import { useActiveWorkspace } from '@/features/workspaces';
import { useStaffCoursesQuery } from '@/features/authoring';
import { BarChart3, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function InstructorAnalyticsPage() {
  const { activeWorkspaceId, isLoading: isLoadingWs } = useActiveWorkspace();

  const { data: coursesData, isLoading: isLoadingCourses } = useStaffCoursesQuery(
    activeWorkspaceId ?? '',
    {},
    { enabled: Boolean(activeWorkspaceId) },
  );

  const courses = React.useMemo(() => coursesData?.data ?? [], [coursesData?.data]);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>('');
  const [trackedExportIds, setTrackedExportIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!selectedCourseId && courses.length > 0 && courses[0]) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

  const handleExportStarted = (operationId: string) => {
    setTrackedExportIds((prev) => [operationId, ...prev]);
  };

  const handleDismissExport = (operationId: string) => {
    setTrackedExportIds((prev) => prev.filter((id) => id !== operationId));
  };

  if (isLoadingWs) {
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
        <p className="text-xs">Select an active workspace from the dashboard header to view analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Course Engagement & Performance Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authoritative enrollment completion metrics, daily telemetry trends, and assessment grading statistics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Course Selector */}
          <div className="flex items-center gap-2">
            <Label htmlFor="analytics-course-select" className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Course:
            </Label>
            {isLoadingCourses ? (
              <Skeleton className="h-9 w-44" />
            ) : courses.length > 0 ? (
              <select
                id="analytics-course-select"
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="h-9 w-48 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="analytics-course-select"
                placeholder="Course UUID..."
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="h-9 w-40 text-xs font-mono"
              />
            )}
          </div>

          <ExportTriggerModal
            workspaceId={activeWorkspaceId}
            defaultCourseId={selectedCourseId}
            onExportStarted={handleExportStarted}
          />
        </div>
      </div>

      {/* Export Jobs Poller */}
      <ExportJobsTracker
        workspaceId={activeWorkspaceId}
        operationIds={trackedExportIds}
        onDismiss={handleDismissExport}
      />

      {selectedCourseId ? (
        <div className="space-y-6">
          <CourseOverviewMetrics
            workspaceId={activeWorkspaceId}
            courseId={selectedCourseId}
          />

          <AssessmentAnalyticsCard
            workspaceId={activeWorkspaceId}
            courseId={selectedCourseId}
          />

          <LearnerAnalyticsTable
            workspaceId={activeWorkspaceId}
            courseId={selectedCourseId}
          />
        </div>
      ) : (
        <div className="p-12 text-center rounded-lg border border-dashed text-muted-foreground">
          <p className="font-medium text-foreground">No courses found in this workspace.</p>
          <p className="text-xs mt-1">Create a course in the Curriculum Builder to begin recording analytics.</p>
        </div>
      )}
    </div>
  );
}
