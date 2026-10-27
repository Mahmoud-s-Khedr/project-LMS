'use client';

import React, { useState, useMemo } from 'react';
import { PlayerHeader } from './player-header';
import { PlayerSidebar } from './player-sidebar';
import { PlayerNavigation } from './player-navigation';
import { VideoLessonPlayer } from './video-lesson-player';
import { DocumentLessonViewer } from './document-lesson-viewer';
import { TextLessonViewer } from './text-lesson-viewer';
import { InteractiveLessonPlayer } from './interactive-lesson-player';
import { LiveSessionPlayer } from './live-session-player';
import { AssessmentLessonCard } from './assessment-lesson-card';
import { LessonResources } from './lesson-resources';
import { LessonLockView } from './lesson-lock-view';
import { useProgressMutation } from '../hooks';
import type { Enrollment, LearnerOutline, LearnerLesson } from '../types';

interface PlayerShellProps {
  enrollment: Enrollment;
  outline: LearnerOutline;
  lesson?: LearnerLesson | null;
  courseTitle?: string;
  children?: React.ReactNode;
}

export function PlayerShell({
  enrollment,
  outline,
  lesson,
  courseTitle,
  children,
}: PlayerShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Flatten lessons for linear prev/next progression
  const sortedLessons = useMemo(() => {
    const sortedSections = [...outline.sections].sort((a, b) => a.position - b.position);
    return sortedSections.flatMap((s) => [...s.lessons].sort((a, b) => a.position - b.position));
  }, [outline]);

  const currentLessonIndex = useMemo(() => {
    if (!lesson) return -1;
    return sortedLessons.findIndex((l) => l.lessonId === lesson.lessonId);
  }, [sortedLessons, lesson]);

  const prevLesson = currentLessonIndex > 0 ? sortedLessons[currentLessonIndex - 1] : null;
  const nextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < sortedLessons.length - 1
      ? sortedLessons[currentLessonIndex + 1]
      : null;

  const currentOutlineLesson = currentLessonIndex >= 0 ? sortedLessons[currentLessonIndex] : null;

  const progressMutation = useProgressMutation(enrollment.id, lesson?.lessonId ?? '');

  const handleMarkComplete = () => {
    if (!lesson) return;
    progressMutation.mutate({
      type: 'ACKNOWLEDGE',
      eventId: crypto.randomUUID(),
    });
  };

  const isCompleted = Boolean(lesson?.progress?.completedAt);

  return (
    <div className="flex h-screen w-full flex-col bg-background" data-testid="player-shell">
      <PlayerHeader
        enrollmentId={enrollment.id}
        courseTitle={courseTitle || 'Course Player'}
        completionPercent={enrollment.completionPercent}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      <div className="flex flex-1 overflow-hidden">
        <PlayerSidebar
          enrollmentId={enrollment.id}
          outline={outline}
          currentLessonId={lesson?.lessonId ?? null}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex flex-1 flex-col overflow-y-auto" data-testid="player-main-content">
          <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
            {children ? (
              children
            ) : lesson ? (
              currentOutlineLesson && !currentOutlineLesson.access.allowed ? (
                <LessonLockView
                  access={
                    currentOutlineLesson.access as Extract<
                      typeof currentOutlineLesson.access,
                      { allowed: false }
                    >
                  }
                  onBackToOutline={() => setIsSidebarOpen(true)}
                />
              ) : (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                      {lesson.title}
                    </h1>
                  </div>

                  {/* Render content by discriminated lesson type */}
                  {lesson.payload.type === 'VIDEO' && (
                    <VideoLessonPlayer enrollmentId={enrollment.id} lesson={lesson} />
                  )}

                  {lesson.payload.type === 'DOCUMENT' && (
                    <DocumentLessonViewer enrollmentId={enrollment.id} lesson={lesson} />
                  )}

                  {lesson.payload.type === 'TEXT' && (
                    <div className="rounded-xl border bg-card p-6 shadow-xs">
                      <TextLessonViewer content={lesson.payload.body} />
                    </div>
                  )}

                  {lesson.payload.type === 'INTERACTIVE' && (
                    <InteractiveLessonPlayer
                      embedUrl={lesson.payload.body.embedUrl}
                      sandbox={lesson.payload.body.sandbox}
                      title={lesson.title}
                    />
                  )}

                  {lesson.payload.type === 'LIVE_SESSION' && (
                    <LiveSessionPlayer enrollmentId={enrollment.id} lesson={lesson} />
                  )}

                  {['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(lesson.payload.type) && (
                    <AssessmentLessonCard enrollmentId={enrollment.id} lesson={lesson} />
                  )}

                  {/* Supplementary resources */}
                  <LessonResources enrollmentId={enrollment.id} lesson={lesson} />
                </div>
              )
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">
                Select a lesson from the course outline to begin learning.
              </div>
            )}
          </div>

          {/* Bottom navigation */}
          {lesson && (
            <PlayerNavigation
              enrollmentId={enrollment.id}
              prevLesson={prevLesson}
              nextLesson={nextLesson}
              isCompleted={isCompleted}
              onMarkComplete={handleMarkComplete}
              isMarkingComplete={progressMutation.isPending}
              showCompleteButton={
                lesson.payload.type !== 'QUIZ' &&
                lesson.payload.type !== 'ASSIGNMENT' &&
                lesson.payload.type !== 'EXAM'
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
