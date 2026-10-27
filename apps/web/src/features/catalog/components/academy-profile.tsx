'use client';

import Link from 'next/link';
import { Building2, Globe, Sparkles, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { PublicWorkspace } from '../types';
import { useCatalogCoursesQuery } from '../hooks';
import { CourseCard } from './course-card';

interface AcademyProfileProps {
  workspace: PublicWorkspace;
}

export function AcademyProfile({ workspace }: AcademyProfileProps) {
  const { data, isLoading, isError, error } = useCatalogCoursesQuery({
    workspace: workspace.slug,
  });

  const courses = data?.data ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/courses" className="hover:text-foreground">
          Academies
        </Link>
        <span>/</span>
        <span className="truncate max-w-[250px] font-medium text-foreground">{workspace.name}</span>
      </nav>

      {/* Academy Branding Banner */}
      <div className="mb-10 rounded-2xl border border-border/80 bg-card p-6 sm:p-10 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Logo / Monogram */}
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 text-3xl font-bold font-serif text-primary overflow-hidden shadow-inner">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logoUrl}
                alt={workspace.name}
                className="h-full w-full object-cover"
              />
            ) : (
              workspace.name.slice(0, 2).toUpperCase()
            )}
          </div>

          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {workspace.kind === 'ACADEMY' ? 'Verified Academy' : 'Independent Studio'}
              </Badge>
              {workspace.timezone && (
                <Badge variant="outline" className="flex items-center gap-1 text-xs">
                  <Globe className="h-3 w-3" />
                  {workspace.timezone}
                </Badge>
              )}
            </div>

            <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              {workspace.name}
            </h1>

            {workspace.description && (
              <p className="text-base text-muted-foreground max-w-3xl leading-relaxed">
                {workspace.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Courses List Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div>
            <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Published Courses & Cohorts
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Explore programs designed and instructed by {workspace.name}.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-label="Loading academy courses"
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col rounded-xl border border-border/60 bg-card p-4 space-y-3"
              >
                <Skeleton className="aspect-[16/9] w-full rounded-lg" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive">
            <p className="font-semibold">Unable to load courses for this academy</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error
                ? error.message
                : 'Please check your connection and try again.'}
            </p>
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-card p-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-serif text-xl font-bold tracking-tight">
              No courses available yet
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
              {workspace.name} is preparing curriculum and schedules for upcoming courses. Check
              back soon!
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} workspaceSlug={workspace.slug} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
