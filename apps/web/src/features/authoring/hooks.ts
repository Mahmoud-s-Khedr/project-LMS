'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { useMeQuery } from '@/features/auth/hooks';
import { Role, uploadMimeSchema, type UploadMime } from '@lms/shared';
import type {
  Course,
  CourseCreate,
  CourseUpdate,
  StaffCoursesQuery,
  CourseStaff,
  CourseStaffUpsert,
  CoursePrerequisites,
  Section,
  SectionCreate,
  SectionUpdate,
  Lesson,
  LessonCreate,
  LessonUpdate,
  Cohort,
  CohortCreate,
  CohortUpdate,
  CohortReleaseUpsert,
  Asset,
  AssetPurpose,
  CursorResponse,
  StaffCapabilities,
  OptimisticConflictState,
  UploadProgressItem,
} from './types';
import * as api from './api';
import { computeSha256 } from './utils/hash';

export const AUTHORING_QUERY_KEYS = {
  all: ['authoring'] as const,
  courses: (workspaceId: string, query?: Partial<StaffCoursesQuery>) =>
    ['authoring', workspaceId, 'courses', query] as const,
  course: (workspaceId: string, courseId: string) =>
    ['authoring', workspaceId, 'course', courseId] as const,
  staff: (workspaceId: string, courseId: string) =>
    ['authoring', workspaceId, 'course', courseId, 'staff'] as const,
  sections: (workspaceId: string, courseId: string) =>
    ['authoring', workspaceId, 'course', courseId, 'sections'] as const,
  lesson: (workspaceId: string, courseId: string, lessonId: string) =>
    ['authoring', workspaceId, 'course', courseId, 'lesson', lessonId] as const,
  cohorts: (workspaceId: string, courseId: string) =>
    ['authoring', workspaceId, 'course', courseId, 'cohorts'] as const,
  cohortEnrollments: (workspaceId: string, courseId: string, cohortId: string) =>
    ['authoring', workspaceId, 'course', courseId, 'cohort', cohortId, 'enrollments'] as const,
  liveAttendance: (workspaceId: string, courseId: string, sessionId: string) =>
    [
      'authoring',
      workspaceId,
      'course',
      courseId,
      'live-session',
      sessionId,
      'attendance',
    ] as const,
};

// ==========================================
// Courses Hooks
// ==========================================

export function useStaffCoursesQuery(
  workspaceId: string,
  query: Partial<StaffCoursesQuery> = {},
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Course>>({
    queryKey: AUTHORING_QUERY_KEYS.courses(workspaceId, query),
    queryFn: () => api.fetchStaffCourses(workspaceId, query),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId),
    staleTime: 15_000,
  });
}

export function useCourseQuery(
  workspaceId: string,
  courseId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Course>({
    queryKey: AUTHORING_QUERY_KEYS.course(workspaceId, courseId),
    queryFn: () => api.fetchCourse(workspaceId, courseId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId) && Boolean(courseId),
    staleTime: 30_000,
  });
}

export function useCreateCourseMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CourseCreate) => api.createCourse(workspaceId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
  });
}

export function useUpdateCourseMutation(
  workspaceId: string,
  courseId: string,
  onConflict?: (conflict: OptimisticConflictState) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CourseUpdate) => api.updateCourse(workspaceId, courseId, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(AUTHORING_QUERY_KEYS.course(workspaceId, courseId), updated);
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        if (onConflict) {
          onConflict({
            hasConflict: true,
            resourceType: 'course',
            resourceId: courseId,
            message:
              err.envelope.error.message ||
              'This course has been modified by another user. Please reload the latest changes to avoid overwriting.',
          });
        }
      }
    },
  });
}

export function useDeleteCourseMutation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.deleteCourse(workspaceId, courseId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
  });
}

export function useSubmitCourseReviewMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.submitCourseForReview(workspaceId, courseId, version),
    onSuccess: (updated) => {
      queryClient.setQueryData(AUTHORING_QUERY_KEYS.course(workspaceId, courseId), updated);
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
  });
}

export function usePublishCourseMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.publishCourse(workspaceId, courseId, version),
    onSuccess: (updated) => {
      queryClient.setQueryData(AUTHORING_QUERY_KEYS.course(workspaceId, courseId), updated);
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
  });
}

