import type {
  StaffAttempt,
  GradingInput,
  GradeEvent,
  AttemptsQuery,
  CursorResponse,
  Role,
} from '@lms/shared';
import { AttemptStatus } from '@lms/shared';

export { AttemptStatus };

export type { StaffAttempt, GradingInput, GradeEvent, AttemptsQuery, CursorResponse, Role };

export type StaffAttemptSummary = {
  attemptId: string;
  workspaceId: string;
  assessmentId: string;
  enrollmentId: string;
  number: number;
  status: AttemptStatus;
  version: number;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  totalPoints: string;
  awardedPoints: string | null;
  percent: string | null;
  passed: boolean | null;
  studentName?: string;
  studentEmail?: string;
};

export interface AttemptQuestionGradeInput {
  attemptQuestionId: string;
  answerId: string;
  awardedPoints: string;
  rubricScores: Array<{ criterionId: string; points: string }> | null;
  feedback: string | null;
}

export interface AttachmentDownloadResult {
  url: string;
  expiresAt: string;
}
