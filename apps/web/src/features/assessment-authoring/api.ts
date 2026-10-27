import {
  questionBanksResponseSchema,
  questionBankResponseSchema,
  authorQuestionsResponseSchema,
  authorQuestionResponseSchema,
  questionVersionsResponseSchema,
  questionVersionResponseSchema,
  assessmentResponseSchema,
  assessmentVersionResponseSchema,
  assessmentVersionsResponseSchema,
  assessmentQuestionSelectionResponseSchema,
  assessmentPoolSelectionResponseSchema,
  accommodationResponseSchema,
  type QuestionBank,
  type QuestionBankCreate,
  type QuestionBankUpdate,
  type QuestionBanksQuery,
  type AuthorQuestion,
  type AuthorQuestionVersion,
  type QuestionCreate,
  type QuestionUpdate,
  type QuestionsQuery,
  type AuthorQuestionPayload,
  type Assessment,
  type AssessmentCreate,
  type AssessmentVersionConfig,
  type AssessmentQuestionsReplace,
  type AssessmentPoolsReplace,
  type AccommodationUpsert,
  type CursorResponse,
  type CursorQuery,
} from '@lms/shared';
import { api } from '@/lib/api';
import { assessmentEtag } from './utils';
import type { AssessmentVersion } from './types';

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
      if (Array.isArray(value)) {
        value.forEach((v) => searchParams.append(key, String(v)));
      } else {
        searchParams.set(key, String(value));
      }
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

function toEtagHeader(
  supplied?: string | { id: string; updatedAt: Date | string },
): string | undefined {
  if (!supplied) return undefined;
  if (typeof supplied === 'string') {
    return supplied.startsWith('"') && supplied.endsWith('"') ? supplied : `"${supplied}"`;
  }
  return assessmentEtag(supplied);
}

// -------------------------------------------------------------
// Question Banks
// -------------------------------------------------------------

export async function fetchQuestionBanks(
  workspaceId: string,
  query: Partial<QuestionBanksQuery> = {},
): Promise<CursorResponse<QuestionBank>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/question-banks${qs}`);
  const parsed = questionBanksResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function createQuestionBank(
  workspaceId: string,
  input: QuestionBankCreate,
): Promise<QuestionBank> {
  const raw = await api.post<unknown>(`/workspaces/${workspaceId}/question-banks`, input);
  const parsed = questionBankResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateQuestionBank(
  workspaceId: string,
  bankId: string,
  input: QuestionBankUpdate,
  ifMatch?: string | { id: string; updatedAt: Date | string },
): Promise<QuestionBank> {
  const etag = toEtagHeader(ifMatch);
  const raw = await api.patch<unknown>(
    `/workspaces/${workspaceId}/question-banks/${bankId}`,
    input,
    etag ? { headers: { 'If-Match': etag } } : undefined,
  );
  const parsed = questionBankResponseSchema.parse(raw);
  return parsed.data;
}

export async function archiveQuestionBank(
  workspaceId: string,
  bankId: string,
  ifMatch?: string | { id: string; updatedAt: Date | string },
): Promise<void> {
  const etag = toEtagHeader(ifMatch);
  await api.delete<void>(
    `/workspaces/${workspaceId}/question-banks/${bankId}`,
    etag ? { headers: { 'If-Match': etag } } : undefined,
  );
}

// -------------------------------------------------------------
// Questions
// -------------------------------------------------------------

export async function fetchQuestionsInBank(
  workspaceId: string,
  bankId: string,
  query: Partial<QuestionsQuery> = {},
): Promise<CursorResponse<AuthorQuestion>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/question-banks/${bankId}/questions${qs}`,
  );
  const parsed = authorQuestionsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function fetchQuestionDetail(
  workspaceId: string,
  questionId: string,
): Promise<AuthorQuestion> {
  const raw = await api.get<unknown>(`/workspaces/${workspaceId}/questions/${questionId}`);
  const parsed = authorQuestionResponseSchema.parse(raw);
  return parsed.data;
}

