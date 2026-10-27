'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, FileText, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAssessmentAttemptsQuery } from '../hooks';
import { AttemptStatus } from '../types';

interface GradingQueueViewProps {
  workspaceId: string;
  courseId: string;
  assessmentId: string;
  assessmentTitle?: string;
}

export function GradingQueueView({
  workspaceId,
  courseId,
  assessmentId,
  assessmentTitle = 'Assessment Submissions',
}: GradingQueueViewProps) {
  const [statusTab, setStatusTab] = React.useState<string>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');

  const statusParam = statusTab !== 'ALL' ? (statusTab as unknown as undefined) : undefined;

  const { data, isLoading, error, refetch } = useAssessmentAttemptsQuery(
    workspaceId,
    courseId,
    assessmentId,
    {
      status: statusParam,
    },
  );

  const rawAttempts = data?.data;
  const attempts = React.useMemo(() => rawAttempts ?? [], [rawAttempts]);

  // Filter client-side by search
  const filteredAttempts = React.useMemo(() => {
    if (!searchTerm.trim()) return attempts;
    const term = searchTerm.toLowerCase();
    return attempts.filter(
      (a) =>
        a.enrollmentId.toLowerCase().includes(term) ||
        (a.studentName && a.studentName.toLowerCase().includes(term)),
    );
  }, [attempts, searchTerm]);

  // Counts summary
  const pendingCount = attempts.filter((a) => a.status === AttemptStatus.SUBMITTED).length;
  const gradedCount = attempts.filter((a) => a.status === AttemptStatus.GRADED).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Manual Grading Queue</h1>
          <p className="text-sm text-muted-foreground">
            {assessmentTitle} — Review student responses, apply rubric scores, and finalize grades.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-1.5 self-start"
        >
          <RotateCcw className="h-4 w-4" />
          Refresh Queue
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border">
          <div className="text-xs text-muted-foreground">Total Submissions</div>
          <div className="text-2xl font-bold font-mono">{attempts.length}</div>
        </Card>
        <Card className="p-4 border bg-amber-50/30 dark:bg-amber-950/10">
          <div className="text-xs text-amber-700 dark:text-amber-400 font-medium">
            Pending Review
          </div>
          <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">
            {pendingCount}
          </div>
        </Card>
        <Card className="p-4 border bg-green-50/30 dark:bg-green-950/10">
          <div className="text-xs text-green-700 dark:text-green-400 font-medium">Graded</div>
          <div className="text-2xl font-bold font-mono text-green-700 dark:text-green-400">
            {gradedCount}
          </div>
        </Card>
        <Card className="p-4 border">
          <div className="text-xs text-muted-foreground">Filtered Results</div>
          <div className="text-2xl font-bold font-mono">{filteredAttempts.length}</div>
        </Card>
      </div>

      {/* Filter and Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Tabs value={statusTab} onValueChange={setStatusTab} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-5 h-9">
            <TabsTrigger value="ALL" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value={AttemptStatus.SUBMITTED} className="text-xs">
              Submitted
            </TabsTrigger>
            <TabsTrigger value={AttemptStatus.GRADING} className="text-xs">
              Grading
            </TabsTrigger>
            <TabsTrigger value={AttemptStatus.GRADED} className="text-xs">
              Graded
            </TabsTrigger>
            <TabsTrigger value={AttemptStatus.VOID} className="text-xs">
              Void
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search enrollment ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Table Content */}
      {isLoading ? (
        <div className="border rounded-md p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center border rounded-md bg-destructive/5 text-destructive">
          Failed to load grading queue: {error instanceof Error ? error.message : 'Error'}
        </div>
      ) : filteredAttempts.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-md">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/60 mb-2" />
          <h4 className="font-semibold text-base">No Submissions Found</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchTerm || statusTab !== 'ALL'
              ? 'No student attempts match your selected status and search criteria.'
              : 'There are currently no attempts submitted for this assessment.'}
          </p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Enrollment / Student</TableHead>
                <TableHead className="text-center">Attempt #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead className="text-right">Score / Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAttempts.map((att) => {
                const isPending = att.status === AttemptStatus.SUBMITTED;

                return (
                  <TableRow key={att.attemptId} className="hover:bg-muted/30">
                    <TableCell>
                      <div className="font-mono text-xs font-medium">
                        {att.studentName || `Enrollment (${att.enrollmentId.slice(0, 8)}...)`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        v{att.version} snapshot
                      </div>
                    </TableCell>

                    <TableCell className="text-center font-mono text-xs">#{att.number}</TableCell>

                    <TableCell>
                      {att.status === AttemptStatus.SUBMITTED && (
                        <Badge
                          variant="secondary"
                          className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        >
                          Pending Review
                        </Badge>
                      )}
                      {att.status === AttemptStatus.GRADING && (
                        <Badge variant="outline" className="text-blue-600 border-blue-400">
                          In Progress
                        </Badge>
                      )}
                      {att.status === AttemptStatus.GRADED && (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          Graded
                        </Badge>
                      )}
                      {att.status === AttemptStatus.VOID && (
                        <Badge variant="destructive">Voided</Badge>
                      )}
                      {att.status === AttemptStatus.IN_PROGRESS && (
                        <Badge variant="ghost">In Progress</Badge>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {att.submittedAt
                        ? new Date(att.submittedAt).toLocaleString()
                        : 'Not submitted'}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="font-mono text-xs font-semibold">
                        {att.awardedPoints !== null ? att.awardedPoints : '—'} / {att.totalPoints}
                      </div>
                      {att.percent !== null && (
                        <div className="text-[10px] text-muted-foreground">
                          {att.percent}% {att.passed ? '• Passed' : '• Failed'}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <Link
                        href={`/instructor/grading/${att.attemptId}?workspaceId=${workspaceId}&courseId=${courseId}&assessmentId=${assessmentId}`}
                      >
                        <Button
                          size="sm"
                          variant={isPending ? 'default' : 'outline'}
                          className="h-8 gap-1 text-xs"
                        >
                          {isPending ? 'Grade' : 'Review'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
