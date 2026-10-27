import {
  coursesResponseSchema,
  courseResponseSchema,
  courseStaffListResponseSchema,
  courseStaffResponseSchema,
  categoriesResponseSchema,
  sectionsResponseSchema,
  sectionResponseSchema,
  lessonResponseSchema,
  lessonAssetResponseSchema,
  cohortsResponseSchema,
  cohortResponseSchema,
  liveSessionResponseSchema,
  attendanceListResponseSchema,
  attendanceResponseSchema,
  assetUploadResponseSchema,
  assetResponseSchema,
  assetCompleteResponseSchema,
  type Course,
  type CourseCreate,
  type CourseUpdate,
  type StaffCoursesQuery,
  type CourseStaff,
  type CourseStaffUpsert,
  type CoursePrerequisites,
  type Section,
  type SectionCreate,
  type SectionUpdate,
  type Lesson,
  type LessonCreate,
  type LessonUpdate,
  type Cohort,
  type CohortCreate,
  type CohortUpdate,
  type CohortReleaseUpsert,
  type LiveSession,
  type LiveSessionCreate,
  type LiveSessionUpdate,
  type AttendanceUpdate,
  type Asset,
  type AssetUpload,
  type AssetPurpose,
  type CursorResponse,
} from '@lms/shared';
import { api } from '@/lib/api';

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

function unwrapData<T>(payload: unknown): T {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// ==========================================
// Course Endpoints
// ==========================================

export async function fetchStaffCourses(
  workspaceId: string,
  query: Partial<StaffCoursesQuery> = {},
): Promise<CursorResponse<Course>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/workspaces/${encodeURIComponent(workspaceId)}/courses${qs}`);
  const parsed = coursesResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function fetchCourse(workspaceId: string, courseId: string): Promise<Course> {
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}`,
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

export async function createCourse(workspaceId: string, data: CourseCreate): Promise<Course> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses`,
    data,
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateCourse(
  workspaceId: string,
  courseId: string,
  data: CourseUpdate,
): Promise<Course> {
  const raw = await api.patch<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}`,
    data,
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteCourse(workspaceId: string, courseId: string): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}`,
  );
}

export async function submitCourseForReview(
  workspaceId: string,
  courseId: string,
  version: number,
): Promise<Course> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/submit-review`,
    { version },
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

export async function publishCourse(
  workspaceId: string,
  courseId: string,
  version: number,
): Promise<Course> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/publish`,
    { version },
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

export async function archiveCourse(
  workspaceId: string,
  courseId: string,
  version: number,
): Promise<Course> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/archive`,
    { version },
  );
  const parsed = courseResponseSchema.parse(raw);
  return parsed.data;
}

// ==========================================
// Course Staff & Settings Endpoints
// ==========================================

export async function fetchCourseStaff(
  workspaceId: string,
  courseId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<CursorResponse<CourseStaff>> {
  const qs = buildQueryString(query);
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/staff${qs}`,
  );
  const parsed = courseStaffListResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function upsertCourseStaff(
  workspaceId: string,
  courseId: string,
  userId: string,
  data: CourseStaffUpsert,
): Promise<CourseStaff> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/staff/${encodeURIComponent(userId)}`,
    data,
  );
  const parsed = courseStaffResponseSchema.parse(raw);
  return parsed.data;
}

export async function removeCourseStaff(
  workspaceId: string,
  courseId: string,
  userId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/staff/${encodeURIComponent(userId)}`,
  );
}

export async function updateCourseCategories(
  workspaceId: string,
  courseId: string,
  categoryIds: string[],
): Promise<void> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/categories`,
    { categoryIds },
  );
  categoriesResponseSchema.parse(raw);
}

export async function updateCoursePrerequisites(
  workspaceId: string,
  courseId: string,
  prerequisites: CoursePrerequisites['prerequisites'],
): Promise<void> {
  await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/prerequisites`,
    { prerequisites },
  );
}

// ==========================================
// Curriculum: Section Endpoints
// ==========================================

export async function fetchCourseSections(
  workspaceId: string,
  courseId: string,
): Promise<Section[]> {
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections`,
  );
  try {
    const parsed = sectionsResponseSchema.parse(raw);
    return parsed.data;
  } catch {
    return unwrapData<Section[]>(raw);
  }
}

export async function createSection(
  workspaceId: string,
  courseId: string,
  data: SectionCreate,
): Promise<Section> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections`,
    data,
  );
  const parsed = sectionResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateSection(
  workspaceId: string,
  courseId: string,
  sectionId: string,
  data: SectionUpdate,
): Promise<Section> {
  const raw = await api.patch<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
    data,
  );
  const parsed = sectionResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteSection(
  workspaceId: string,
  courseId: string,
  sectionId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}`,
  );
}

export async function reorderSections(
  workspaceId: string,
  courseId: string,
  ids: string[],
): Promise<Section[]> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections/order`,
    { ids },
  );
  const parsed = sectionsResponseSchema.parse(raw);
  return parsed.data;
}

// ==========================================
// Curriculum: Lesson Endpoints
// ==========================================

export async function createLesson(
  workspaceId: string,
  courseId: string,
  sectionId: string,
  data: LessonCreate,
): Promise<Lesson> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/lessons`,
    data,
  );
  const parsed = lessonResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchLesson(
  workspaceId: string,
  courseId: string,
  lessonId: string,
): Promise<Lesson> {
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
  );
  const parsed = lessonResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateLesson(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  data: LessonUpdate,
): Promise<Lesson> {
  const raw = await api.patch<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
    data,
  );
  const parsed = lessonResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteLesson(
  workspaceId: string,
  courseId: string,
  lessonId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`,
  );
}

export async function reorderLessons(
  workspaceId: string,
  courseId: string,
  sectionId: string,
  ids: string[],
): Promise<Lesson[]> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/sections/${encodeURIComponent(sectionId)}/lessons/order`,
    { ids },
  );
  return unwrapData<Lesson[]>(raw);
}

