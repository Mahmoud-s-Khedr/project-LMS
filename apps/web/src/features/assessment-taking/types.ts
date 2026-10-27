import type {
  LearnerAssessment,
  AttemptStart,
  LearnerAttempt,
  LearnerQuestion,
  SavedAnswer,
  AnswerSave,
  AttemptState,
  ReleasedResult,
  QuestionResponse,
  DownloadCapability,
  RichText,
} from '@lms/shared';

export type {
  LearnerAssessment,
  AttemptStart,
  LearnerAttempt,
  LearnerQuestion,
  SavedAnswer,
  AnswerSave,
  AttemptState,
  ReleasedResult,
  QuestionResponse,
  DownloadCapability,
  RichText,
};

export type AutosaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR' | 'OFFLINE' | 'CONFLICT';

export type QuestionAnswerStatus = 'UNANSWERED' | 'ANSWERED' | 'FLAGGED';

export interface UploadedAttachment {
  assetId: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  status: 'SCANNING' | 'READY' | 'REJECTED';
}
