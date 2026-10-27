'use client';

import * as React from 'react';
import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EnrollmentList, useMyEnrollmentsQuery } from '@/features/student';

export default function StudentEnrollmentsPage() {
  const { data, isLoading, isError, refetch } = useMyEnrollmentsQuery();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            My Enrolled Courses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your course enrollments, track completion progress, and review active or expired
            grants.
          </p>
        </div>

        <Button asChild size="sm">
          <Link href="/courses">
            <Compass className="mr-2 size-4" />
            Explore More Courses
          </Link>
        </Button>
      </div>

      <EnrollmentList
        enrollments={data?.data}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
      />
    </div>
  );
}
