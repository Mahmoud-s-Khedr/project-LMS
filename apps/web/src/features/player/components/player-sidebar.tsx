'use client';

import React from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
  FileText,
  FileCode,
  Radio,
  HelpCircle,
  ClipboardList,
  GraduationCap,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LearnerOutline, LearnerOutlineLesson } from '../types';

interface PlayerSidebarProps {
  enrollmentId: string;
  outline: LearnerOutline;
  currentLessonId?: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

function getLessonIcon(type: LearnerOutlineLesson['type']) {
  switch (type) {
    case 'VIDEO':
      return PlayCircle;
    case 'DOCUMENT':
      return FileText;
    case 'TEXT':
      return FileText;
    case 'INTERACTIVE':
      return FileCode;
    case 'LIVE_SESSION':
      return Radio;
    case 'QUIZ':
      return HelpCircle;
    case 'ASSIGNMENT':
      return ClipboardList;
    case 'EXAM':
      return GraduationCap;
    default:
      return FileText;
  }
}

function formatLockReason(reason?: string, unlockAt?: string | null): string {
  if (reason === 'NOT_RELEASED') {
    if (unlockAt) {
      try {
        const d = new Date(unlockAt);
        return `Unlocks ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      } catch {
        return 'Scheduled';
      }
    }
    return 'Scheduled';
  }
  if (reason === 'PREREQUISITE_UNMET') return 'Prerequisites';
  if (reason === 'ACCESS_EXPIRED') return 'Access expired';
  if (reason === 'ENROLLMENT_SUSPENDED') return 'Suspended';
  if (reason === 'AVAILABLE_UNTIL_PASSED') return 'Closed';
  return 'Locked';
}

export function PlayerSidebar({
  enrollmentId,
  outline,
  currentLessonId,
  isOpen = false,
  onClose,
  className,
}: PlayerSidebarProps) {
  // Sort sections by position
  const sortedSections = [...outline.sections].sort((a, b) => a.position - b.position);

  // Compute total lessons & completed count
  const allLessons = sortedSections.flatMap((s) => s.lessons);
  const completedLessons = allLessons.filter((l) => Boolean(l.completedAt));

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-80 flex-col border-r bg-card transition-transform duration-300 ease-in-out md:static md:z-20 md:w-80 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          className,
        )}
        data-testid="player-sidebar"
        aria-label="Course curriculum outline"
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Course Outline</h2>
            <p className="text-xs text-muted-foreground">
              {completedLessons.length} of {allLessons.length} lessons completed
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="md:hidden"
            aria-label="Close outline sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Course Sections">
          {sortedSections.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No lessons published in this course yet.
            </div>
          ) : (
            sortedSections.map((section, sIdx) => {
              const sortedLessons = [...section.lessons].sort((a, b) => a.position - b.position);

              return (
                <div key={section.sectionId} className="mb-4">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Section {sIdx + 1}: {section.title}
                  </div>

                  <ul className="mt-1 space-y-1">
                    {sortedLessons.map((lesson) => {
                      const isCurrent = lesson.lessonId === currentLessonId;
                      const isCompleted = Boolean(lesson.completedAt);
                      const isLocked = !lesson.access.allowed;
                      const Icon = getLessonIcon(lesson.type);

                      const lessonHref = `/learn/${enrollmentId}/lessons/${lesson.lessonId}`;

                      return (
                        <li key={lesson.lessonId}>
                          {isLocked ? (
                            <div
                              className={cn(
                                'flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted-foreground/70 opacity-80 cursor-not-allowed select-none bg-muted/30',
                                isCurrent && 'ring-1 ring-primary/40',
                              )}
                              title={
                                !lesson.access.allowed
                                  ? formatLockReason(
                                      lesson.access.reason,
                                      lesson.access.unlockAt,
                                    )
                                  : 'Locked'
                              }
                              data-testid={`sidebar-lesson-${lesson.lessonId}-locked`}
                            >
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-foreground/80">{lesson.title}</p>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className="px-1 py-0 text-[9px] font-normal text-muted-foreground"
                                  >
                                    {!lesson.access.allowed
                                      ? formatLockReason(
                                          lesson.access.reason,
                                          lesson.access.unlockAt,
                                        )
                                      : 'Locked'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Link
                              href={lessonHref}
                              onClick={onClose}
                              className={cn(
                                'group flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors',
                                isCurrent
                                  ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30'
                                  : 'text-foreground hover:bg-muted/60',
                              )}
                              aria-current={isCurrent ? 'page' : undefined}
                              data-testid={`sidebar-lesson-${lesson.lessonId}`}
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                              ) : isCurrent ? (
                                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              ) : (
                                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate">{lesson.title}</p>
                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                  <span className="capitalize">
                                    {lesson.type.toLowerCase().replace('_', ' ')}
                                  </span>
                                  {lesson.isRequired && (
                                    <span className="text-[9px] text-amber-600 dark:text-amber-400">
                                      Required
                                    </span>
                                  )}
                                </div>
                              </div>
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </nav>
      </aside>
    </>
  );
}
