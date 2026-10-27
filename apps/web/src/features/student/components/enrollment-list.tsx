'use client';

import * as React from 'react';
import Link from 'next/link';
import { BookOpen, Compass, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EnrollmentCard } from './enrollment-card';
import type { Enrollment } from '../types';
import { isAccessAllowed } from '../types';

export interface EnrollmentListProps {
  enrollments?: Enrollment[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function EnrollmentList({
  enrollments = [],
  isLoading,
  isError,
  onRetry,
}: EnrollmentListProps) {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'completed' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredEnrollments = React.useMemo(() => {
    return enrollments.filter((enrollment) => {
      const allowed = isAccessAllowed(enrollment.access);
      const percent = parseFloat(enrollment.completionPercent) || 0;
      const isCompleted = Boolean(enrollment.completedAt) || percent >= 100;

      // Status tab filter
      if (filter === 'active' && (!allowed || isCompleted)) return false;
      if (filter === 'completed' && !isCompleted) return false;
      if (filter === 'expired' && allowed) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesId = enrollment.courseId.toLowerCase().includes(query);
        const matchesEnrollmentId = enrollment.id.toLowerCase().includes(query);
        if (!matchesId && !matchesEnrollmentId) return false;
      }

      return true;
    });
  }, [enrollments, filter, searchQuery]);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center sm:p-12">
        <p className="font-semibold text-destructive">Failed to load enrollments</p>
        <p className="mt-1 text-sm text-muted-foreground">
          There was an error retrieving your learning enrollments. Please try again.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
            <RotateCcw className="mr-2 size-3.5" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search & Tabs Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onValueChange={(val) => setFilter(val as typeof filter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-4 sm:w-auto">
            <TabsTrigger value="all">All ({enrollments.length})</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="expired">Restricted</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search enrollments…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-5 space-y-4">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-24" />
              </div>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-2 w-full" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-8 w-28" />
                <Skeleton className="h-8 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEnrollments.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEnrollments.map((enrollment) => (
            <EnrollmentCard key={enrollment.id} enrollment={enrollment} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center sm:p-12">
          <div className="rounded-2xl bg-muted p-4 text-muted-foreground">
            <BookOpen className="size-8" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {searchQuery ? 'No matching enrollments found' : 'No courses found in this category'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchQuery
              ? 'Try adjusting your search terms or clearing your search query.'
              : 'You have no courses matching the selected filter.'}
          </p>
          <div className="mt-5 flex gap-3">
            {searchQuery ? (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/courses">
                  <Compass className="mr-2 size-4" />
                  Explore Catalog
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
