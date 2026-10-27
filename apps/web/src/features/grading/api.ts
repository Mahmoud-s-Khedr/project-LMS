import {
  attemptsResponseSchema,
  staffAttemptResponseSchema,
  downloadResponseSchema,
  type StaffAttempt,
  type GradingInput,
  type AttemptsQuery,
  type CursorResponse,
} from '@lms/shared';
import { api } from '@/lib/api';
import type { StaffAttemptSummary, AttachmentDownloadResult } from './types';

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

/**
 * Fetch manual grading queue of attempts for a course assessment.
 */
export async function fetchAssessmentAttempts(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  query: Partial<AttemptsQuery> = {},
): Promise<CursorResponse<StaffAttemptSummary>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/attempts${qs}`,
  );
  const parsed = attemptsResponseSchema.parse(raw);
  return {
    data: parsed.data as unknown as StaffAttemptSummary[],
    meta: parsed.meta,
  };
}

/**
 * Fetch detailed staff attempt snapshot including student answers, author keys, and rubric.
 */
export async function fetchStaffAttemptDetail(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
): Promise<StaffAttempt> {
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/attempts/${attemptId}`,
  );
  const parsed = staffAttemptResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Submit attempt grades (draft or finalized).
 */
export async function submitAttemptGrades(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
  input: GradingInput,
): Promise<StaffAttempt> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/attempts/${attemptId}/grades`,
    input,
  );
  const parsed = staffAttemptResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Submit regrade for an already graded attempt with explicit audited reason.
 */
export async function regradeAttempt(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
  input: GradingInput,
): Promise<StaffAttempt> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/attempts/${attemptId}/regrade`,
    input,
  );
  const parsed = staffAttemptResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Void an attempt with required reason (Instructor or Admin only).
 */
export async function voidAttempt(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  attemptId: string,
  input: { version: number; reason: string },
): Promise<StaffAttempt> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/attempts/${attemptId}/void`,
    input,
  );
  const parsed = staffAttemptResponseSchema.parse(raw);
  return parsed.data;
}

/**
 * Request signed, temporary download URL for a student submission attachment.
 */
export async function requestAttemptAttachmentDownload(
  workspaceId: string,
  attemptId: string,
  assetId: string,
): Promise<AttachmentDownloadResult> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/attempts/${attemptId}/attachments/${assetId}/download`,
  );
  const parsed = downloadResponseSchema.parse(raw);
  return parsed.data;
}
