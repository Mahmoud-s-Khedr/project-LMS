'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  Play,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useEnrollmentOutlineQuery, useEnrollmentQuery } from '../hooks';
import {
  formatDateString,
  formatDateTimeString,
  formatAccessReason,
  isAccessAllowed,
} from '../types';
import type { LearnerOutlineLesson } from '../types';

export interface EnrollmentDetailViewProps {
  enrollmentId: string;
}

function getLessonTypeIcon(type: string) {
  switch (type) {
    case 'VIDEO':
      return Video;
    case 'DOCUMENT':
    case 'TEXT':
      return FileText;
    case 'QUIZ':
    case 'EXAM':
      return Award;
    case 'LIVE_SESSION':
      return PlayCircle;
    default:
      return FileText;
  }
}

export function EnrollmentDetailView({ enrollmentId }: EnrollmentDetailViewProps) {
  const {
    data: enrollment,
    isLoading: isEnrollmentLoading,
    isError: isEnrollmentError,
    refetch: refetchEnrollment,
  } = useEnrollmentQuery(enrollmentId);

  const {
    data: outline,
    isLoading: isOutlineLoading,
    isError: isOutlineError,
  } = useEnrollmentOutlineQuery(enrollmentId);

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>({});

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  if (isEnrollmentLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-24" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-36" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isEnrollmentError || !enrollment) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center sm:p-12">
        <ShieldAlert className="size-10 text-destructive" />
        <h3 className="mt-3 text-lg font-semibold text-destructive">Enrollment Not Found</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Could not load details for enrollment ID {enrollmentId}. You may not have access to this
          enrollment.
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" size="sm" onClick={() => refetchEnrollment()}>
            <RotateCcw className="mr-2 size-3.5" />
            Retry
          </Button>
          <Button asChild size="sm">
            <Link href="/student/enrollments">Back to My Enrollments</Link>
          </Button>
        </div>
      </div>
    );
  }

  const allowed = isAccessAllowed(enrollment.access);
  const completionPercent = Math.min(
    100,
    Math.max(0, parseFloat(enrollment.completionPercent) || 0),
  );

  return (
    <div className="space-y-8">
      {/* Back button */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-xs text-muted-foreground">
          <Link href="/student/enrollments">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back to Enrollments
          </Link>
        </Button>
      </div>

      {/* Main Enrollment Header Card */}
      <Card className="border-border/80">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant={enrollment.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                {enrollment.status}
              </Badge>
              {allowed ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  Active Access
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                >
                  <Lock className="mr-1 size-3" />
                  {enrollment.access && !enrollment.access.allowed
                    ? formatAccessReason(enrollment.access.reason)
                    : 'Restricted'}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="text-xs">
                <Link href={`/student/results/${enrollment.id}`}>
                  <Sparkles className="mr-1.5 size-3.5" />
                  View Assessment Results
                </Link>
              </Button>
              {allowed && (
                <Button size="sm" asChild className="text-xs">
                  <Link href={`/learn/${enrollment.id}`}>
                    <Play className="mr-1.5 size-3.5 fill-current" />
                    Enter Course Player
                  </Link>
                </Button>
              )}
            </div>
          </div>

          <div>
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
              Course {enrollment.courseId}
            </CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="size-3.5" />
                Enrolled on {formatDateString(enrollment.enrolledAt)}
              </span>
              {enrollment.lastActivityAt && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  Last active {formatDateTimeString(enrollment.lastActivityAt)}
                </span>
              )}
              {enrollment.completedAt && (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="size-3.5" />
                  Completed on {formatDateString(enrollment.completedAt)}
                </span>
              )}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Progress Tracker */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Course Completion Progress</span>
              <span className="text-foreground font-semibold">{completionPercent.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={`h-full transition-all duration-300 ${
                  completionPercent >= 100 ? 'bg-emerald-500' : 'bg-primary'
                }`}
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>

          {/* Access Warning notice if inactive */}
          {!allowed && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    Access is currently restricted:{' '}
                    {enrollment.access && !enrollment.access.allowed
                      ? formatAccessReason(enrollment.access.reason)
                      : 'Restricted'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Your historical grades, completion records, and outline are preserved in full.
                    Active interactive lesson content and quiz taking require a valid enrollment
                    grant.
                  </p>
                  {enrollment.access &&
                    !enrollment.access.allowed &&
                    enrollment.access.unlockAt && (
                      <p className="font-medium">
                        Scheduled unlock date: {formatDateTimeString(enrollment.access.unlockAt)}
                      </p>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Grants Summary */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Access Grants & Provenance
            </h4>
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Granted On</TableHead>
                    <TableHead className="text-xs">Expires On</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollment.grants.length > 0 ? (
                    enrollment.grants.map((grant) => {
                      const isExpired = grant.expiresAt && new Date(grant.expiresAt) < new Date();
                      const isRevoked = Boolean(grant.revokedAt);
                      return (
                        <TableRow key={grant.id}>
                          <TableCell className="font-medium text-xs">
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {grant.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateString(grant.startsAt)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {grant.expiresAt
                              ? formatDateString(grant.expiresAt)
                              : 'Never (Lifetime)'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {isRevoked ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Revoked
                              </Badge>
                            ) : isExpired ? (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 text-amber-600 text-[10px]"
                              >
                                Expired
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-600 text-[10px]"
                              >
                                Active
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-xs text-muted-foreground py-4"
                      >
                        No explicit grants recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Curriculum Outline Accordion */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlayCircle className="size-5 text-primary" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              Curriculum Outline
            </h3>
          </div>
          {allowed && (
            <Button size="sm" asChild variant="outline" className="text-xs">
              <Link href={`/learn/${enrollment.id}`}>
                Resume Learning
                <ArrowRight className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          )}
        </div>

        {isOutlineLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : isOutlineError || !outline ? (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            Curriculum outline is not available for this course.
          </div>
        ) : outline.sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No sections or lessons published in this course yet.
          </div>
        ) : (
          <div className="space-y-3">
            {outline.sections.map((section, sectionIdx) => {
              const isExpanded = expandedSections[section.sectionId] !== false; // default expanded
              return (
                <div
                  key={section.sectionId}
                  className="rounded-xl border border-border/80 bg-card overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section.sectionId)}
                    className="flex w-full items-center justify-between p-4 text-left font-semibold text-sm hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-muted-foreground">
                        Section {sectionIdx + 1}
                      </span>
                      <span>{section.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{section.lessons.length} lessons</span>
                      {isExpanded ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-border/40 border-t border-border/60 bg-muted/10">
                      {section.lessons.map((lesson: LearnerOutlineLesson, lessonIdx) => {
                        const LessonIcon = getLessonTypeIcon(lesson.type);
                        const isCompleted = Boolean(lesson.completedAt);
                        const isLessonAllowed = isAccessAllowed(lesson.access);

                        return (
                          <div
                            key={lesson.lessonId}
                            className="flex items-center justify-between p-3.5 pl-6 text-xs transition-colors hover:bg-muted/20"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-[11px] text-muted-foreground w-5 shrink-0">
                                {lessonIdx + 1}.
                              </span>
                              <LessonIcon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium truncate text-foreground">
                                {lesson.title}
                              </span>
                              {lesson.isRequired && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 px-1 font-normal"
                                >
                                  Required
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {isCompleted && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]"
                                >
                                  <CheckCircle2 className="mr-1 size-3" />
                                  Completed
                                </Badge>
                              )}

                              {!isLessonAllowed && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]"
                                >
                                  <Lock className="mr-1 size-3" />
                                  {!lesson.access.allowed
                                    ? formatAccessReason(lesson.access.reason)
                                    : 'Locked'}
                                </Badge>
                              )}

                              {allowed && isLessonAllowed && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                  className="h-7 px-2 text-[11px]"
                                >
                                  <Link href={`/learn/${enrollment.id}?lesson=${lesson.lessonId}`}>
                                    Start
                                    <ChevronRight className="ml-1 size-3" />
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
