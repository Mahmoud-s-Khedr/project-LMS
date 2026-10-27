import type {
  QuestionBank,
  QuestionBankCreate,
  QuestionBankUpdate,
  AuthorQuestion,
  AuthorQuestionVersion,
  QuestionCreate,
  QuestionUpdate,
  AuthorQuestionPayload,
  Assessment,
  AssessmentCreate,
  AssessmentVersionConfig,
  AssessmentVersionUpdate,
  AssessmentQuestionsReplace,
  AssessmentPoolsReplace,
  AccommodationUpsert,
  Role,
  assessmentVersionSchema,
  z,
} from '@lms/shared';
import {
  QuestionType,
  AssessmentKind,
  AssessmentStatus,
  GradePolicy,
  FeedbackPolicy,
} from '@lms/shared';

export { QuestionType, AssessmentKind, AssessmentStatus, GradePolicy, FeedbackPolicy };

export type AssessmentVersion = z.infer<typeof assessmentVersionSchema>;

export type {
  QuestionBank,
  QuestionBankCreate,
  QuestionBankUpdate,
  AuthorQuestion,
  AuthorQuestionVersion,
  QuestionCreate,
  QuestionUpdate,
  AuthorQuestionPayload,
  Assessment,
  AssessmentCreate,
  AssessmentVersionConfig,
  AssessmentVersionUpdate,
  AssessmentQuestionsReplace,
  AssessmentPoolsReplace,
  AccommodationUpsert,
  Role,
};

export interface QuestionBankWithCount extends QuestionBank {
  questionCount?: number;
}

export interface QuestionFilterOptions {
  search?: string;
  type?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
  tags?: string[];
}

export interface FixedQuestionItem {
  id?: string;
  questionVersionId: string;
  points: string;
  position: number;
  isRequired: boolean;
  questionTitle?: string;
  questionType?: string;
}

export interface PoolConfigItem {
  id?: string;
  bankId: string;
  position: number;
  count: number;
  pointsEach: string;
  tags: string[];
  questionType: string | null;
  bankName?: string;
}

export interface RubricCriterionItem {
  id: string;
  label: string;
  description?: string;
  maxPoints: string;
}

export interface AssessmentAccommodationItem {
  id: string;
  enrollmentId: string;
  extraTimeSeconds: number;
  extraAttempts: number;
  availableUntil: string | null;
  reason: string;
  grantedById: string;
  studentName?: string;
}
