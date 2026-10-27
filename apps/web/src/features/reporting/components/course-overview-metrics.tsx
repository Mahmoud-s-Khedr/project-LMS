'use client';

import * as React from 'react';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AnalyticsQuery } from '@lms/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useCourseAnalyticsOverviewQuery } from '../hooks';

interface CourseOverviewMetricsProps {
  workspaceId: string;
  courseId: string;
  queryParams?: AnalyticsQuery;
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

export function CourseOverviewMetrics({
  workspaceId,
  courseId,
  queryParams,
}: CourseOverviewMetricsProps) {
  const { data, isLoading, isError, error, refetch } = useCourseAnalyticsOverviewQuery(
    workspaceId,
    courseId,
    queryParams,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="py-8 text-center text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="h-6 w-6" />
          <p className="font-medium text-sm">Failed to load course overview metrics.</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'Error'}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Enrollments</CardTitle>
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.enrollments).toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total registered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Learners</CardTitle>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.activeLearners).toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Active in range</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completions</CardTitle>
            <Award className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(data.completions).toLocaleString()}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Earned certificates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Completion Rate</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.completionRate}%</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Completed / Enrolled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">Learning Time</CardTitle>
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(data.learningSeconds)}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">Aggregated playback</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Metrics Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Daily Activity & Progress Trend ({data.daily.length} days)
        </h3>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">New Enrollments</TableHead>
                <TableHead className="text-right">Active Learners</TableHead>
                <TableHead className="text-right">Completions</TableHead>
                <TableHead className="text-right">Learning Time</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.daily.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    No daily telemetry data recorded in this timeframe.
                  </TableCell>
                </TableRow>
              ) : (
                data.daily.map((metric) => (
                  <TableRow key={metric.day} className="text-xs">
                    <TableCell className="font-mono">{metric.day}</TableCell>
                    <TableCell className="text-right font-medium">
                      {metric.newEnrollments}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {metric.activeLearners}
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {metric.completions}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatHours(metric.learningSeconds)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {metric.assessmentSubmissions}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
