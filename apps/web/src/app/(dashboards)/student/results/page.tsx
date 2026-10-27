'use client';

import * as React from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HistoricalResultsView, useMyEnrollmentsQuery } from '@/features/student';

export default function StudentResultsPage() {
  const { data, isLoading } = useMyEnrollmentsQuery();
  const enrollments = React.useMemo(() => data?.data || [], [data?.data]);

  const [selectedEnrollmentId, setSelectedEnrollmentId] = React.useState<string>('');

  React.useEffect(() => {
    if (enrollments.length > 0 && enrollments[0] && !selectedEnrollmentId) {
      setSelectedEnrollmentId(enrollments[0].id);
    }
  }, [enrollments, selectedEnrollmentId]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Assessment Results & Gradebook
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review your grades, quiz scores, rubric evaluations, and instructor feedback across
            courses.
          </p>
        </div>

        {enrollments.length > 0 && (
          <div className="w-full sm:w-64">
            <Select value={selectedEnrollmentId} onValueChange={setSelectedEnrollmentId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select course enrollment" />
              </SelectTrigger>
              <SelectContent>
                {enrollments.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    Course {e.courseId.slice(0, 8)}… ({e.completionPercent}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : enrollments.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-12">
            <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
              <GraduationCap className="size-8" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              No course enrollments found
            </h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Enroll in a course to take quizzes, submit assignments, and receive instructor
              evaluations.
            </p>
            <div className="mt-5">
              <Button asChild size="sm">
                <Link href="/courses">Explore Course Catalog</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <HistoricalResultsView enrollmentId={selectedEnrollmentId} />
      )}
    </div>
  );
}
