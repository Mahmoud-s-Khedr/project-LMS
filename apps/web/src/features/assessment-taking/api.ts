import { api } from '@/lib/api';
import {
  learnerAssessmentResponseSchema,
  attemptStartResponseSchema,
  learnerAttemptResponseSchema,
  answerSaveResponseSchema,
  answerSaveSchema,
  attemptSubmitResponseSchema,
  releasedResultResponseSchema,
  downloadResponseSchema,
  assetUploadResponseSchema,
  assetCompleteResponseSchema,
  assetResponseSchema,
  type LearnerAssessment,
  type AttemptStart,
  type LearnerAttempt,
  type SavedAnswer,
  type AnswerSave,
  type AttemptState,
  type ReleasedResult,
  type DownloadCapability,
} from '@lms/shared';

/**
 * Fetch learner assessment instructions, timing limits, remaining attempts, and policies.
 */
export async function fetchLearnerAssessment(
  enrollmentId: string,
  assessmentId: string,
): Promise<LearnerAssessment> {
  const response = await api.get<unknown>(
    `/me/enrollments/${enrollmentId}/assessments/${assessmentId}`,
  );
  const parsed = learnerAssessmentResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Start or resume an assessment attempt.
 * Freezes randomized attempt question sequence, options, and server deadlineAt.
 * Sends stable 16–128 visible ASCII Idempotency-Key reused across retries.
 */
export async function startAssessmentAttempt(
  enrollmentId: string,
  assessmentId: string,
  idempotencyKey?: string,
): Promise<AttemptStart> {
  const key = idempotencyKey ?? crypto.randomUUID();
  const response = await api.post<unknown>(
    `/me/enrollments/${enrollmentId}/assessments/${assessmentId}/attempts`,
    {},
    { headers: { 'Idempotency-Key': key } },
  );
  const parsed = attemptStartResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Fetch current snapshot of an attempt, including saved responses and remaining time window.
 */
export async function fetchAttempt(attemptId: string): Promise<LearnerAttempt> {
  const response = await api.get<unknown>(`/me/attempts/${attemptId}`);
  const parsed = learnerAttemptResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Save / autosave a single question response in the attempt.
 * Server validates version, discriminated type payload, and server deadline enforcement.
 */
export async function saveAnswer(
  attemptId: string,
  attemptQuestionId: string,
  body: AnswerSave,
): Promise<SavedAnswer> {
  const validatedBody = answerSaveSchema.parse(body);
  const response = await api.put<unknown>(
    `/me/attempts/${attemptId}/answers/${attemptQuestionId}`,
    validatedBody,
  );
  const parsed = answerSaveResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Perform idempotent final submission of the attempt.
 * Server deadline wins; returns finalized or grading attempt state.
 * Sends stable 16–128 visible ASCII Idempotency-Key reused across retries.
 */
export async function submitAttempt(
  attemptId: string,
  idempotencyKey?: string,
): Promise<AttemptState> {
  const key = idempotencyKey ?? crypto.randomUUID();
  const response = await api.post<unknown>(
    `/me/attempts/${attemptId}/submit`,
    {},
    { headers: { 'Idempotency-Key': key } },
  );
  const parsed = attemptSubmitResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Fetch released score and question feedback.
 * If grading is pending or held per feedback policy, throws ApiError with code GRADE_NOT_RELEASED (409).
 */
export async function fetchAttemptResult(attemptId: string): Promise<ReleasedResult> {
  const response = await api.get<unknown>(`/me/attempts/${attemptId}/result`);
  const parsed = releasedResultResponseSchema.parse(response);
  return parsed.data;
}

/**
 * Compute SHA-256 hex digest of file in browser for secure asset upload declaration.
 */
async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Complete secure upload pipeline for student assessment attachments:
 * 1. Request presigned purpose-bound asset upload capability (SUBMISSION)
 * 2. Upload file directly to S3 / MinIO storage
 * 3. Enqueue verification and malware scan
 * 4. Poll until READY status
 */
export async function uploadAttemptAttachment(
  workspaceId: string,
  attemptId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ assetId: string; filename: string }> {
  const sha256 = await computeSha256(file);
  const sizeBytes = String(file.size);

  // 1. Create purpose-bound pending asset
  const uploadPayload = {
    purpose: 'SUBMISSION' as const,
    parentId: attemptId,
    filename: file.name,
    mimeType: file.type || 'application/pdf',
    sizeBytes,
    sha256,
  };

  const initResponse = await api.post<unknown>(
    `/workspaces/${workspaceId}/assets/uploads`,
    uploadPayload,
  );
  const { data: uploadInfo } = assetUploadResponseSchema.parse(initResponse);

  // 2. Upload directly to presigned URL
  onProgress?.(30);
  const uploadHeaders = new Headers(uploadInfo.headers);
  const putResponse = await fetch(uploadInfo.url, {
    method: uploadInfo.method,
    headers: uploadHeaders,
    body: file,
  });

  if (!putResponse.ok) {
    throw new Error(`Storage upload failed with status ${putResponse.status}`);
  }
  onProgress?.(60);

  // 3. Mark asset upload complete and enqueue scanning
  const completeResponse = await api.post<unknown>(
    `/workspaces/${workspaceId}/assets/${uploadInfo.assetId}/complete`,
    {},
  );
  assetCompleteResponseSchema.parse(completeResponse);
  onProgress?.(80);

  // 4. Poll until asset is READY (or fails)
  let attempts = 0;
  while (attempts < 20) {
    attempts++;
    await new Promise((r) => setTimeout(r, 1000));
    const assetRecord = await api.get<unknown>(
      `/workspaces/${workspaceId}/assets/${uploadInfo.assetId}`,
    );
    const { data: asset } = assetResponseSchema.parse(assetRecord);

    if (asset.status === 'READY') {
      onProgress?.(100);
      return { assetId: asset.id, filename: asset.filename };
    }
    if (asset.status === 'REJECTED' || asset.status === 'DELETED') {
      throw new Error(`Attachment rejected: ${asset.rejectionCode || 'Verification failed'}`);
    }
  }

  return { assetId: uploadInfo.assetId, filename: file.name };
}

/**
 * Obtain signed capability URL to view or download a submitted attachment.
 */
export async function downloadAttemptAttachment(
  attemptId: string,
  assetId: string,
): Promise<DownloadCapability> {
  const response = await api.post<unknown>(
    `/me/attempts/${attemptId}/attachments/${assetId}/download`,
    {},
  );
  const parsed = downloadResponseSchema.parse(response);
  return parsed.data;
}