export function useArchiveCourseMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (version: number) => api.archiveCourse(workspaceId, courseId, version),
    onSuccess: (updated) => {
      queryClient.setQueryData(AUTHORING_QUERY_KEYS.course(workspaceId, courseId), updated);
      void queryClient.invalidateQueries({
        queryKey: ['authoring', workspaceId, 'courses'],
      });
    },
  });
}

// ==========================================
// Staff & Settings Hooks
// ==========================================

export function useCourseStaffQuery(
  workspaceId: string,
  courseId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<CourseStaff>>({
    queryKey: AUTHORING_QUERY_KEYS.staff(workspaceId, courseId),
    queryFn: () => api.fetchCourseStaff(workspaceId, courseId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId) && Boolean(courseId),
  });
}

export function useUpsertCourseStaffMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: CourseStaffUpsert }) =>
      api.upsertCourseStaff(workspaceId, courseId, userId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.staff(workspaceId, courseId),
      });
    },
  });
}

export function useRemoveCourseStaffMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeCourseStaff(workspaceId, courseId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.staff(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateCourseCategoriesMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryIds: string[]) =>
      api.updateCourseCategories(workspaceId, courseId, categoryIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.course(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateCoursePrerequisitesMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prerequisites: CoursePrerequisites['prerequisites']) =>
      api.updateCoursePrerequisites(workspaceId, courseId, prerequisites),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.course(workspaceId, courseId),
      });
    },
  });
}

// ==========================================
// Sections & Lessons Hooks
// ==========================================

export function useCourseSectionsQuery(
  workspaceId: string,
  courseId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Section[]>({
    queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
    queryFn: () => api.fetchCourseSections(workspaceId, courseId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId) && Boolean(courseId),
  });
}

export function useCreateSectionMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SectionCreate) => api.createSection(workspaceId, courseId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateSectionMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: SectionUpdate }) =>
      api.updateSection(workspaceId, courseId, sectionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useDeleteSectionMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => api.deleteSection(workspaceId, courseId, sectionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useReorderSectionsMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderSections(workspaceId, courseId, ids),
    onSuccess: (updatedSections) => {
      queryClient.setQueryData(
        AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
        updatedSections,
      );
    },
  });
}

export function useLessonQuery(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<Lesson>({
    queryKey: AUTHORING_QUERY_KEYS.lesson(workspaceId, courseId, lessonId),
    queryFn: () => api.fetchLesson(workspaceId, courseId, lessonId),
    enabled:
      (options?.enabled ?? true) && Boolean(workspaceId) && Boolean(courseId) && Boolean(lessonId),
  });
}

export function useCreateLessonMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: string; data: LessonCreate }) =>
      api.createLesson(workspaceId, courseId, sectionId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateLessonMutation(
  workspaceId: string,
  courseId: string,
  lessonId: string,
  onConflict?: (conflict: OptimisticConflictState) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LessonUpdate) => api.updateLesson(workspaceId, courseId, lessonId, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        AUTHORING_QUERY_KEYS.lesson(workspaceId, courseId, lessonId),
        updated,
      );
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        if (onConflict) {
          onConflict({
            hasConflict: true,
            resourceType: 'lesson',
            resourceId: lessonId,
            message:
              err.envelope.error.message ||
              'This lesson has been modified by another editor. Please reload to avoid overwriting changes.',
          });
        }
      }
    },
  });
}

export function useDeleteLessonMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: string) => api.deleteLesson(workspaceId, courseId, lessonId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useReorderLessonsMutation(
  workspaceId: string,
  courseId: string,
  sectionId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderLessons(workspaceId, courseId, sectionId, ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.sections(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateLessonPrerequisitesMutation(
  workspaceId: string,
  courseId: string,
  lessonId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requiredLessonIds: string[]) =>
      api.updateLessonPrerequisites(workspaceId, courseId, lessonId, requiredLessonIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.lesson(workspaceId, courseId, lessonId),
      });
    },
  });
}

export function useAttachLessonAssetMutation(
  workspaceId: string,
  courseId: string,
  lessonId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { assetId: string; purpose: AssetPurpose; position: number }) =>
      api.attachLessonAsset(workspaceId, courseId, lessonId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.lesson(workspaceId, courseId, lessonId),
      });
    },
  });
}

export function useDetachLessonAssetMutation(
  workspaceId: string,
  courseId: string,
  lessonId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) =>
      api.detachLessonAsset(workspaceId, courseId, lessonId, assetId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.lesson(workspaceId, courseId, lessonId),
      });
    },
  });
}

