'use client';

import * as React from 'react';
import { RosterTable } from '@/features/roster';
import { useActiveWorkspace } from '@/features/workspaces';
import { useStaffCoursesQuery } from '@/features/authoring';
import { GraduationCap, ShieldAlert } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function InstructorLearnersPage() {
  const { activeWorkspaceId, isLoading: isLoadingWs } = useActiveWorkspace();

  const { data: coursesData, isLoading: isLoadingCourses } = useStaffCoursesQuery(
    activeWorkspaceId ?? '',
    {},
    { enabled: Boolean(activeWorkspaceId) },
  );

  const courses = React.useMemo(() => coursesData?.data ?? [], [coursesData?.data]);
  const [selectedCourseId, setSelectedCourseId] = React.useState<string>('');

  React.useEffect(() => {
    if (!selectedCourseId && courses.length > 0 && courses[0]) {
      setSelectedCourseId(courses[0].id);
    }
  }, [courses, selectedCourseId]);

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
        <p className="text-xs">
          Select an active workspace from the dashboard header to view course rosters.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Course Roster & Enrollment Management
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track student learning progress, verify effective access permissions, and issue manual
            enrollment grants.
          </p>
        </div>

        {/* Course Selector */}
        <div className="flex items-center gap-2 min-w-[240px]">
          <Label
            htmlFor="course-select"
            className="text-xs font-medium text-muted-foreground whitespace-nowrap"
          >
            Select Course:
          </Label>
          {isLoadingCourses ? (
            <Skeleton className="h-9 w-48" />
          ) : courses.length > 0 ? (
            <select
              id="course-select"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="course-select"
              placeholder="Enter Course UUID..."
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          )}
        </div>
      </div>

      {selectedCourseId ? (
        <RosterTable workspaceId={activeWorkspaceId} courseId={selectedCourseId} />
      ) : (
        <div className="p-12 text-center rounded-lg border border-dashed text-muted-foreground">
          <p className="font-medium text-foreground">No courses found in this workspace.</p>
          <p className="text-xs mt-1">
            Create a course in the Curriculum Builder to begin managing enrollments.
          </p>
        </div>
      )}
    </div>
  );
}
