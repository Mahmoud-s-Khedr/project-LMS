import Link from 'next/link';
import { ArrowRight, BookOpen, Compass, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EnrollmentCard } from './enrollment-card';
import type { Enrollment } from '../types';
import { isAccessAllowed } from '../types';

export interface ContinueLearningSectionProps {
  enrollments?: Enrollment[];
  isLoading?: boolean;
}

export function ContinueLearningSection({
  enrollments = [],
  isLoading,
}: ContinueLearningSectionProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-2 w-full" />
                <div className="flex justify-between pt-3">
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Filter for in-progress courses with active access
  const inProgressCourses = enrollments.filter((e) => {
    const percent = parseFloat(e.completionPercent) || 0;
    return percent < 100 && e.status === 'ACTIVE' && isAccessAllowed(e.access);
  });

  if (inProgressCourses.length === 0) {
    // If learner has completed courses or no in-progress courses
    const hasAnyEnrollments = enrollments.length > 0;
    return (
      <Card className="border-dashed border-border/80 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-10">
          <div className="rounded-2xl bg-primary/10 p-4 text-primary">
            {hasAnyEnrollments ? (
              <BookOpen className="size-8" aria-hidden="true" />
            ) : (
              <Compass className="size-8" aria-hidden="true" />
            )}
          </div>
          <h3 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
            {hasAnyEnrollments
              ? 'All caught up on active courses!'
              : 'You have not enrolled in any courses yet'}
          </h3>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            {hasAnyEnrollments
              ? 'Great job! You have completed all active courses or have no pending assignments. Browse the catalog for your next learning journey.'
              : 'Explore our catalog of professional and cohort courses to start learning today.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild size="sm">
              <Link href="/courses">
                <Compass className="mr-2 size-4" />
                Browse Course Catalog
              </Link>
            </Button>
            {hasAnyEnrollments && (
              <Button asChild variant="outline" size="sm">
                <Link href="/student/enrollments">View All Enrollments</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PlayCircle className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Continue Learning
          </h2>
        </div>
        <Button variant="ghost" size="sm" asChild className="text-xs">
          <Link href="/student/enrollments">
            View All ({enrollments.length})
            <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {inProgressCourses.slice(0, 3).map((enrollment) => (
          <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
        ))}
      </div>
    </div>
  );
}