// ==========================================
// Cohorts Hooks
// ==========================================

export function useCourseCohortsQuery(
  workspaceId: string,
  courseId: string,
  options?: { enabled?: boolean },
) {
  return useQuery<CursorResponse<Cohort>>({
    queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
    queryFn: () => api.fetchCourseCohorts(workspaceId, courseId),
    enabled: (options?.enabled ?? true) && Boolean(workspaceId) && Boolean(courseId),
  });
}

export function useCreateCohortMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CohortCreate) => api.createCourseCohort(workspaceId, courseId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
      });
    },
  });
}

export function useUpdateCohortMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cohortId, data }: { cohortId: string; data: CohortUpdate }) =>
      api.updateCourseCohort(workspaceId, courseId, cohortId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
      });
    },
  });
}

export function useDeleteCohortMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cohortId: string) => api.deleteCourseCohort(workspaceId, courseId, cohortId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
      });
    },
  });
}

export function useUpsertCohortReleaseMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cohortId,
      lessonId,
      data,
    }: {
      cohortId: string;
      lessonId: string;
      data: CohortReleaseUpsert;
    }) => api.upsertCohortRelease(workspaceId, courseId, cohortId, lessonId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
      });
    },
  });
}

export function useDeleteCohortReleaseMutation(workspaceId: string, courseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cohortId, lessonId }: { cohortId: string; lessonId: string }) =>
      api.deleteCohortRelease(workspaceId, courseId, cohortId, lessonId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: AUTHORING_QUERY_KEYS.cohorts(workspaceId, courseId),
      });
    },
  });
}

// ==========================================
// Staff Permissions Hook
// ==========================================

export function useCoursePermissions(workspaceId: string, courseId: string): StaffCapabilities {
  const { data: me } = useMeQuery();
  const { data: staffList } = useCourseStaffQuery(workspaceId, courseId, {
    enabled: Boolean(courseId) && Boolean(workspaceId),
  });

  return React.useMemo(() => {
    if (!me) {
      return {
        isOwnerOrAdmin: false,
        isInstructor: false,
        isTeachingAssistant: false,
        canEditContent: false,
        canGrade: false,
        canManageLearners: false,
      };
    }

    const platformRole = me.platformRole;
    const isSuperAdmin = platformRole === Role.SUPER_ADMIN;

    // Check workspace-level membership role
    const wsMembership = me.memberships?.find((m) => m.workspaceId === workspaceId);
    const isWsAdmin = isSuperAdmin || wsMembership?.role === Role.ADMIN;
    const isWsInstructor = wsMembership?.role === Role.INSTRUCTOR;

    // If caller is workspace admin or super admin, they possess full capabilities
    if (isWsAdmin) {
      return {
        isOwnerOrAdmin: true,
        isInstructor: true,
        isTeachingAssistant: false,
        canEditContent: true,
        canGrade: true,
        canManageLearners: true,
      };
    }

    // Look for explicit CourseStaff record
    const staffRecord = staffList?.data.find((s) => s.userId === me.id);

    if (staffRecord) {
      const isLeadInstructor = staffRecord.role === 'INSTRUCTOR';
      const isTA = staffRecord.role === 'TEACHING_ASSISTANT';

      return {
        isOwnerOrAdmin: false,
        isInstructor: isLeadInstructor,
        isTeachingAssistant: isTA,
        canEditContent: isLeadInstructor ? true : Boolean(staffRecord.canEditContent),
        canGrade: isLeadInstructor ? true : Boolean(staffRecord.canGrade),
        canManageLearners: isLeadInstructor ? true : Boolean(staffRecord.canManageLearners),
      };
    }

    // Default to workspace instructor permissions if no explicit staff assignment yet (e.g. course creator)
    if (isWsInstructor) {
      return {
        isOwnerOrAdmin: false,
        isInstructor: true,
        isTeachingAssistant: false,
        canEditContent: true,
        canGrade: true,
        canManageLearners: true,
      };
    }

    return {
      isOwnerOrAdmin: false,
      isInstructor: false,
      isTeachingAssistant: false,
      canEditContent: false,
      canGrade: false,
      canManageLearners: false,
    };
  }, [me, workspaceId, staffList?.data]);
}

// ==========================================
// Asset Upload Flow Hook
// ==========================================

