'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCatalogCourses,
  fetchCatalogCourseDetail,
  findCatalogCourseBySlug,
  fetchPreviewLesson,
  requestPreviewAssetDownload,
  fetchCatalogCohorts,
  fetchCatalogProducts,
  fetchCatalogProductDetail,
  fetchPublicWorkspace,
  enrollFreeCourse,
  fetchMyCourseEnrollments,
} from './api';
import type { Enrollment, FreeEnrollment } from '@lms/shared';
import type {
  CatalogCoursesQuery,
  CatalogProductsQuery,
  PublicCourse,
  PublicCourseDetail,
  PublicProduct,
  PublicCohort,
  PublicWorkspace,
  PreviewLesson,
  DownloadCapability,
  PaginatedResult,
} from './types';

export const CATALOG_QUERY_KEYS = {
  all: ['catalog'] as const,
  courses: (params?: Partial<CatalogCoursesQuery>) => ['catalog', 'courses', params] as const,
  courseDetail: (idOrSlug: string) => ['catalog', 'course-detail', idOrSlug] as const,
  courseEnrollment: (courseId: string) => ['catalog', 'course-enrollment', courseId] as const,
  previewLesson: (courseId: string, lessonId: string) =>
    ['catalog', 'preview-lesson', courseId, lessonId] as const,
  cohorts: (courseId: string) => ['catalog', 'cohorts', courseId] as const,
  products: (params?: Partial<CatalogProductsQuery>) => ['catalog', 'products', params] as const,
  productDetail: (productId: string) => ['catalog', 'product-detail', productId] as const,
  workspace: (slug: string) => ['catalog', 'workspace', slug] as const,
};

/**
 * Query for public catalog courses with search, filters, and pagination.
 */
export function useCatalogCoursesQuery(
  params: Partial<CatalogCoursesQuery> = {},
  options?: { enabled?: boolean; initialData?: PaginatedResult<PublicCourse> },
) {
  return useQuery<PaginatedResult<PublicCourse>>({
    queryKey: CATALOG_QUERY_KEYS.courses(params),
    initialData: options?.initialData,
    queryFn: () => fetchCatalogCourses(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Query for course detail by course UUID.
 */
export function useCatalogCourseDetailQuery(courseId: string, options?: { enabled?: boolean }) {
  return useQuery<PublicCourseDetail>({
    queryKey: CATALOG_QUERY_KEYS.courseDetail(courseId),
    queryFn: () => fetchCatalogCourseDetail(courseId),
    enabled: Boolean(courseId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Query for course detail by slug or UUID.
 */
export function useCatalogCourseBySlugQuery(idOrSlug: string, options?: { enabled?: boolean }) {
  return useQuery<PublicCourseDetail | null>({
    queryKey: CATALOG_QUERY_KEYS.courseDetail(idOrSlug),
    queryFn: () => findCatalogCourseBySlug(idOrSlug),
    enabled: Boolean(idOrSlug) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Query for preview lesson content (accessible to the public for preview-flagged lessons).
 */
export function usePreviewLessonQuery(
  courseId: string,
  lessonId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery<PreviewLesson>({
    queryKey: lessonId
      ? CATALOG_QUERY_KEYS.previewLesson(courseId, lessonId)
      : ['catalog', 'preview-lesson', courseId, 'none'],
    queryFn: () => {
      if (!lessonId) throw new Error('No lesson selected for preview');
      return fetchPreviewLesson(courseId, lessonId);
    },
    enabled: Boolean(courseId && lessonId) && (options?.enabled ?? true),
    staleTime: 5 * 60_000,
  });
}

/**
 * Mutation to request signed download capability URL for a preview lesson attachment.
 */
export function usePreviewAssetDownloadMutation() {
  return useMutation<
    DownloadCapability,
    Error,
    { courseId: string; lessonId: string; assetId: string }
  >({
    mutationFn: ({ courseId, lessonId, assetId }) =>
      requestPreviewAssetDownload(courseId, lessonId, assetId),
  });
}

/**
 * Query for public cohorts schedule of a course.
 */
export function useCatalogCohortsQuery(courseId: string, options?: { enabled?: boolean }) {
  return useQuery<PaginatedResult<PublicCohort>>({
    queryKey: CATALOG_QUERY_KEYS.cohorts(courseId),
    queryFn: () => fetchCatalogCohorts(courseId),
    enabled: Boolean(courseId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Query for public products (courses, bundles, subscription plans).
 */
export function useCatalogProductsQuery(
  params: Partial<CatalogProductsQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery<PaginatedResult<PublicProduct>>({
    queryKey: CATALOG_QUERY_KEYS.products(params),
    queryFn: () => fetchCatalogProducts(params),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Query for public product detail.
 */
export function useCatalogProductDetailQuery(productId: string, options?: { enabled?: boolean }) {
  return useQuery<PublicProduct>({
    queryKey: CATALOG_QUERY_KEYS.productDetail(productId),
    queryFn: () => fetchCatalogProductDetail(productId),
    enabled: Boolean(productId) && (options?.enabled ?? true),
    staleTime: 60_000,
  });
}

/**
 * Query for public academy workspace branding.
 */
export function usePublicWorkspaceQuery(slug: string, options?: { enabled?: boolean }) {
  return useQuery<PublicWorkspace>({
    queryKey: CATALOG_QUERY_KEYS.workspace(slug),
    queryFn: () => fetchPublicWorkspace(slug),
    enabled: Boolean(slug) && (options?.enabled ?? true),
    staleTime: 5 * 60_000,
  });
}

/**
 * Query for the current user's existing enrollment in a course.
 */
export function useCourseEnrollmentQuery(courseId: string, options?: { enabled?: boolean }) {
  return useQuery<Enrollment | null>({
    queryKey: CATALOG_QUERY_KEYS.courseEnrollment(courseId),
    queryFn: () => fetchMyCourseEnrollments(courseId),
    enabled: Boolean(courseId) && (options?.enabled ?? true),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Mutation to enroll the signed-in user in a free course.
 */
export function useEnrollFreeCourseMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    Enrollment,
    unknown,
    { courseId: string; body?: FreeEnrollment; idempotencyKey?: string }
  >({
    mutationFn: ({ courseId, body, idempotencyKey }) =>
      enrollFreeCourse(courseId, body, idempotencyKey),
    onSuccess: (enrollment, variables) => {
      queryClient.setQueryData(CATALOG_QUERY_KEYS.courseEnrollment(variables.courseId), enrollment);
      void queryClient.invalidateQueries({
        queryKey: CATALOG_QUERY_KEYS.courseEnrollment(variables.courseId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['student', 'enrollments'],
      });
    },
  });
}