export async function createQuestionInBank(
  workspaceId: string,
  bankId: string,
  input: QuestionCreate,
): Promise<AuthorQuestion> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/question-banks/${bankId}/questions`,
    input,
  );
  const parsed = authorQuestionResponseSchema.parse(raw);
  return parsed.data;
}

export async function updateQuestionMetadata(
  workspaceId: string,
  questionId: string,
  input: QuestionUpdate,
  ifMatch?: string | { id: string; updatedAt: Date | string },
): Promise<AuthorQuestion> {
  const etag = toEtagHeader(ifMatch);
  const raw = await api.patch<unknown>(
    `/workspaces/${workspaceId}/questions/${questionId}`,
    input,
    etag ? { headers: { 'If-Match': etag } } : undefined,
  );
  const parsed = authorQuestionResponseSchema.parse(raw);
  return parsed.data;
}

export async function createQuestionVersion(
  workspaceId: string,
  questionId: string,
  payload: AuthorQuestionPayload,
): Promise<AuthorQuestionVersion> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/questions/${questionId}/versions`,
    payload,
  );
  const parsed = questionVersionResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchQuestionVersions(
  workspaceId: string,
  questionId: string,
  query: Partial<CursorQuery> = {},
): Promise<CursorResponse<AuthorQuestionVersion>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/questions/${questionId}/versions${qs}`,
  );
  const parsed = questionVersionsResponseSchema.parse(raw);
  return {
    data: parsed.data,
    meta: parsed.meta,
  };
}

export async function archiveQuestion(
  workspaceId: string,
  questionId: string,
  ifMatch?: string | { id: string; updatedAt: Date | string },
): Promise<void> {
  const etag = toEtagHeader(ifMatch);
  await api.delete<void>(
    `/workspaces/${workspaceId}/questions/${questionId}`,
    etag ? { headers: { 'If-Match': etag } } : undefined,
  );
}

// -------------------------------------------------------------
// Assessments
// -------------------------------------------------------------

export async function createAssessment(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  input: AssessmentCreate,
): Promise<Assessment> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/lessons/${lessonId}/assessment`,
    input,
  );
  const parsed = assessmentResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchAssessmentDetail(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
): Promise<Assessment> {
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}`,
  );
  const parsed = assessmentResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchAssessmentVersions(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  query: Partial<CursorQuery> = {},
): Promise<CursorResponse<AssessmentVersion>> {
  const qs = buildQueryString(query as Record<string, unknown>);
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions${qs}`,
  );
  const parsed = assessmentVersionsResponseSchema.parse(raw);
  return {
    data: parsed.data as unknown as AssessmentVersion[],
    meta: parsed.meta,
  };
}

export async function fetchSelectedQuestions(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
): Promise<AssessmentQuestionsReplace> {
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}/questions`,
  );
  const parsed = assessmentQuestionSelectionResponseSchema.parse(raw);
  return parsed.data;
}

export async function fetchSelectedPools(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
): Promise<AssessmentPoolsReplace> {
  const raw = await api.get<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}/pools`,
  );
  const parsed = assessmentPoolSelectionResponseSchema.parse(raw);
  return parsed.data;
}

export async function createAssessmentVersion(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
): Promise<AssessmentVersion> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions`,
    {},
  );
  const parsed = assessmentVersionResponseSchema.parse(raw);
  return parsed.data as unknown as AssessmentVersion;
}

export async function updateAssessmentVersion(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
  input: Partial<AssessmentVersionConfig> & { version: number },
): Promise<AssessmentVersion> {
  const raw = await api.patch<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}`,
    input,
  );
  const parsed = assessmentVersionResponseSchema.parse(raw);
  return parsed.data as unknown as AssessmentVersion;
}

export async function replaceAssessmentQuestions(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
  input: AssessmentQuestionsReplace,
): Promise<AssessmentVersion> {
  const raw = await api.put<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}/questions`,
    input,
  );
  const parsed = assessmentVersionResponseSchema.parse(raw);
  return parsed.data as unknown as AssessmentVersion;
}

export async function replaceAssessmentPools(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
  input: AssessmentPoolsReplace,
): Promise<AssessmentVersion> {
  const raw = await api.put<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}/pools`,
    input,
  );
  const parsed = assessmentVersionResponseSchema.parse(raw);
  return parsed.data as unknown as AssessmentVersion;
}

export async function publishAssessmentVersion(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  versionId: string,
): Promise<AssessmentVersion> {
  const raw = await api.post<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/versions/${versionId}/publish`,
    {},
  );
  const parsed = assessmentVersionResponseSchema.parse(raw);
  return parsed.data as unknown as AssessmentVersion;
}

export async function upsertAccommodation(
  workspaceId: string,
  courseId: string,
  assessmentId: string,
  enrollmentId: string,
  input: AccommodationUpsert,
): Promise<unknown> {
  const raw = await api.put<unknown>(
    `/workspaces/${workspaceId}/courses/${courseId}/assessments/${assessmentId}/accommodations/${enrollmentId}`,
    input,
  );
  const parsed = accommodationResponseSchema.parse(raw);
  return parsed.data;
}
