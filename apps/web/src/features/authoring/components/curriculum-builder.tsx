'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FolderPlus,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Video,
  FileText,
  Type,
  Code2,
  GraduationCap,
  Radio,
  Loader2,
  BookOpen,
} from 'lucide-react';
import {
  useCourseSectionsQuery,
  useCreateSectionMutation,
  useUpdateSectionMutation,
  useDeleteSectionMutation,
  useReorderSectionsMutation,
  useCreateLessonMutation,
  useDeleteLessonMutation,
  useReorderLessonsMutation,
  useCoursePermissions,
} from '../hooks';
import type { Lesson, LessonType, SectionWithLessons, LessonPayload } from '../types';

interface CurriculumBuilderProps {
  workspaceId: string;
  courseId: string;
  onSelectLesson?: (lesson: Lesson) => void;
  selectedLessonId?: string;
}

export function CurriculumBuilder({
  workspaceId,
  courseId,
  onSelectLesson,
  selectedLessonId,
}: CurriculumBuilderProps) {
  const permissions = useCoursePermissions(workspaceId, courseId);
  const { data: rawSections, isLoading, error } = useCourseSectionsQuery(workspaceId, courseId);

  const createSectionMutation = useCreateSectionMutation(workspaceId, courseId);
  const updateSectionMutation = useUpdateSectionMutation(workspaceId, courseId);
  const deleteSectionMutation = useDeleteSectionMutation(workspaceId, courseId);
  const reorderSectionsMutation = useReorderSectionsMutation(workspaceId, courseId);

  const createLessonMutation = useCreateLessonMutation(workspaceId, courseId);
  const deleteLessonMutation = useDeleteLessonMutation(workspaceId, courseId);
  const reorderLessonsMutation = useReorderLessonsMutation(workspaceId, courseId, '');

  // Add section dialog
  const [isAddSectionOpen, setIsAddSectionOpen] = React.useState(false);
  const [newSectionTitle, setNewSectionTitle] = React.useState('');

  // Edit section title
  const [editingSectionId, setEditingSectionId] = React.useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = React.useState('');

  // Add lesson dialog
  const [addLessonSectionId, setAddLessonSectionId] = React.useState<string | null>(null);
  const [newLessonTitle, setNewLessonTitle] = React.useState('');
  const [newLessonType, setNewLessonType] = React.useState<LessonType>('VIDEO');
  const [newLessonEstimatedMinutes, setNewLessonEstimatedMinutes] = React.useState(15);
  const [newLessonIsPreview, setNewLessonIsPreview] = React.useState(false);

  const sections: SectionWithLessons[] = React.useMemo(() => {
    if (!rawSections) return [];
    return rawSections.map((sec) => ({
      ...sec,
      lessons: (sec as { lessons?: Lesson[] }).lessons ?? [],
    }));
  }, [rawSections]);

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionTitle.trim()) return;

    await createSectionMutation.mutateAsync({
      title: newSectionTitle.trim(),
      position: sections.length + 1,
    });

    setNewSectionTitle('');
    setIsAddSectionOpen(false);
  };

  const handleUpdateSectionTitle = async (sectionId: string) => {
    if (!editSectionTitle.trim()) return;
    await updateSectionMutation.mutateAsync({
      sectionId,
      data: { title: editSectionTitle.trim() },
    });
    setEditingSectionId(null);
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (confirm('Delete this section and all lessons within it?')) {
      await deleteSectionMutation.mutateAsync(sectionId);
    }
  };

  const handleMoveSection = async (currentIndex: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const reordered = [...sections];
    const temp = reordered[currentIndex];
    const target = reordered[targetIndex];
    if (!temp || !target) return;
    reordered[currentIndex] = target;
    reordered[targetIndex] = temp;

    const ids = reordered.map((s) => s.id);
    await reorderSectionsMutation.mutateAsync(ids);
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addLessonSectionId || !newLessonTitle.trim()) return;

    const targetSection = sections.find((s) => s.id === addLessonSectionId);
    const existingLessons = targetSection?.lessons ?? [];

    const isProtected = ['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(newLessonType);

    let payload: LessonPayload;
    if (newLessonType === 'VIDEO') {
      payload = { type: 'VIDEO', body: { durationSeconds: newLessonEstimatedMinutes * 60 } };
    } else if (newLessonType === 'TEXT') {
      payload = {
        type: 'TEXT',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
      };
    } else if (newLessonType === 'INTERACTIVE') {
      payload = { type: 'INTERACTIVE', body: { embedUrl: 'https://example.com/embed', sandbox: ['allow-scripts'] } };
    } else if (newLessonType === 'DOCUMENT') {
      payload = { type: 'DOCUMENT', body: {} };
    } else if (newLessonType === 'QUIZ') {
      payload = { type: 'QUIZ', body: {} };
    } else if (newLessonType === 'ASSIGNMENT') {
      payload = { type: 'ASSIGNMENT', body: {} };
    } else if (newLessonType === 'EXAM') {
      payload = { type: 'EXAM', body: {} };
    } else {
      payload = { type: 'LIVE_SESSION', body: {} };
    }

    const created = await createLessonMutation.mutateAsync({
      sectionId: addLessonSectionId,
      data: {
        title: newLessonTitle.trim(),
        position: existingLessons.length + 1,
        isRequired: true,
        isPreview: isProtected ? false : newLessonIsPreview,
        isPublished: true,
        estimatedMinutes: newLessonEstimatedMinutes,
        completionRule: newLessonType === 'VIDEO' ? 'WATCH_PERCENT' : 'VIEW',
        requiredWatchPercent: 80,
        release: { releaseType: 'IMMEDIATE' },
        payload,
      },
    });

    setAddLessonSectionId(null);
    setNewLessonTitle('');
    setNewLessonType('VIDEO');
    if (onSelectLesson) {
      onSelectLesson(created);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (confirm('Delete this lesson?')) {
      await deleteLessonMutation.mutateAsync(lessonId);
    }
  };

  const handleMoveLesson = async (
    sectionId: string,
    lessons: Lesson[],
    currentIndex: number,
    direction: 'UP' | 'DOWN',
  ) => {
    const targetIndex = direction === 'UP' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;

    const reordered = [...lessons];
    const temp = reordered[currentIndex];
    const target = reordered[targetIndex];
    if (!temp || !target) return;
    reordered[currentIndex] = target;
    reordered[targetIndex] = temp;

    const ids = reordered.map((l) => l.id);
    await reorderLessonsMutation.mutateAsync(ids);
  };

  const getLessonIcon = (type: LessonType) => {
    switch (type) {
      case 'VIDEO':
        return <Video className="h-4 w-4 text-blue-500" />;
      case 'DOCUMENT':
        return <FileText className="h-4 w-4 text-amber-500" />;
      case 'TEXT':
        return <Type className="h-4 w-4 text-emerald-500" />;
      case 'INTERACTIVE':
        return <Code2 className="h-4 w-4 text-purple-500" />;
      case 'QUIZ':
      case 'ASSIGNMENT':
      case 'EXAM':
        return <GraduationCap className="h-4 w-4 text-rose-500" />;
      case 'LIVE_SESSION':
        return <Radio className="h-4 w-4 text-red-500" />;
      default:
        return <BookOpen className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const isReadOnly = !permissions.canEditContent;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Course Curriculum & Syllabus</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize modules into sections, author lectures, configure activities, and arrange lesson ordering.
          </p>
        </div>

        {!isReadOnly && (
          <Button
            onClick={() => {
              setNewSectionTitle(`Module ${sections.length + 1}`);
              setIsAddSectionOpen(true);
            }}
            size="sm"
            className="flex items-center gap-1.5 self-start"
          >
            <FolderPlus className="h-4 w-4" />
            Add Section
          </Button>
        )}
      </div>

      {isLoading ? (
        <div role="status" className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading syllabus outline...</span>
        </div>
      ) : error ? (
        <div role="alert" className="p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          Failed to load curriculum outline.
        </div>
      ) : sections.length > 0 ? (
        <div className="space-y-4">
          {sections.map((section, sIdx) => (
            <div
              key={section.id}
              className="rounded-lg border bg-card transition-shadow shadow-sm overflow-hidden"
            >
              {/* Section Header */}
              <div className="flex flex-wrap items-center justify-between border-b bg-muted/30 px-4 py-3 gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Section {sIdx + 1}
                  </span>

                  {editingSectionId === section.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editSectionTitle}
                        onChange={(e) => setEditSectionTitle(e.target.value)}
                        className="h-7 text-xs max-w-xs"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs px-2"
                        onClick={() => void handleUpdateSectionTitle(section.id)}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => setEditingSectionId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <span className="font-semibold text-sm text-foreground">{section.title}</span>
                  )}
                </div>

                {!isReadOnly && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={sIdx === 0}
                      onClick={() => void handleMoveSection(sIdx, 'UP')}
                      className="h-7 w-7 p-0"
                      title="Move Section Up"
                      aria-label="Move Section Up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={sIdx === sections.length - 1}
                      onClick={() => void handleMoveSection(sIdx, 'DOWN')}
                      className="h-7 w-7 p-0"
                      title="Move Section Down"
                      aria-label="Move Section Down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingSectionId(section.id);
                        setEditSectionTitle(section.title);
                      }}
                      className="h-7 w-7 p-0"
                      title="Rename Section"
                      aria-label="Rename Section"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDeleteSection(section.id)}
                      className="text-destructive h-7 w-7 p-0 hover:bg-destructive/10"
                      title="Delete Section"
                      aria-label="Delete Section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Lessons within Section */}
              <div className="p-3 space-y-2">
                {section.lessons.length > 0 ? (
                  section.lessons.map((lesson, lIdx) => {
                    const isSelected = selectedLessonId === lesson.id;
                    return (
                      <div
                        key={lesson.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-md border transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border/60 hover:border-border hover:bg-muted/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="rounded p-1 bg-muted shrink-0">
                            {getLessonIcon(lesson.payload.type)}
                          </div>

                          <div className="min-w-0">
                            {onSelectLesson ? (
                              <button
                                type="button"
                                onClick={() => onSelectLesson(lesson)}
                                className="font-medium text-xs text-foreground truncate hover:underline block text-left"
                              >
                                {lesson.title}
                              </button>
                            ) : (
                              <Link
                                href={`/instructor/courses/${courseId}/lessons/${lesson.id}`}
                                className="font-medium text-xs text-foreground truncate hover:underline block"
                              >
                                {lesson.title}
                              </Link>
                            )}

                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                              <span>{lesson.payload.type}</span>
                              <span>•</span>
                              <span>{lesson.estimatedMinutes} min</span>
                              {lesson.isPreview && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                    Preview
                                  </Badge>
                                </>
                              )}
                              {!lesson.isPublished && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-500 italic">Draft</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {!isReadOnly && (
                          <div className="flex items-center gap-1 self-end sm:self-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={lIdx === 0}
                              onClick={() => void handleMoveLesson(section.id, section.lessons, lIdx, 'UP')}
                              className="h-6 w-6 p-0"
                              title="Move Lesson Up"
                              aria-label="Move Lesson Up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={lIdx === section.lessons.length - 1}
                              onClick={() => void handleMoveLesson(section.id, section.lessons, lIdx, 'DOWN')}
                              className="h-6 w-6 p-0"
                              title="Move Lesson Down"
                              aria-label="Move Lesson Down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDeleteLesson(lesson.id)}
                              className="text-destructive h-6 w-6 p-0 hover:bg-destructive/10"
                              title="Delete Lesson"
                              aria-label="Delete Lesson"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground italic py-2 px-1">
                    No lessons in this section yet.
                  </p>
                )}

                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAddLessonSectionId(section.id);
                      setNewLessonTitle('');
                      setNewLessonType('VIDEO');
                      setNewLessonIsPreview(false);
                    }}
                    className="w-full text-xs h-8 border-dashed mt-2"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Lesson to {section.title}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h4 className="mt-2 text-sm font-semibold">Curriculum Outline is Empty</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first module section to start adding video lectures, articles, and assignments.
          </p>
          {!isReadOnly && (
            <Button
              onClick={() => {
                setNewSectionTitle('Module 1: Introduction');
                setIsAddSectionOpen(true);
              }}
              size="sm"
              variant="outline"
              className="mt-3"
            >
              <FolderPlus className="mr-1.5 h-4 w-4" />
              Add First Section
            </Button>
          )}
        </div>
      )}

      {/* Add section dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateSection}>
            <DialogHeader>
              <DialogTitle>Add Curriculum Section</DialogTitle>
              <DialogDescription>
                Create a module group for your course lessons.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-2">
              <Label htmlFor="new-section-title" className="text-xs font-medium">Section Title</Label>
              <Input
                id="new-section-title"
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="e.g. Chapter 1: Core Fundamentals"
                required
                autoFocus
              />
            </div>

            <DialogFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsAddSectionOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createSectionMutation.isPending}>
                Create Section
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add lesson dialog */}
      <Dialog open={Boolean(addLessonSectionId)} onOpenChange={() => setAddLessonSectionId(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreateLesson}>
            <DialogHeader>
              <DialogTitle>Add Lesson</DialogTitle>
              <DialogDescription>
                Select lesson format and default configuration.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="new-lesson-title" className="text-xs font-medium">Lesson Title</Label>
                <Input
                  id="new-lesson-title"
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="e.g. Setting Up the Environment"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-lesson-type" className="text-xs font-medium">Lesson Format</Label>
                <Select
                  value={newLessonType}
                  onValueChange={(v) => {
                    const nextType = v as LessonType;
                    setNewLessonType(nextType);
                    if (['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(nextType)) {
                      setNewLessonIsPreview(false);
                    }
                  }}
                >
                  <SelectTrigger id="new-lesson-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIDEO">Video Lecture</SelectItem>
                    <SelectItem value="DOCUMENT">Document / PDF Study</SelectItem>
                    <SelectItem value="TEXT">Article / Text Guide</SelectItem>
                    <SelectItem value="INTERACTIVE">Interactive Embed</SelectItem>
                    <SelectItem value="QUIZ">Quiz Assessment</SelectItem>
                    <SelectItem value="ASSIGNMENT">Assignment Task</SelectItem>
                    <SelectItem value="EXAM">Examination</SelectItem>
                    <SelectItem value="LIVE_SESSION">Live Video Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-lesson-minutes" className="text-xs font-medium">Est. Minutes</Label>
                  <Input
                    id="new-lesson-minutes"
                    type="number"
                    min="1"
                    value={newLessonEstimatedMinutes}
                    onChange={(e) => setNewLessonEstimatedMinutes(Number(e.target.value))}
                  />
                </div>

                <div className="flex flex-col justify-end space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      id="new-lesson-preview"
                      type="checkbox"
                      disabled={['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(newLessonType)}
                      checked={newLessonIsPreview}
                      onChange={(e) => setNewLessonIsPreview(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label htmlFor="new-lesson-preview" className="text-xs cursor-pointer">
                      Free Preview
                    </Label>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAddLessonSectionId(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createLessonMutation.isPending}>
                Create Lesson
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
