import {
  catalogCoursesResponseSchema,
  catalogCourseResponseSchema,
  publicProductsResponseSchema,
  publicProductResponseSchema,
  publicCohortsResponseSchema,
  publicWorkspaceResponseSchema,
  previewLessonResponseSchema,
  downloadResponseSchema,
  freeEnrollmentSchema,
  enrollmentResponseSchema,
  type FreeEnrollment,
  type Enrollment,
} from '@lms/shared';
import { api } from '@/lib/api';
import type {
  PublicCourse,
  PublicCourseDetail,
  CatalogCoursesQuery,
  PublicProduct,
  CatalogProductsQuery,
  PublicCohort,
  PublicWorkspace,
  PreviewLesson,
  DownloadCapability,
  PaginatedResult,
} from './types';

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
      searchParams.set(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * Fetch published courses for the public catalog with optional filters and cursor pagination.
 */
export async function fetchCatalogCourses(
  query: Partial<CatalogCoursesQuery> = {},
): Promise<PaginatedResult<PublicCourse>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/catalog/courses${qs}`, { skipAuthRefresh: true });
  const parsed = catalogCoursesResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

/**
 * Fetch course detail by course UUID.
 */
export async function fetchCatalogCourseDetail(courseId: string): Promise<PublicCourseDetail> {
  const raw = await api.get<unknown>(`/catalog/courses/${courseId}`, { skipAuthRefresh: true });
  const parsed = catalogCourseResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Resolve a course by either its UUID or its URL slug.
 * If UUID, directly requests `/catalog/courses/:courseId`.
 * Slugs resolve exactly; workspace disambiguates tenant-local slugs.
 */
export async function findCatalogCourseBySlug(
  idOrSlug: string,
  workspace?: string,
): Promise<PublicCourseDetail | null> {
  if (isUuid(idOrSlug)) {
    try {
      return await fetchCatalogCourseDetail(idOrSlug);
    } catch {
      return null;
    }
  }

  try {
    const raw = await api.get<unknown>(
      `/catalog/courses/by-slug/${encodeURIComponent(idOrSlug)}${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ''}`,
      { skipAuthRefresh: true },
    );
    return catalogCourseResponseSchema.parse(raw).data;
  } catch {
    return null;
  }
}

/**
 * Fetch approved preview content for a public preview lesson.
 */
export async function fetchPreviewLesson(
  courseId: string,
  lessonId: string,
): Promise<PreviewLesson> {
  const raw = await api.get<unknown>(`/catalog/courses/${courseId}/preview-lessons/${lessonId}`, {
    skipAuthRefresh: true,
  });
  const parsed = previewLessonResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Request signed download URL for a lesson attachment asset in a preview lesson.
 */
export async function requestPreviewAssetDownload(
  courseId: string,
  lessonId: string,
  assetId: string,
): Promise<DownloadCapability> {
  const raw = await api.post<unknown>(
    `/catalog/courses/${courseId}/preview-lessons/${lessonId}/assets/${assetId}/download`,
    {},
    { skipAuthRefresh: true },
  );
  const parsed = downloadResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Fetch public cohort schedules for a course.
 */
export async function fetchCatalogCohorts(
  courseId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<PaginatedResult<PublicCohort>> {
  const qs = buildQueryString(query);
  const raw = await api.get<unknown>(`/catalog/courses/${courseId}/cohorts${qs}`, {
    skipAuthRefresh: true,
  });
  const parsed = publicCohortsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

/**
 * Fetch public products (Courses, Bundles, Subscription Plans).
 */
export async function fetchCatalogProducts(
  query: Partial<CatalogProductsQuery> = {},
): Promise<PaginatedResult<PublicProduct>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/catalog/products${qs}`, { skipAuthRefresh: true });
  const parsed = publicProductsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

/**
 * Fetch public product detail by product UUID.
 */
export async function fetchCatalogProductDetail(productId: string): Promise<PublicProduct> {
  const raw = await api.get<unknown>(`/catalog/products/${productId}`, {
    skipAuthRefresh: true,
  });
  const parsed = publicProductResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Fetch public workspace / academy branding by slug.
 */
export async function fetchPublicWorkspace(slug: string): Promise<PublicWorkspace> {
  const raw = await api.get<unknown>(`/catalog/workspaces/${slug}`, {
    skipAuthRefresh: true,
  });
  const parsed = publicWorkspaceResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Enroll the signed-in user in a free published course.
 * Sends POST /courses/:courseId/enroll with validated FreeEnrollment body
 * and an Idempotency-Key header (16–128 visible ASCII).
 * Parses the response using the shared enrollment response schema.
 */
export async function enrollFreeCourse(
  courseId: string,
  body: FreeEnrollment = {},
  idempotencyKey?: string,
): Promise<Enrollment> {
  const validatedBody = freeEnrollmentSchema.parse(body);
  const key = idempotencyKey ?? crypto.randomUUID();
  const raw = await api.post<unknown>(`/courses/${courseId}/enroll`, validatedBody, {
    headers: {
      'Idempotency-Key': key,
    },
  });
  const parsed = enrollmentResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Fetch the signed-in user's existing enrollment for a course, if any.
 */
export async function fetchMyCourseEnrollments(courseId: string): Promise<Enrollment | null> {
  const raw = await api.get<{ data: Enrollment[] }>(`/me/enrollments?courseId=${courseId}`);
  return raw.data?.[0] ?? null;
}