export async function updateLessonPrerequisites(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  requiredLessonIds: string[],
): Promise<string[]> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/prerequisites`,
    { requiredLessonIds },
  );
  return unwrapData<string[]>(raw);
}

export async function attachLessonAsset(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  data: { assetId: string; purpose: AssetPurpose; position: number },
): Promise<{ id: string; assetId: string; purpose: AssetPurpose; position: number }> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/assets`,
    data,
  );
  const parsed = lessonAssetResponseSchema.parse(raw);
  return parsed.data;
}

export async function detachLessonAsset(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  assetId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/assets/${encodeURIComponent(assetId)}`,
  );
}

export async function fetchLessonPreview(
  workspaceId: string,
  courseId: string,
  lessonId: string,
): Promise<Lesson> {
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/preview`,
  );
  const parsed = lessonResponseSchema.parse(raw);
  return parsed.data;
}

// ==========================================
// Cohorts Endpoints
// ==========================================

export async function fetchCourseCohorts(
  workspaceId: string,
  courseId: string,
  query: { cursor?: string; limit?: number } = {},
): Promise<CursorResponse<Cohort>> {
  const qs = buildQueryString(query);
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts${qs}`,
  );
  const parsed = cohortsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function createCourseCohort(
  workspaceId: string,
  courseId: string,
  data: CohortCreate,
): Promise<Cohort> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts`,
    data,
  );
  const parsed = cohortResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateCourseCohort(
  workspaceId: string,
  courseId: string,
  cohortId: string,
  data: CohortUpdate,
): Promise<Cohort> {
  const raw = await api.patch<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts/${encodeURIComponent(cohortId)}`,
    data,
  );
  const parsed = cohortResponseSchema.parse(raw);
  return parsed.data;
}

export async function deleteCourseCohort(
  workspaceId: string,
  courseId: string,
  cohortId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts/${encodeURIComponent(cohortId)}`,
  );
}

export async function upsertCohortRelease(
  workspaceId: string,
  courseId: string,
  cohortId: string,
  lessonId: string,
  data: CohortReleaseUpsert,
): Promise<CohortReleaseUpsert> {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts/${encodeURIComponent(cohortId)}/releases/${encodeURIComponent(lessonId)}`,
    data,
  );
  return unwrapData<CohortReleaseUpsert>(raw);
}

export async function deleteCohortRelease(
  workspaceId: string,
  courseId: string,
  cohortId: string,
  lessonId: string,
): Promise<void> {
  await api.delete(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/cohorts/${encodeURIComponent(cohortId)}/releases/${encodeURIComponent(lessonId)}`,
  );
}

// ==========================================
// Live Sessions Endpoints
// ==========================================

export async function createLiveSession(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  data: LiveSessionCreate,
): Promise<LiveSession> {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}/live-sessions`,
    data,
  );
  const parsed = liveSessionResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateLiveSession(
  workspaceId: string,
  courseId: string,
  sessionId: string,
  data: LiveSessionUpdate,
): Promise<LiveSession> {
  const raw = await api.patch<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}`,
    data,
  );
  const parsed = liveSessionResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchLiveSessionAttendance(
  workspaceId: string,
  courseId: string,
  sessionId: string,
  query: { cursor?: string; limit?: number } = {},
) {
  const qs = buildQueryString(query);
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}/attendance${qs}`,
  );
  const parsed = attendanceListResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function updateLiveSessionAttendance(
  workspaceId: string,
  courseId: string,
  sessionId: string,
  enrollmentId: string,
  data: AttendanceUpdate,
) {
  const raw = await api.put<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/live-sessions/${encodeURIComponent(sessionId)}/attendance/${encodeURIComponent(enrollmentId)}`,
    data,
  );
  const parsed = attendanceResponseSchema.parse(raw);
  return parsed.data;
}

// ==========================================
// Media & Assets Upload / Scan Flow
// ==========================================

export async function requestAssetUpload(workspaceId: string, data: AssetUpload) {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/assets/uploads`,
    data,
  );
  const parsed = assetUploadResponseSchema.parse(raw);
  return parsed.data;
}

export async function uploadAssetBinary(
  uploadUrl: string,
  method: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, uploadUrl, true);

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.round((evt.loaded / evt.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Binary upload failed with HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during binary upload'));
    };

    xhr.send(file);
  });
}

export async function completeAssetUpload(workspaceId: string, assetId: string) {
  const raw = await api.post<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}/complete`,
    {},
  );
  const parsed = assetCompleteResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchAsset(workspaceId: string, assetId: string): Promise<Asset> {
  const raw = await api.get<unknown>(
    `/workspaces/${encodeURIComponent(workspaceId)}/assets/${encodeURIComponent(assetId)}`,
  );
  const parsed = assetResponseSchema.parse(raw);
  return parsed.data;
}

export async function pollAssetScan(
  workspaceId: string,
  assetId: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onUpdate?: (asset: Asset) => void;
  } = {},
): Promise<Asset> {
  const { maxAttempts = 30, intervalMs = 1500, onUpdate } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const asset = await fetchAsset(workspaceId, assetId);
    if (onUpdate) onUpdate(asset);

    if (asset.status === 'READY') {
      return asset;
    }

    if (asset.status === 'REJECTED') {
      throw new Error(`Asset was rejected during scan: ${asset.rejectionCode ?? 'REJECTED'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Asset virus scan timed out while in SCANNING status');
}
