import type {
  Enrollment,
  LearnerOutline,
  LearnerOutlineLesson,
  LearnerLesson,
  LessonProgress,
  ProgressUpdate,
  DownloadCapability,
  EffectiveAccess,
  ReleasedResult,
  LessonPayload,
  RichText,
} from '@lms/shared';

export type {
  Enrollment,
  LearnerOutline,
  LearnerOutlineLesson,
  LearnerLesson,
  LessonProgress,
  ProgressUpdate,
  DownloadCapability,
  EffectiveAccess,
  ReleasedResult,
  LessonPayload,
  RichText,
};

export interface SignedUrlState {
  url: string;
  expiresAt: string;
  requestedAt: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
}

export type LockReason =
  | 'ACCESS_EXPIRED'
  | 'ENROLLMENT_REQUIRED'
  | 'CONTENT_LOCKED'
  | 'PREREQUISITE_UNMET'
  | 'USER_SUSPENDED'
  | 'WORKSPACE_SUSPENDED'
  | 'ENROLLMENT_SUSPENDED'
  | 'NOT_RELEASED'
  | 'AVAILABLE_UNTIL_PASSED';
