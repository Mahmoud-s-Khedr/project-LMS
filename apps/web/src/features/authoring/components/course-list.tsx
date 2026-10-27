'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  MoreVertical,
  BookOpen,
  Calendar,
  Users,
  Settings,
  Rocket,
  Archive,
  Trash2,
  Clock,
  Send,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  useStaffCoursesQuery,
  useSubmitCourseReviewMutation,
  usePublishCourseMutation,
  useArchiveCourseMutation,
  useDeleteCourseMutation,
} from '../hooks';
import { PublishChecklistDialog } from './publish-checklist-dialog';
import type { Course, CourseStatus, StaffCoursesQuery } from '../types';

interface CourseListProps {
  workspaceId: string;
}

export function CourseList({ workspaceId }: CourseListProps) {
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [searchTerm, setSearchTerm] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const queryParams = React.useMemo(() => {
    const p: Partial<StaffCoursesQuery> = { limit: 50 };
    if (statusFilter !== 'ALL') {
      p.status = statusFilter as CourseStatus;
    }
    if (debouncedSearch.trim()) {
      p.search = debouncedSearch.trim();
    }
    return p;
  }, [statusFilter, debouncedSearch]);

  const {
    data: coursesResponse,
    isLoading,
    error,
    refetch,
  } = useStaffCoursesQuery(workspaceId, queryParams);

  const submitReviewMutation = useSubmitCourseReviewMutation(workspaceId, '');
  const publishMutation = usePublishCourseMutation(workspaceId, '');
  const archiveMutation = useArchiveCourseMutation(workspaceId, '');
  const deleteMutation = useDeleteCourseMutation(workspaceId);

  // Publish checklist modal
  const [publishTargetCourse, setPublishTargetCourse] = React.useState<Course | null>(null);

  const courses = coursesResponse?.data ?? [];

  const handleActionSubmitReview = async (course: Course) => {
    if (confirm(`Submit "${course.title}" for review?`)) {
      await submitReviewMutation.mutateAsync(course.version);
      void refetch();
    }
  };

  const handleActionArchive = async (course: Course) => {
    if (
      confirm(
        `Archive "${course.title}"? Existing learners retain access, but it will be unlisted from catalog.`,
      )
    ) {
      await archiveMutation.mutateAsync(course.version);
      void refetch();
    }
  };

  const handleActionDeleteDraft = async (course: Course) => {
    if (confirm(`Permanently delete draft "${course.title}"? This cannot be undone.`)) {
      await deleteMutation.mutateAsync(course.id);
      void refetch();
    }
  };

  const getStatusBadge = (status: CourseStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return (
          <Badge variant="default" className="bg-emerald-600 dark:bg-emerald-700 text-[10px]">
            PUBLISHED
          </Badge>
        );
      case 'IN_REVIEW':
        return (
          <Badge
            variant="outline"
            className="text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]"
          >
            IN REVIEW
          </Badge>
        );
      case 'ARCHIVED':
        return (
          <Badge variant="secondary" className="text-[10px]">
            ARCHIVED
          </Badge>
        );
      case 'DRAFT':
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            DRAFT
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Course Builder & Studio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your teaching curricula, cohort dates, staff permissions, and publishing
            lifecycle.
          </p>
        </div>

        <Button asChild className="flex items-center gap-1.5 self-start">
          <Link href="/instructor/courses/new">
            <Plus className="h-4 w-4" />
            Create Course
          </Link>
        </Button>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
          <TabsList className="h-9">
            <TabsTrigger value="ALL" className="text-xs">
              All Courses
            </TabsTrigger>
            <TabsTrigger value="DRAFT" className="text-xs">
              Drafts
            </TabsTrigger>
            <TabsTrigger value="IN_REVIEW" className="text-xs">
              In Review
            </TabsTrigger>
            <TabsTrigger value="PUBLISHED" className="text-xs">
              Published
            </TabsTrigger>
            <TabsTrigger value="ARCHIVED" className="text-xs">
              Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search courses..."
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      {/* Courses List Content */}
      {isLoading ? (
        <div
          role="status"
          className="flex flex-col items-center justify-center p-12 text-muted-foreground"
        >
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
          <p className="text-sm">Loading instructor studio courses...</p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive flex items-center justify-between"
        >
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load courses for this workspace.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      ) : courses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.map((course) => (
            <div
              key={course.id}
              className="rounded-lg border bg-card text-card-foreground shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getStatusBadge(course.status)}
                    <Badge variant="secondary" className="text-[10px]">
                      {course.deliveryMode === 'COHORT' ? 'COHORT' : 'SELF-PACED'}
                    </Badge>
                    {course.isFree && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      >
                        FREE
                      </Badge>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        aria-label="Course Actions"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/instructor/courses/${course.id}`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          Curriculum Outline
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/instructor/courses/${course.id}?tab=cohorts`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Cohort Dates & Drip
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/instructor/courses/${course.id}?tab=staff`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Staff Permissions
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/instructor/courses/${course.id}?tab=settings`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          Course Settings
                        </Link>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator />

                      {course.status === 'DRAFT' && (
                        <>
                          <DropdownMenuItem
                            onClick={() => void handleActionSubmitReview(course)}
                            className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
                          >
                            <Send className="h-3.5 w-3.5" />
                            Submit for Review
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setPublishTargetCourse(course)}
                            className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"
                          >
                            <Rocket className="h-3.5 w-3.5" />
                            Publish Course...
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleActionDeleteDraft(course)}
                            className="flex items-center gap-2 text-xs text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete Draft
                          </DropdownMenuItem>
                        </>
                      )}

                      {course.status === 'IN_REVIEW' && (
                        <DropdownMenuItem
                          onClick={() => setPublishTargetCourse(course)}
                          className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400"
                        >
                          <Rocket className="h-3.5 w-3.5" />
                          Approve & Publish...
                        </DropdownMenuItem>
                      )}

                      {course.status === 'PUBLISHED' && (
                        <DropdownMenuItem
                          onClick={() => void handleActionArchive(course)}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive Course
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div>
                  <h3 className="font-semibold text-base line-clamp-1 hover:underline">
                    <Link href={`/instructor/courses/${course.id}`}>{course.title}</Link>
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                    {course.summary || 'No summary provided.'}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {course.estimatedMinutes} min
                  </span>
                  <span>•</span>
                  <span>{course.level || 'All levels'}</span>
                  <span>•</span>
                  <span className="font-mono text-[11px]">v{course.version}</span>
                </div>
              </div>

              <div className="border-t bg-muted/20 px-5 py-3 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[150px]">
                  /{course.slug}
                </span>

                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <Link href={`/instructor/courses/${course.id}`}>Open Studio</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-3 text-base font-semibold">No Courses Found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'ALL'
              ? 'No courses match the active filters. Try clearing your search or status selection.'
              : 'Launch your teaching journey by creating your first course curriculum.'}
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link href="/instructor/courses/new">
              <Plus className="mr-1.5 h-4 w-4" />
              Create First Course
            </Link>
          </Button>
        </div>
      )}

      {/* Publish Checklist Dialog */}
      {publishTargetCourse && (
        <PublishChecklistDialog
          course={publishTargetCourse}
          sections={[]} // loaded inside or passed
          isOpen={Boolean(publishTargetCourse)}
          onOpenChange={(open) => !open && setPublishTargetCourse(null)}
          onConfirmPublish={async () => {
            if (publishTargetCourse) {
              await publishMutation.mutateAsync(publishTargetCourse.version);
              setPublishTargetCourse(null);
              void refetch();
            }
          }}
        />
      )}
    </div>
  );
}
