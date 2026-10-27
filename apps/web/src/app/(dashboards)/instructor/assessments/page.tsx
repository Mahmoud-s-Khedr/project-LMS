'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useActiveWorkspace } from '@/features/workspaces';
import { useStaffCoursesQuery, useCourseSectionsQuery } from '@/features/authoring';
import { useCreateAssessmentMutation, AssessmentKind } from '@/features/assessment-authoring';
import type { Assessment, Course } from '@lms/shared';

export default function AssessmentsPage() {
  const { activeWorkspaceId } = useActiveWorkspace();

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [courseIdInput, setCourseIdInput] = React.useState('');
  const [lessonIdInput, setLessonIdInput] = React.useState('');
  const [kind, setKind] = React.useState<string>(AssessmentKind.QUIZ);
  const [title, setTitle] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  // Discover real courses from API for the active workspace
  const { data: coursesData } = useStaffCoursesQuery(
    activeWorkspaceId ?? '',
    {},
    { enabled: Boolean(activeWorkspaceId) },
  );
  const courses: Course[] = React.useMemo(() => coursesData?.data ?? [], [coursesData?.data]);

  React.useEffect(() => {
    if (!courseIdInput && courses.length > 0 && courses[0]) {
      setCourseIdInput(courses[0].id);
    }
  }, [courses, courseIdInput]);

  // Discover real lessons in selected course
  const { data: sections } = useCourseSectionsQuery(activeWorkspaceId ?? '', courseIdInput, {
    enabled: Boolean(activeWorkspaceId && courseIdInput),
  });

  const availableLessons = React.useMemo(() => {
    if (!sections) return [];
    const lessons: { id: string; title: string; type?: string }[] = [];
    for (const sec of sections) {
      const secLessons = (sec as { lessons?: { id: string; title: string; type?: string }[] })
        .lessons;
      if (Array.isArray(secLessons)) {
        for (const l of secLessons) {
          lessons.push(l);
        }
      }
    }
    return lessons;
  }, [sections]);

  // Local state for authored assessments created in current session
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);

  const createMutation = useCreateAssessmentMutation(activeWorkspaceId ?? '', courseIdInput);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Assessment title is required.');
      return;
    }
    if (!courseIdInput.trim()) {
      setFormError('Course ID is required.');
      return;
    }
    if (!lessonIdInput.trim()) {
      setFormError('Lesson ID is required.');
      return;
    }

    try {
      setFormError(null);
      const created = await createMutation.mutateAsync({
        lessonId: lessonIdInput.trim(),
        input: {
          kind: kind as AssessmentKind,
          title: title.trim(),
        },
      });

      setAssessments((prev) => [created, ...prev]);
      setCreateDialogOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create assessment');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assessments & Exams</h1>
          <p className="text-sm text-muted-foreground">
            Configure quizzes, assignments, exam proctoring rules, rubric criteria, and question
            pools.
          </p>
        </div>

        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Assessment
        </Button>
      </div>

      {/* Assessments Grid */}
      {assessments.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <CardTitle className="text-base font-semibold">No assessments found</CardTitle>
          <CardDescription className="text-xs mt-1 text-muted-foreground">
            No assessments configured yet. Click &ldquo;Create Assessment&rdquo; to attach a quiz,
            assignment, or exam to a course lesson.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessments.map((ass) => (
            <Card
              key={ass.id}
              className="flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline">{ass.kind}</Badge>
                  {ass.currentPublishedVersion ? (
                    <Badge
                      variant="default"
                      className="bg-green-600 hover:bg-green-700 text-[10px]"
                    >
                      v{ass.currentPublishedVersion} Published
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">
                      Draft Only
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-base line-clamp-2 mt-2">{ass.title}</CardTitle>
                <CardDescription className="text-xs">
                  Lesson: {ass.lessonId.slice(0, 8)}... | Course: {ass.courseId.slice(0, 8)}...
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex items-center justify-between border-t pt-3 mt-2">
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(ass.createdAt).toLocaleDateString()}
                  </span>
                  <Link
                    href={`/instructor/assessments/${ass.id}?courseId=${ass.courseId}`}
                    className="inline-flex items-center text-xs font-semibold text-primary hover:underline gap-1"
                  >
                    Configure
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Assessment Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Assessment</DialogTitle>
            <DialogDescription>
              Link a quiz, assignment, or exam to a course lesson. Initial draft version 1 will be
              initialized.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} noValidate className="space-y-4 py-2">
            {formError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ass-title">Assessment Title</Label>
              <Input
                id="ass-title"
                placeholder="e.g. Midterm Exam: Fault Tolerance"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assessment Kind</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AssessmentKind.QUIZ}>Quiz</SelectItem>
                  <SelectItem value={AssessmentKind.ASSIGNMENT}>Assignment</SelectItem>
                  <SelectItem value={AssessmentKind.EXAM}>Examination</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ass-course-id">Target Course</Label>
              {courses.length > 0 ? (
                <select
                  id="ass-course-id"
                  value={courseIdInput}
                  onChange={(e) => setCourseIdInput(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="ass-course-id"
                  placeholder="Course UUID"
                  value={courseIdInput}
                  onChange={(e) => setCourseIdInput(e.target.value)}
                  required
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ass-lesson-id">Target Lesson</Label>
              {availableLessons.length > 0 ? (
                <select
                  id="ass-lesson-id"
                  value={lessonIdInput}
                  onChange={(e) => setLessonIdInput(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                >
                  <option value="">Select a lesson...</option>
                  {availableLessons.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.type ?? 'LESSON'})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="ass-lesson-id"
                  placeholder="Lesson UUID"
                  value={lessonIdInput}
                  onChange={(e) => setLessonIdInput(e.target.value)}
                  required
                />
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !title.trim()}>
                {createMutation.isPending ? 'Creating...' : 'Create & Open Editor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
