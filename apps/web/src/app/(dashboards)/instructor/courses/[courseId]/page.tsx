'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  useCourseQuery,
  useCourseSectionsQuery,
  useUpdateCourseMutation,
  useSubmitCourseReviewMutation,
  usePublishCourseMutation,
  useArchiveCourseMutation,
  CurriculumBuilder,
  LessonEditor,
  CohortManager,
  StaffManager,
  CourseForm,
  PublishChecklistDialog,
  ConflictDialog,
  type OptimisticConflictState,
  type Lesson,
  type SectionWithLessons,
  type CourseUpdate,
} from '@/features/authoring';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Users,
  Settings,
  Rocket,
  Send,
  Archive,
  Loader2,
  AlertCircle,
  Eye,
} from 'lucide-react';

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>;
}

export default function CourseDetailPage({ params }: CourseDetailPageProps) {
  const unwrappedParams = React.use(params);
  const courseId = unwrappedParams.courseId;

  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'curriculum';
  const [activeTab, setActiveTab] = React.useState(initialTab);

  const { activeWorkspaceId } = useActiveWorkspace();

  const {
    data: course,
    isLoading: isCourseLoading,
    error: courseError,
    refetch: refetchCourse,
  } = useCourseQuery(activeWorkspaceId ?? '', courseId);

  const {
    data: rawSections,
    refetch: refetchSections,
  } = useCourseSectionsQuery(activeWorkspaceId ?? '', courseId);

  const sections: SectionWithLessons[] = React.useMemo(() => {
    if (!rawSections) return [];
    return rawSections.map((sec) => ({
      ...sec,
      lessons: (sec as { lessons?: Lesson[] }).lessons ?? [],
    }));
  }, [rawSections]);

  // Selected lesson for authoring inside curriculum tab
  const [selectedLesson, setSelectedLesson] = React.useState<Lesson | null>(null);

  // Optimistic concurrency conflict dialog
  const [conflictState, setConflictState] = React.useState<OptimisticConflictState | null>(null);

  // Publish checklist dialog
  const [isPublishDialogOpen, setIsPublishDialogOpen] = React.useState(false);

  // Mutations
  const updateCourseMutation = useUpdateCourseMutation(
    activeWorkspaceId ?? '',
    courseId,
    setConflictState,
  );
  const submitReviewMutation = useSubmitCourseReviewMutation(
    activeWorkspaceId ?? '',
    courseId,
  );
  const publishMutation = usePublishCourseMutation(activeWorkspaceId ?? '', courseId);
  const archiveMutation = useArchiveCourseMutation(activeWorkspaceId ?? '', courseId);

  if (isCourseLoading) {
    return (
      <div role="status" className="flex items-center justify-center p-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span className="text-sm">Loading course studio...</span>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div role="alert" className="max-w-md mx-auto my-12 p-6 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-center">
        <AlertCircle className="h-8 w-8 mx-auto mb-2" />
        <h3 className="font-semibold text-base">Course Not Found</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Unable to locate this course in the active workspace. It may have been archived or deleted.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/instructor/courses">Return to Courses</Link>
        </Button>
      </div>
    );
  }

  const handlePublishConfirm = async () => {
    await publishMutation.mutateAsync(course.version);
    setIsPublishDialogOpen(false);
    void refetchCourse();
  };

  const handleSubmitReview = async () => {
    if (confirm('Submit this course for administrative publication review?')) {
      await submitReviewMutation.mutateAsync(course.version);
      void refetchCourse();
    }
  };

  const handleArchive = async () => {
    if (confirm('Archive this course? New sales will stop, but enrolled students retain delivery access.')) {
      await archiveMutation.mutateAsync(course.version);
      void refetchCourse();
    }
  };

  const handleReloadConflict = () => {
    void refetchCourse();
    void refetchSections();
    setSelectedLesson(null);
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation & Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs self-start">
          <Link href="/instructor/courses">
            <ArrowLeft className="h-4 w-4" />
            Courses Directory
          </Link>
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
            <Link href={`/courses/${course.slug}`} target="_blank">
              <Eye className="h-3.5 w-3.5" />
              Public Catalog Preview
            </Link>
          </Button>

          {course.status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSubmitReview()}
                disabled={submitReviewMutation.isPending}
                className="gap-1.5 text-xs text-amber-600 dark:text-amber-400"
              >
                <Send className="h-3.5 w-3.5" />
                Submit Review
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsPublishDialogOpen(true)}
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Rocket className="h-3.5 w-3.5" />
                Publish Course...
              </Button>
            </>
          )}

          {course.status === 'IN_REVIEW' && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsPublishDialogOpen(true)}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Rocket className="h-3.5 w-3.5" />
              Approve & Publish...
            </Button>
          )}

          {course.status === 'PUBLISHED' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleArchive()}
              disabled={archiveMutation.isPending}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Course Title and Status Banner */}
      <div className="rounded-lg border bg-card p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              course.status === 'PUBLISHED'
                ? 'default'
                : course.status === 'IN_REVIEW'
                  ? 'outline'
                  : 'secondary'
            }
            className="text-[10px]"
          >
            {course.status}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {course.deliveryMode}
          </Badge>
          {course.isFree && (
            <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400">
              FREE
            </Badge>
          )}
          <span className="text-xs font-mono text-muted-foreground">v{course.version}</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
          {course.summary || 'No summary configured.'}
        </p>
      </div>

      {/* Main Studio Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="h-10">
          <TabsTrigger value="curriculum" className="text-xs flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Curriculum Syllabus
          </TabsTrigger>
          <TabsTrigger value="cohorts" className="text-xs flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Cohorts & Drip
          </TabsTrigger>
          <TabsTrigger value="staff" className="text-xs flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Staff & Permissions
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs flex items-center gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Settings & Metadata
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Curriculum Builder & Inline Lesson Editor */}
        <TabsContent value="curriculum" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className={selectedLesson ? 'lg:col-span-5' : 'lg:col-span-12'}>
              <CurriculumBuilder
                workspaceId={activeWorkspaceId ?? ''}
                courseId={course.id}
                onSelectLesson={setSelectedLesson}
                selectedLessonId={selectedLesson?.id}
              />
            </div>

            {selectedLesson && (
              <div className="lg:col-span-7">
                <div className="rounded-lg border bg-card p-5 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div>
                      <h3 className="font-semibold text-sm">Editing Lesson: {selectedLesson.title}</h3>
                      <p className="text-[11px] text-muted-foreground">Configure content, media attachments, and completion rules.</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedLesson(null)} className="text-xs">
                      Close Editor
                    </Button>
                  </div>

                  <LessonEditor
                    key={selectedLesson.id}
                    workspaceId={activeWorkspaceId ?? ''}
                    courseId={course.id}
                    lesson={selectedLesson}
                    onSaved={(updated) => setSelectedLesson(updated)}
                    onConflict={setConflictState}
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 2: Cohorts & Drip */}
        <TabsContent value="cohorts">
          <CohortManager workspaceId={activeWorkspaceId ?? ''} courseId={course.id} />
        </TabsContent>

        {/* Tab 3: Staff & Permissions */}
        <TabsContent value="staff">
          <StaffManager workspaceId={activeWorkspaceId ?? ''} courseId={course.id} />
        </TabsContent>

        {/* Tab 4: Settings & Metadata */}
        <TabsContent value="settings">
          <CourseForm
            workspaceId={activeWorkspaceId ?? ''}
            initialData={course}
            onSubmit={async (data) => {
              await updateCourseMutation.mutateAsync(data as CourseUpdate);
              void refetchCourse();
            }}
            isSubmitting={updateCourseMutation.isPending}
            submitLabel="Save Course Metadata"
          />
        </TabsContent>
      </Tabs>

      {/* Publish Checklist Dialog */}
      <PublishChecklistDialog
        course={course}
        sections={sections}
        isOpen={isPublishDialogOpen}
        onOpenChange={setIsPublishDialogOpen}
        onConfirmPublish={handlePublishConfirm}
        isPublishing={publishMutation.isPending}
      />

      {/* Optimistic Conflict Dialog */}
      <ConflictDialog
        conflict={conflictState}
        onReload={handleReloadConflict}
        onDismiss={() => setConflictState(null)}
      />
    </div>
  );
}
