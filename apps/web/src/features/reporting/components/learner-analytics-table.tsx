'use client';

import * as React from 'react';
import { Users } from 'lucide-react';
import type { LearnerAnalyticsQuery } from '@lms/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useCourseLearnerAnalyticsQuery } from '../hooks';

interface LearnerAnalyticsTableProps {
  workspaceId: string;
  courseId: string;
  queryParams?: LearnerAnalyticsQuery;
}

function formatHours(secondsStr: string): string {
  try {
    const s = BigInt(secondsStr);
    const hrs = Number(s / 3600n);
    const mins = Number((s % 3600n) / 60n);
    if (hrs === 0 && mins === 0) return `${s.toString()}s`;
    if (hrs === 0) return `${mins}m`;
    return `${hrs}h ${mins}m`;
  } catch {
    const num = Number(secondsStr) || 0;
    const hrs = Math.floor(num / 3600);
    const mins = Math.floor((num % 3600) / 60);
    return `${hrs}h ${mins}m`;
  }
}

export function LearnerAnalyticsTable({
  workspaceId,
  courseId,
  queryParams,
}: LearnerAnalyticsTableProps) {
  const { data, isLoading, isError, refetch } = useCourseLearnerAnalyticsQuery(
    workspaceId,
    courseId,
    queryParams,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Learner Progress & Engagement
        </h3>
        <span className="text-xs text-muted-foreground">
          {data?.data.length ?? 0} active records
        </span>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Learner User ID</TableHead>
              <TableHead>Cohort</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Learning Time</TableHead>
              <TableHead>Last Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-destructive text-xs">
                  Failed to load learner analytics.{' '}
                  <Button variant="link" size="sm" onClick={() => refetch()} className="text-xs p-0 h-auto">
                    Retry
                  </Button>
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                  No learner activity registered for this period.
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((learner) => (
                <TableRow key={learner.enrollmentId} className="text-xs">
                  <TableCell className="font-mono text-muted-foreground truncate max-w-[140px]" title={learner.userId}>
                    {learner.userId}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {learner.cohortId ? `${learner.cohortId.slice(0, 8)}...` : 'Self-paced'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 w-32">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Number(learner.completionPercent))}%` }}
                        />
                      </div>
                      <span className="font-medium">{learner.completionPercent}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatHours(learner.learningSeconds)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {learner.lastActivityAt
                      ? new Date(learner.lastActivityAt).toLocaleDateString()
                      : 'Never'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
