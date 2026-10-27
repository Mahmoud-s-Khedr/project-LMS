'use client';

import * as React from 'react';
import { ClipboardList, Clock } from 'lucide-react';
import type { AnalyticsQuery } from '@lms/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { useCourseAssessmentAnalyticsQuery } from '../hooks';

interface AssessmentAnalyticsCardProps {
  workspaceId: string;
  courseId: string;
  queryParams?: AnalyticsQuery;
}

export function AssessmentAnalyticsCard({
  workspaceId,
  courseId,
  queryParams,
}: AssessmentAnalyticsCardProps) {
  const { data, isLoading, isError, refetch } = useCourseAssessmentAnalyticsQuery(
    workspaceId,
    courseId,
    queryParams,
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Assessment Performance & Grading Pipeline
        </CardTitle>
        <CardDescription className="text-xs">
          Completion rates, pass percentages, and manual grading backlog across course assessments.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-destructive text-xs">
            Failed to load assessment statistics.{' '}
            <Button variant="link" size="sm" onClick={() => refetch()} className="text-xs p-0 h-auto">
              Retry
            </Button>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No assessment metrics found for this course.
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assessment ID</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Passed</TableHead>
                  <TableHead className="text-right">Pass Rate</TableHead>
                  <TableHead className="text-right">Average Score</TableHead>
                  <TableHead className="text-right">Manual Grading Queue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => {
                  const attempts = Number(item.attempts);
                  const passed = Number(item.passed);
                  const awaiting = Number(item.awaitingManualGrading);
                  const passRate =
                    attempts > 0 ? ((passed / attempts) * 100).toFixed(1) : '—';

                  return (
                    <TableRow key={item.assessmentId} className="text-xs">
                      <TableCell className="font-mono text-muted-foreground truncate max-w-[140px]" title={item.assessmentId}>
                        {item.assessmentId}
                      </TableCell>
                      <TableCell className="text-right font-medium">{attempts}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">{passed}</TableCell>
                      <TableCell className="text-right font-mono">
                        {passRate !== '—' ? `${passRate}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.averagePercent ? `${item.averagePercent}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {awaiting > 0 ? (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {awaiting} Pending
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                            Clear
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
