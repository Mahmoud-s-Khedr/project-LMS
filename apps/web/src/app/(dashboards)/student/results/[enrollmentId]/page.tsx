'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HistoricalResultsView } from '@/features/student';

interface StudentEnrollmentResultsPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default function StudentEnrollmentResultsPage({
  params,
}: StudentEnrollmentResultsPageProps) {
  const unwrappedParams = React.use(params);
  const { enrollmentId } = unwrappedParams;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-xs text-muted-foreground">
          <Link href="/student/results">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Gradebook
          </Link>
        </Button>
      </div>

      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Assessment Results
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Detailed graded breakdown and question feedback for enrollment {enrollmentId}.
        </p>
      </div>

      <HistoricalResultsView enrollmentId={enrollmentId} />
    </div>
  );
}
