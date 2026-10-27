'use client';

import { useState, useTransition } from 'react';
import {
  Filter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CATALOG_CATEGORIES,
  CATALOG_DELIVERY_MODES,
  CATALOG_LANGUAGES,
  CATALOG_LEVELS,
  CATALOG_SORT_OPTIONS,
  type CatalogCoursesQuery,
  type CatalogFilterState,
} from '../types';
import { useCatalogCoursesQuery } from '../hooks';
import { CourseCard } from './course-card';

interface CourseCatalogProps {
  initialFilters?: Partial<CatalogFilterState>;
  initialData?: import('../types').PaginatedResult<import('../types').PublicCourse>;
}

export function CourseCatalog({ initialFilters = {}, initialData }: CourseCatalogProps) {
  const [filters, setFilters] = useState<CatalogFilterState>({
    search: initialFilters.search ?? '',
    category: initialFilters.category ?? 'ALL',
    level: initialFilters.level ?? 'ALL',
    deliveryMode: initialFilters.deliveryMode ?? 'ALL',
    language: initialFilters.language ?? 'ALL',
    sort: initialFilters.sort ?? 'publishedAt',
    cursor: undefined,
    limit: 12,
  });

  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  // Prepare query for API
  const queryParams: Partial<CatalogCoursesQuery> = {
    search: filters.search?.trim() ? filters.search.trim() : undefined,
    category: filters.category !== 'ALL' ? filters.category : undefined,
    level: filters.level !== 'ALL' ? filters.level : undefined,
    deliveryMode:
      filters.deliveryMode !== 'ALL' && filters.deliveryMode !== undefined
        ? (filters.deliveryMode as 'SELF_PACED' | 'COHORT')
        : undefined,
    language: filters.language !== 'ALL' ? filters.language : undefined,
    sort: filters.sort ?? 'publishedAt',
    cursor: filters.cursor,
    limit: filters.limit ?? 12,
  };

  const { data, isLoading, isError, error, refetch } = useCatalogCoursesQuery(queryParams, { initialData });

  const courses = data?.data ?? [];
  const meta = data?.meta;

  const handleSearchChange = (value: string) => {
    startTransition(() => {
      setFilters((prev) => ({ ...prev, search: value, cursor: undefined }));
      setCursorHistory([]);
    });
  };

  const handleFilterChange = <K extends keyof CatalogFilterState>(
    key: K,
    value: CatalogFilterState[K],
  ) => {
    startTransition(() => {
      setFilters((prev) => ({ ...prev, [key]: value, cursor: undefined }));
      setCursorHistory([]);
    });
  };

  const handleClearFilters = () => {
    startTransition(() => {
      setFilters({
        search: '',
        category: 'ALL',
        level: 'ALL',
        deliveryMode: 'ALL',
        language: 'ALL',
        sort: 'publishedAt',
        cursor: undefined,
        limit: 12,
      });
      setCursorHistory([]);
    });
  };

  const handleNextPage = () => {
    if (meta?.nextCursor) {
      setCursorHistory((prev) => [...prev, filters.cursor ?? '']);
      setFilters((prev) => ({ ...prev, cursor: meta.nextCursor ?? undefined }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePreviousPage = () => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1];
      setCursorHistory((prev) => prev.slice(0, -1));
      setFilters((prev) => ({ ...prev, cursor: prevCursor || undefined }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const hasActiveFilters =
    Boolean(filters.search) ||
    filters.category !== 'ALL' ||
    filters.level !== 'ALL' ||
    filters.deliveryMode !== 'ALL' ||
    filters.language !== 'ALL';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Search and Top Controls */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search courses, topics, or instructors..."
            value={filters.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 pr-9 h-11 bg-card border-border/80 text-foreground"
            aria-label="Search catalog courses"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Sort & Format Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground hidden sm:inline" />
            <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
              Sort:
            </span>
            <select
              value={filters.sort}
              onChange={(e) =>
                handleFilterChange('sort', e.target.value as 'publishedAt' | 'title')
              }
              className="h-10 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Sort courses by"
            >
              {CATALOG_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Category Pills */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {CATALOG_CATEGORIES.map((cat) => {
          const isSelected = (filters.category || 'ALL') === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => handleFilterChange('category', cat.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Filter Row: Level, Delivery Mode, Language */}
      <div className="mb-6 flex flex-wrap items-center gap-3 border-y border-border/60 py-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters:</span>
        </div>

        {/* Level Select */}
        <select
          value={filters.level}
          onChange={(e) => handleFilterChange('level', e.target.value)}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Filter by level"
        >
          {CATALOG_LEVELS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Delivery Mode Select */}
        <select
          value={filters.deliveryMode}
          onChange={(e) =>
            handleFilterChange(
              'deliveryMode',
              e.target.value as 'SELF_PACED' | 'COHORT' | 'ALL',
            )
          }
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Filter by format"
        >
          {CATALOG_DELIVERY_MODES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Language Select */}
        <select
          value={filters.language}
          onChange={(e) => handleFilterChange('language', e.target.value)}
          className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Filter by language"
        >
          {CATALOG_LANGUAGES.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="ml-auto h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" />
            Reset all
          </Button>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Active:</span>
          {filters.search && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Search: &quot;{filters.search}&quot;
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="hover:text-destructive"
                aria-label="Remove search filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.category !== 'ALL' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Category: {filters.category}
              <button
                type="button"
                onClick={() => handleFilterChange('category', 'ALL')}
                className="hover:text-destructive"
                aria-label="Remove category filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.level !== 'ALL' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Level: {filters.level}
              <button
                type="button"
                onClick={() => handleFilterChange('level', 'ALL')}
                className="hover:text-destructive"
                aria-label="Remove level filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.deliveryMode !== 'ALL' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Format: {filters.deliveryMode}
              <button
                type="button"
                onClick={() => handleFilterChange('deliveryMode', 'ALL')}
                className="hover:text-destructive"
                aria-label="Remove format filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.language !== 'ALL' && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Language: {filters.language}
              <button
                type="button"
                onClick={() => handleFilterChange('language', 'ALL')}
                className="hover:text-destructive"
                aria-label="Remove language filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* Main Grid / Status Views */}
      {isLoading ? (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading catalog courses"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-border/60 bg-card p-4 space-y-3"
            >
              <Skeleton className="aspect-[16/9] w-full rounded-lg" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-12 w-full" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-12 text-center">
          <p className="font-serif text-lg font-bold text-destructive">
            Failed to load courses
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An error occurred while fetching the course catalog.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-4 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : courses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card p-12 text-center">
          <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="font-serif text-xl font-bold tracking-tight">No courses found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {hasActiveFilters
              ? 'No courses matched your current filter criteria. Try broadening your search or resetting filters.'
              : 'Our instructors are currently preparing upcoming studio courses and cohorts. Check back soon!'}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearFilters}
              className="mt-5 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset all filters
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>

          {/* Cursor Pagination Controls */}
          {(meta?.hasMore || cursorHistory.length > 0) && (
            <div className="flex items-center justify-between border-t border-border/60 pt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreviousPage}
                disabled={cursorHistory.length === 0}
                className="gap-1.5"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <span className="text-xs text-muted-foreground">
                Page {cursorHistory.length + 1}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={!meta?.hasMore}
                className="gap-1.5"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
