import type { z } from 'zod';
import { ApiError } from '@/lib/api';
import type {
  publicCourseSchema,
  publicCourseDetailSchema,
  catalogCoursesQuerySchema,
  catalogPriceSchema,
  publicOutlineLessonSchema,
  publicProductSchema,
  catalogProductsQuerySchema,
  publicCohortSchema,
  publicWorkspaceSchema,
  previewLessonSchema,
  downloadCapabilitySchema,
  cursorMetaSchema,
  priceSchema,
} from '@lms/shared';

export type PublicCourse = z.infer<typeof publicCourseSchema>;
export type PublicCourseDetail = z.infer<typeof publicCourseDetailSchema>;
export type CatalogPrice = z.infer<typeof catalogPriceSchema>;
export type PublicOutlineLesson = z.infer<typeof publicOutlineLessonSchema>;
export type CatalogCoursesQuery = z.infer<typeof catalogCoursesQuerySchema>;

export type PublicProduct = z.infer<typeof publicProductSchema>;
export type ProductPrice = z.infer<typeof priceSchema>;
export type CatalogProductsQuery = z.infer<typeof catalogProductsQuerySchema>;

export type PublicCohort = z.infer<typeof publicCohortSchema>;
export type PublicWorkspace = z.infer<typeof publicWorkspaceSchema>;
export type PreviewLesson = z.infer<typeof previewLessonSchema>;
export type DownloadCapability = z.infer<typeof downloadCapabilitySchema>;
export type CursorMeta = z.infer<typeof cursorMetaSchema>;

export interface PaginatedResult<T> {
  data: T[];
  meta: CursorMeta;
}

export interface CatalogFilterState {
  search?: string;
  workspace?: string;
  category?: string;
  language?: string;
  level?: string;
  deliveryMode?: 'SELF_PACED' | 'COHORT' | 'ALL';
  sort?: 'publishedAt' | 'title';
  cursor?: string;
  limit?: number;
}

export const CATALOG_CATEGORIES = [
  { label: 'All Categories', value: 'ALL' },
  { label: 'Software Engineering', value: 'software-engineering' },
  { label: 'Design & Creative Systems', value: 'design-creative-systems' },
  { label: 'Data & AI', value: 'data-ai' },
  { label: 'Product & Leadership', value: 'product-leadership' },
] as const;

export const CATALOG_LEVELS = [
  { label: 'All Levels', value: 'ALL' },
  { label: 'Beginner', value: 'Beginner' },
  { label: 'Intermediate', value: 'Intermediate' },
  { label: 'Advanced', value: 'Advanced' },
] as const;

export const CATALOG_DELIVERY_MODES = [
  { label: 'All Formats', value: 'ALL' },
  { label: 'Self-Paced', value: 'SELF_PACED' },
  { label: 'Live Cohort', value: 'COHORT' },
] as const;

export const CATALOG_LANGUAGES = [
  { label: 'All Languages', value: 'ALL' },
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'German', value: 'de' },
  { label: 'French', value: 'fr' },
] as const;

export const CATALOG_SORT_OPTIONS = [
  { label: 'Recently Published', value: 'publishedAt' },
  { label: 'Course Title (A-Z)', value: 'title' },
] as const;

export const PRODUCT_TYPE_OPTIONS = [
  { label: 'All Products', value: 'ALL' },
  { label: 'Single Courses', value: 'COURSE' },
  { label: 'Course Bundles', value: 'BUNDLE' },
  { label: 'Subscription Plans', value: 'SUBSCRIPTION_PLAN' },
] as const;

/**
 * Format currency amount in cents/minor units (e.g. 4900 -> $49.00).
 */
export function formatPriceMinor(
  priceMinor: number,
  currency = 'USD',
  interval: string | null = null,
  intervalCount = 1,
): string {
  if (priceMinor <= 0) return 'Free';
  const amount = priceMinor / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

  if (!interval) return formatted;

  const unit = interval.toLowerCase();
  if (intervalCount > 1) {
    return `${formatted} / ${intervalCount} ${unit}s`;
  }
  return `${formatted} / ${unit}`;
}

/**
 * Format duration in minutes into a human-readable string (e.g. 135 -> "2h 15m").
 */
export function formatDurationMinutes(totalMinutes: number): string {
  if (!totalMinutes || totalMinutes <= 0) return 'Self-paced';
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format delivery mode enum into user-friendly text.
 */
export function formatDeliveryMode(mode: string): string {
  switch (mode) {
    case 'COHORT':
      return 'Live Cohort';
    case 'SELF_PACED':
      return 'Self-Paced';
    default:
      return mode;
  }
}

/**
 * Format level string into user-friendly text.
 */
export function formatLevel(level: string | null | undefined): string {
  if (!level) return 'All Levels';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Format ISO date string into readable date (e.g. "Oct 26, 2026").
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/**
 * Format date range for cohorts (e.g. "Nov 1 — Dec 15, 2026").
 */
export function formatDateRange(startsAt: string, endsAt: string | null | undefined): string {
  if (!endsAt) {
    return formatDate(startsAt);
  }
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startsAt} – ${endsAt}`;
  }

  const sameYear = start.getFullYear() === end.getFullYear();
  const startFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(start);

  const endFmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end);

  return `${startFmt} – ${endFmt}`;
}

/**
 * Format enrollment error into a clear, user-facing inline message.
 */
export function getEnrollmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const raw = error.envelope?.error?.message;
    const isGeneric =
      !raw ||
      raw === 'Request failed' ||
      raw === 'Bad Request' ||
      raw === 'Conflict' ||
      raw === 'Forbidden' ||
      raw === 'Internal Server Error' ||
      raw === 'Unprocessable Entity';

    if (!isGeneric && raw) {
      return raw;
    }

    switch (error.status) {
      case 400:
        return 'Invalid enrollment request. Please check your selections and try again.';
      case 403:
        return 'You do not have permission to enroll in this course.';
      case 409:
        return 'You are already enrolled in this course.';
      case 422:
        return 'Enrollment cannot be processed. Please check cohort availability or course prerequisites.';
      case 429:
        return 'Too many enrollment attempts. Please slow down and try again shortly.';
      case 503:
        return 'Enrollment service is temporarily unavailable. Please try again in a few moments.';
      default:
        return raw || 'An unexpected error occurred during enrollment. Please try again.';
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}
