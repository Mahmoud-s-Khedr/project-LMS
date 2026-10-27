import type {
  Course,
  CourseCreate,
  CourseUpdate,
  StaffCoursesQuery,
  Category,
  CourseStaff,
  CourseStaffUpsert,
  CoursePrerequisites,
  Section,
  SectionCreate,
  SectionUpdate,
  Lesson,
  LessonCreate,
  LessonUpdate,
  LessonPayload,
  LessonRelease,
  Cohort,
  CohortCreate,
  CohortUpdate,
  CohortReleaseUpsert,
  LiveSession,
  LiveSessionCreate,
  LiveSessionUpdate,
  AttendanceUpdate,
  Asset,
  AssetUpload,
  DownloadCapability,
  RichText,
  CourseStatus,
  Visibility,
  DeliveryMode,
  StaffRole,
  LessonType,
  CompletionRule,
  LiveSessionStatus,
  AssetStatus,
  AssetPurpose,
  CursorResponse,
} from '@lms/shared';

export type {
  Course,
  CourseCreate,
  CourseUpdate,
  StaffCoursesQuery,
  Category,
  CourseStaff,
  CourseStaffUpsert,
  CoursePrerequisites,
  Section,
  SectionCreate,
  SectionUpdate,
  Lesson,
  LessonCreate,
  LessonUpdate,
  LessonPayload,
  LessonRelease,
  Cohort,
  CohortCreate,
  CohortUpdate,
  CohortReleaseUpsert,
  LiveSession,
  LiveSessionCreate,
  LiveSessionUpdate,
  AttendanceUpdate,
  Asset,
  AssetUpload,
  DownloadCapability,
  RichText,
  CourseStatus,
  Visibility,
  DeliveryMode,
  StaffRole,
  LessonType,
  CompletionRule,
  LiveSessionStatus,
  AssetStatus,
  AssetPurpose,
  CursorResponse,
};

/**
 * Enhanced section with its ordered child lessons.
 */
export interface SectionWithLessons extends Section {
  lessons: Lesson[];
}

/**
 * Optimistic concurrency state when an edit operation receives a 409 conflict.
 */
export interface OptimisticConflictState {
  hasConflict: boolean;
  resourceType: 'course' | 'lesson' | 'section';
  resourceId: string;
  expectedVersion?: number;
  serverVersion?: number;
  message: string;
}

/**
 * Staff permission capability flags evaluated for the current caller.
 */
export interface StaffCapabilities {
  isOwnerOrAdmin: boolean;
  isInstructor: boolean;
  isTeachingAssistant: boolean;
  canEditContent: boolean;
  canGrade: boolean;
  canManageLearners: boolean;
}

/**
 * Asset with client upload progress status.
 */
export interface UploadProgressItem {
  id: string;
  file: File;
  purpose: AssetPurpose;
  progressPercent: number;
  status: 'HASHING' | 'REQUESTING' | 'UPLOADING' | 'SCANNING' | 'READY' | 'REJECTED' | 'ERROR';
  assetId?: string;
  errorMessage?: string;
  rejectionCode?: string | null;
}

/**
 * Result of publish validation.
 */
export interface PublishValidationIssue {
  severity: 'ERROR' | 'WARNING';
  field: string;
  message: string;
  sectionId?: string;
  lessonId?: string;
}

export interface PublishValidationResult {
  isValid: boolean;
  errors: PublishValidationIssue[];
  warnings: PublishValidationIssue[];
}
