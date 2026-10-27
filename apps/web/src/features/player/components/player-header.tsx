'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Menu, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/features/marketing/site-config';
import { ThemeToggle } from '@/components/theme-toggle';

interface PlayerHeaderProps {
  enrollmentId: string;
  courseTitle?: string;
  completionPercent?: string;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function PlayerHeader({
  enrollmentId: _enrollmentId,
  courseTitle = 'Course Player',
  completionPercent = '0.00',
  onToggleSidebar,
  isSidebarOpen,
}: PlayerHeaderProps) {
  const percentNumber = Math.min(100, Math.max(0, parseFloat(completionPercent) || 0));

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/95 px-3 md:px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="md:hidden"
          aria-label={isSidebarOpen ? 'Close course outline' : 'Open course outline'}
          data-testid="toggle-sidebar-button"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Link
          href="/student"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to My Courses"
          data-testid="back-to-dashboard-link"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">My Courses</span>
        </Link>

        <span className="hidden text-muted-foreground/40 sm:inline">|</span>

        <div className="flex items-center gap-2 truncate">
          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            {courseTitle}
          </span>
          <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground lg:inline-block">
            {siteConfig.name}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2" data-testid="course-progress-container">
          <div className="hidden flex-col items-end sm:flex">
            <span className="text-xs font-medium text-foreground">
              {percentNumber.toFixed(0)}% completed
            </span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${percentNumber}%` }}
                role="progressbar"
                aria-valuenow={percentNumber}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Course completion progress"
              />
            </div>
          </div>
          {percentNumber >= 100 && (
            <CheckCircle2
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-label="Course fully completed"
            />
          )}
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
