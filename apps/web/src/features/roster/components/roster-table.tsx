'use client';

import * as React from 'react';
import {
  AlertCircle,
  GraduationCap,
  KeyRound,
  Lock,
  MoreVertical,
  Search,
  Unlock,
  UserCog,
  Users,
} from 'lucide-react';
import type { Enrollment, EnrollmentStatus } from '@lms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseEnrollmentsQuery } from '../hooks';
import { LearnerDetailDialog } from './learner-detail-dialog';
import { ManualEnrollmentDialog } from './manual-enrollment-dialog';
import { ManualGrantDialog } from './manual-grant-dialog';
import { EnrollmentStatusDialog } from './enrollment-status-dialog';

interface RosterTableProps {
  workspaceId: string;
  courseId: string;
}

export function RosterTable({ workspaceId, courseId }: RosterTableProps) {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [cohortFilter, setCohortFilter] = React.useState<string>('');
  const [userSearch, setUserSearch] = React.useState<string>('');

  const queryParams = React.useMemo(() => {
    return {
      status: statusFilter !== 'ALL' ? (statusFilter as EnrollmentStatus) : undefined,
      cohortId: cohortFilter.trim() || undefined,
      userId: userSearch.trim() || undefined,
    };
  }, [statusFilter, cohortFilter, userSearch]);

  const { data, isLoading, isError, error, refetch } = useCourseEnrollmentsQuery(
    workspaceId,
    courseId,
    queryParams,
  );

  // Dialog states
  const [detailEnrollmentId, setDetailEnrollmentId] = React.useState<string | null>(null);
  const [grantEnrollmentId, setGrantEnrollmentId] = React.useState<string | null>(null);
  const [statusEnrollment, setStatusEnrollment] = React.useState<Enrollment | null>(null);

  return (
    <div className="space-y-4">
      {/* Filters & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by learner user ID..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by enrollment status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
          </select>

          <Input
            placeholder="Filter cohort ID..."
            value={cohortFilter}
            onChange={(e) => setCohortFilter(e.target.value)}
            className="w-36 h-9 text-xs font-mono"
          />
        </div>

        <div className="flex items-center gap-2">
          <ManualEnrollmentDialog workspaceId={workspaceId} courseId={courseId} />
        </div>
      </div>

      {/* Main Roster Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Learner User ID</TableHead>
              <TableHead>Cohort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Effective Access</TableHead>
              <TableHead>Enrolled At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-8 w-12 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to load course roster.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : 'Error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <GraduationCap className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="font-medium">No enrolled learners found.</p>
                  <p className="text-xs">Learners enrolled via purchases or manual grants will appear here.</p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((enrollment) => (
                <TableRow key={enrollment.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-xs font-medium">
                    {enrollment.userId}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {enrollment.cohortId ? enrollment.cohortId.slice(0, 8) + '...' : 'Self-paced'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        enrollment.status === 'ACTIVE'
                          ? 'outline'
                          : enrollment.status === 'SUSPENDED'
                            ? 'secondary'
                            : 'destructive'
                      }
                      className="text-[11px]"
                    >
                      {enrollment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 w-32">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, Number(enrollment.completionPercent))}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-foreground whitespace-nowrap">
                        {enrollment.completionPercent}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {enrollment.access.allowed ? (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 gap-1">
                        <Unlock className="h-2.5 w-2.5" /> Allowed
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <Lock className="h-2.5 w-2.5" /> Locked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(enrollment.enrolledAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Roster actions">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDetailEnrollmentId(enrollment.id)}>
                          <Users className="mr-2 h-4 w-4" />
                          View Provenance & Progress
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setGrantEnrollmentId(enrollment.id)}>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Issue Manual Grant
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setStatusEnrollment(enrollment)}>
                          <UserCog className="mr-2 h-4 w-4" />
                          Change Status / Cohort
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Subdialogs */}
      <LearnerDetailDialog
        workspaceId={workspaceId}
        courseId={courseId}
        enrollmentId={detailEnrollmentId}
        onClose={() => setDetailEnrollmentId(null)}
        onAddGrant={(id) => {
          setDetailEnrollmentId(null);
          setGrantEnrollmentId(id);
        }}
      />

      <ManualGrantDialog
        workspaceId={workspaceId}
        courseId={courseId}
        enrollmentId={grantEnrollmentId}
        onClose={() => setGrantEnrollmentId(null)}
      />

      <EnrollmentStatusDialog
        workspaceId={workspaceId}
        courseId={courseId}
        enrollment={statusEnrollment}
        onClose={() => setStatusEnrollment(null)}
      />
    </div>
  );
}