export interface UploadFileOptions {
  signal?: AbortSignal;
  onProgress?: (progress: { stage: 'HASHING' | 'UPLOADING'; percent: number }) => void;
  chunkSize?: number;
}

export function useAssetUploader(workspaceId: string) {
  const [uploads, setUploads] = React.useState<Record<string, UploadProgressItem>>({});

  const uploadFile = React.useCallback(
    async (
      file: File,
      purpose: AssetPurpose,
      parentId: string,
      options?: UploadFileOptions,
    ): Promise<Asset> => {
      const uploadId = crypto.randomUUID();

      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Upload aborted', 'AbortError');
      }

      // Check max size: 5GB general, 10MB submission
      const maxSizeBytes = purpose === 'SUBMISSION' ? 10485760 : 5368709120;
      if (file.size > maxSizeBytes) {
        const errorMsg =
          purpose === 'SUBMISSION'
            ? 'Submission files must not exceed 10 MB'
            : 'File exceeds maximum permitted size of 5 GB';
        setUploads((prev) => ({
          ...prev,
          [uploadId]: {
            id: uploadId,
            file,
            purpose,
            progressPercent: 0,
            status: 'REJECTED',
            errorMessage: errorMsg,
            rejectionCode: 'SIZE_MISMATCH',
          },
        }));
        throw new Error(errorMsg);
      }

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          id: uploadId,
          file,
          purpose,
          progressPercent: 0,
          status: 'HASHING',
        },
      }));

      // 1. Calculate SHA-256 incrementally with progress and cancellation
      const sha256 = await computeSha256(file, {
        chunkSize: options?.chunkSize,
        signal: options?.signal,
        onProgress: ({ percentage }) => {
          options?.onProgress?.({ stage: 'HASHING', percent: percentage });
          setUploads((prev) => {
            const current = prev[uploadId];
            if (!current) return prev;
            return {
              ...prev,
              [uploadId]: {
                ...current,
                progressPercent: Math.round((percentage / 100) * 25),
              },
            };
          });
        },
      });

      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Upload aborted', 'AbortError');
      }

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId]!,
          progressPercent: 25,
          status: 'REQUESTING',
        },
      }));

      const mimeParsed = uploadMimeSchema.safeParse(file.type);
      const mimeType: UploadMime = mimeParsed.success ? mimeParsed.data : 'application/pdf';

      // 2. Request presigned upload capability
      const uploadPlan = await api.requestAssetUpload(workspaceId, {
        purpose,
        parentId,
        filename: file.name,
        mimeType,
        sizeBytes: String(file.size),
        sha256,
      });

      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Upload aborted', 'AbortError');
      }

      const assetId = uploadPlan.assetId;

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId]!,
          assetId,
          progressPercent: 30,
          status: 'UPLOADING',
        },
      }));

      // 3. Binary upload to storage target
      await api.uploadAssetBinary(
        uploadPlan.url,
        uploadPlan.method,
        uploadPlan.headers,
        file,
        (percent) => {
          options?.onProgress?.({ stage: 'UPLOADING', percent });
          setUploads((prev) => {
            const current = prev[uploadId];
            if (!current) return prev;
            return {
              ...prev,
              [uploadId]: {
                ...current,
                progressPercent: 30 + Math.round((percent / 100) * 40),
              },
            };
          });
        },
      );

      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Upload aborted', 'AbortError');
      }

      // 4. Notify completion
      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId]!,
          progressPercent: 75,
          status: 'SCANNING',
        },
      }));

      await api.completeAssetUpload(workspaceId, assetId);

      // 5. Poll for virus scanning
      const finalized = await api.pollAssetScan(workspaceId, assetId, {
        intervalMs: 1000,
        maxAttempts: 30,
        onUpdate: (current) => {
          if (current.status === 'REJECTED') {
            setUploads((prev) => ({
              ...prev,
              [uploadId]: {
                ...prev[uploadId]!,
                progressPercent: 100,
                status: 'REJECTED',
                rejectionCode: current.rejectionCode,
                errorMessage: `Scan rejected: ${current.rejectionCode ?? 'REJECTED'}`,
              },
            }));
          }
        },
      });

      setUploads((prev) => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId]!,
          progressPercent: 100,
          status: 'READY',
        },
      }));

      return finalized;
    },
    [workspaceId],
  );

  return {
    uploads,
    uploadFile,
  };
}
