import { api } from '@/lib/api';
import {
  enrollmentResponseSchema,
  learnerOutlineResponseSchema,
  learnerLessonResponseSchema,
  progressResponseSchema,
  progressUpdateSchema,
  downloadResponseSchema,
  enrollmentResultsResponseSchema,
  type Enrollment,
  type LearnerOutline,
  type LearnerLesson,
  type LessonProgress,
  type ProgressUpdate,
  type DownloadCapability,
  type ReleasedResult,
} from '@lms/shared';

/**
 * Fetch learner enrollment status, progress percentage, and access evaluation.
 */
export async function fetchEnrollment(enrollmentId: string): Promise<Enrollment> {
  const response = await api.get<unknown>(`/me/enrollments/${enrollmentId}`);
  const parsed = enrollmentResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Fetch course outline with section/lesson hierarchy, completion states, and lock reasons.
 */
export async function fetchLearnerOutline(enrollmentId: string): Promise<LearnerOutline> {
  const response = await api.get<unknown>(`/me/enrollments/${enrollmentId}/outline`);
  const parsed = learnerOutlineResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Fetch authorized lesson content and asset metadata for the active learner.
 * Returns 403 / access error if lesson is locked.
 */
export async function fetchLearnerLesson(
  enrollmentId: string,
  lessonId: string,
): Promise<LearnerLesson> {
  const response = await api.get<unknown>(`/me/enrollments/${enrollmentId}/lessons/${lessonId}`);
  const parsed = learnerLessonResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Send progress update: ACKNOWLEDGE, VIEW, or bounded PLAYBACK heartbeat.
 * Never includes browser-dictated pass/grade fields.
 */
export async function updateLessonProgress(
  enrollmentId: string,
  lessonId: string,
  body: ProgressUpdate,
): Promise<LessonProgress> {
  const validatedBody = progressUpdateSchema.parse(body);
  const response = await api.put<unknown>(
    `/me/enrollments/${enrollmentId}/lessons/${lessonId}/progress`,
    validatedBody,
  );
  const parsed = progressResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Request signed, short-lived (60s) download or playback URL for a lesson asset.
 * Enforces server-side READY status and active enrollment verification.
 * Note: Never store signed URLs in persistent storage (e.g. localStorage); keep only in ephemeral memory.
 */
export async function requestLessonAssetDownload(
  enrollmentId: string,
  lessonId: string,
  assetId: string,
): Promise<DownloadCapability> {
  const response = await api.post<unknown>(
    `/me/enrollments/${enrollmentId}/lessons/${lessonId}/assets/${assetId}/download`,
    {},
  );
  const parsed = downloadResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Obtain short-lived join URL for a live session lesson.
 */
export async function joinLiveSession(
  enrollmentId: string,
  sessionId: string,
): Promise<DownloadCapability> {
  const response = await api.post<unknown>(
    `/me/enrollments/${enrollmentId}/live-sessions/${sessionId}/join`,
    {},
  );
  const parsed = downloadResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Fetch released assessment results for the course enrollment.
 */
export async function fetchEnrollmentResults(enrollmentId: string): Promise<ReleasedResult[]> {
  const response = await api.get<unknown>(`/me/enrollments/${enrollmentId}/results`);
  const parsed = enrollmentResultsResponseSchema.parse(response);
  return parsed.data;
}
