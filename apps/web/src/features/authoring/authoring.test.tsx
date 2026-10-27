import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseForm, slugifyCourseTitle } from './components/course-form';
import { CurriculumBuilder } from './components/curriculum-builder';
import { LessonEditor } from './components/lesson-editor';
import { ConflictDialog } from './components/conflict-dialog';
import { StaffManager } from './components/staff-manager';
import { ApiError, api } from '@/lib/api';
import type { Course, Lesson } from './types';

// Polyfill pointerCapture for jsdom Radix UI interactions
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || (() => {});
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || (() => {});
}

// Mock auth hook to return active workspace instructor
vi.mock('@/features/auth/hooks', () => ({
  useMeQuery: () => ({
    data: {
      id: 'a0000000-0000-4000-8000-000000000002',
      email: 'instructor@example.com',
      platformRole: 'INSTRUCTOR',
      memberships: [
        {
          id: 'a0000000-0000-4000-8000-000000000101',
          workspaceId: 'a0000000-0000-4000-8000-000000000010',
          role: 'INSTRUCTOR',
        },
      ],
    },
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockCourse: Course = {
  id: 'a0000000-0000-4000-8000-000000000001',
  workspaceId: 'a0000000-0000-4000-8000-000000000010',
  slug: 'distributed-systems',
  title: 'Distributed Systems',
  summary: 'Modern distributed architectures',
  description: { type: 'doc', content: [] },
  visibility: 'PUBLIC',
  deliveryMode: 'SELF_PACED',
  language: 'en',
  level: 'ADVANCED',
  isFree: false,
  estimatedMinutes: 180,
  coverId: null,
  status: 'DRAFT',
  version: 1,
  createdById: 'a0000000-0000-4000-8000-000000000002',
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const mockLesson: Lesson = {
  id: 'a0000000-0000-4000-8000-000000000101',
  workspaceId: 'a0000000-0000-4000-8000-000000000010',
  courseId: mockCourse.id,
  sectionId: 'a0000000-0000-4000-8000-000000000100',
  title: 'Consensus Protocols',
  position: 1,
  isRequired: true,
  isPreview: false,
  isPublished: true,
  estimatedMinutes: 25,
  completionRule: 'WATCH_PERCENT',
  requiredWatchPercent: 80,
  release: { releaseType: 'IMMEDIATE' },
  payload: {
    type: 'VIDEO',
    body: { durationSeconds: 1500 },
  },
  version: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('Authoring Feature Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/staff')) {
        return { data: [], meta: { nextCursor: null, hasMore: false, limit: 20 } };
      }
      if (path.includes('/sections')) {
        return {
          data: [
            {
              id: 'a0000000-0000-4000-8000-000000000100',
              workspaceId: mockCourse.workspaceId,
              courseId: mockCourse.id,
              title: 'Foundations of Consensus',
              position: 1,
              lessons: [mockLesson],
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
            },
          ],
        };
      }
      return { data: [] };
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('slugifyCourseTitle', () => {
    it('generates clean URL slugs from course titles', () => {
      expect(slugifyCourseTitle('Full-Stack Next.js 15 & NestJS! 2026')).toBe(
        'full-stack-nextjs-15-nestjs-2026',
      );
      expect(slugifyCourseTitle('  Distributed Consensus in Rust  ')).toBe(
        'distributed-consensus-in-rust',
      );
    });
  });

  describe('CourseForm', () => {
    it('automatically updates slug as title changes in create mode', () => {
      renderWithClient(
        <CourseForm
          workspaceId={mockCourse.workspaceId}
          onSubmit={vi.fn()}
          isCreate
        />,
      );

      const titleInput = screen.getByLabelText(/course title/i);
      fireEvent.change(titleInput, { target: { value: 'Advanced Cloud Architectures' } });

      const slugInput = screen.getByLabelText(/url slug/i) as HTMLInputElement;
      expect(slugInput.value).toBe('advanced-cloud-architectures');
    });

    it('submits valid form data', async () => {
      const submitMock = vi.fn();
      renderWithClient(
        <CourseForm
          workspaceId={mockCourse.workspaceId}
          onSubmit={submitMock}
          isCreate
        />,
      );

      fireEvent.change(screen.getByLabelText(/course title/i), {
        target: { value: 'Microservices with gRPC' },
      });
      fireEvent.change(screen.getByLabelText(/summary/i), {
        target: { value: 'Learn scalable RPC protocols in production.' },
      });

      fireEvent.click(screen.getByRole('button', { name: /save course/i }));

      await waitFor(() => {
        expect(submitMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Microservices with gRPC',
            slug: 'microservices-with-grpc',
            summary: 'Learn scalable RPC protocols in production.',
          }),
        );
      });
    });
  });

  describe('CurriculumBuilder', () => {
    it('renders sections and lessons with type badges and reorder controls', async () => {
      renderWithClient(
        <CurriculumBuilder
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
        />,
      );

      expect(await screen.findByText('Foundations of Consensus')).toBeInTheDocument();
      expect(screen.getByText('Consensus Protocols')).toBeInTheDocument();
      expect(screen.getByText('VIDEO')).toBeInTheDocument();
      expect(screen.getByText(/25 min/i)).toBeInTheDocument();
    });

    it('creates a new section when submitted', async () => {
      vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
        if (path.includes('/staff')) {
          return { data: [], meta: { nextCursor: null, hasMore: false, limit: 20 } };
        }
        return { data: [] };
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          id: 'a0000000-0000-4000-8000-000000000200',
          workspaceId: mockCourse.workspaceId,
          courseId: mockCourse.id,
          title: 'Section 2: Raft Algorithm',
          position: 1,
          createdAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
        },
      });

      renderWithClient(
        <CurriculumBuilder
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
        />,
      );

      const addBtn = await screen.findByRole('button', { name: /add first section/i });
      fireEvent.click(addBtn);

      const titleInput = screen.getByLabelText(/section title/i);
      fireEvent.change(titleInput, { target: { value: 'Section 2: Raft Algorithm' } });

      fireEvent.click(screen.getByRole('button', { name: /create section/i }));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          `/workspaces/${mockCourse.workspaceId}/courses/${mockCourse.id}/sections`,
          expect.objectContaining({ title: 'Section 2: Raft Algorithm' }),
        );
      });
    });
  });

  describe('LessonEditor', () => {
    it('disables preview checkbox if protected activity is present', () => {
      const quizLesson: Lesson = {
        ...mockLesson,
        payload: { type: 'QUIZ', body: {} },
        completionRule: 'ASSESSMENT_PASS',
      };

      renderWithClient(
        <LessonEditor
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
          lesson={quizLesson}
        />,
      );

      const previewCheckbox = screen.getByLabelText(/free preview/i) as HTMLInputElement;
      expect(previewCheckbox.disabled).toBe(true);
      expect(screen.getByText(/Protected activities cannot be previews/i)).toBeInTheDocument();
    });

    it('renders Assessment Studio link when lesson type is QUIZ or ASSIGNMENT', () => {
      const quizLesson: Lesson = {
        ...mockLesson,
        payload: { type: 'QUIZ', body: {} },
        completionRule: 'ASSESSMENT_PASS',
      };

      renderWithClient(
        <LessonEditor
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
          lesson={quizLesson}
        />,
      );

      expect(screen.getByText(/Assessment Authoring & Question Banks/i)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Open Assessment Studio/i })).toHaveAttribute(
        'href',
        '/instructor/assessments',
      );
    });

    it('triggers optimistic conflict callback when HTTP 409 is returned', async () => {
      const conflictMock = vi.fn();

      vi.spyOn(api, 'patch').mockRejectedValueOnce(
        new ApiError(409, {
          error: {
            code: 'VERSION_CONFLICT',
            message: 'Stale version detected. Another editor updated this lesson.',
            requestId: 'req_conflict_123',
            timestamp: new Date().toISOString(),
            path: `/workspaces/${mockCourse.workspaceId}/courses/${mockCourse.id}/lessons/${mockLesson.id}`,
          },
        }),
      );

      renderWithClient(
        <LessonEditor
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
          lesson={mockLesson}
          onConflict={conflictMock}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /save lesson/i }));

      await waitFor(() => {
        expect(conflictMock).toHaveBeenCalledWith(
          expect.objectContaining({
            hasConflict: true,
            resourceType: 'lesson',
            resourceId: mockLesson.id,
          }),
        );
      });
    });
  });

  describe('ConflictDialog', () => {
    it('renders conflict details and executes reload action', () => {
      const reloadMock = vi.fn();
      const dismissMock = vi.fn();

      render(
        <ConflictDialog
          conflict={{
            hasConflict: true,
            resourceType: 'course',
            resourceId: mockCourse.id,
            message: 'Course version 2 already exists on server.',
          }}
          onReload={reloadMock}
          onDismiss={dismissMock}
        />,
      );

      expect(screen.getByText(/Version Conflict Detected/i)).toBeInTheDocument();
      expect(screen.getByText(/Course version 2 already exists on server/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /reload latest version/i }));
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe('StaffManager', () => {
    it('renders staff list with permissions badges', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [
          {
            id: 'a0000000-0000-4000-8000-000000000501',
            workspaceId: mockCourse.workspaceId,
            courseId: mockCourse.id,
            userId: 'a0000000-0000-4000-8000-000000000002',
            memberId: 'a0000000-0000-4000-8000-000000000102',
            role: 'INSTRUCTOR',
            canEditContent: true,
            canGrade: true,
            canManageLearners: true,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
          {
            id: 'a0000000-0000-4000-8000-000000000502',
            workspaceId: mockCourse.workspaceId,
            courseId: mockCourse.id,
            userId: 'a0000000-0000-4000-8000-000000000003',
            memberId: 'a0000000-0000-4000-8000-000000000103',
            role: 'TEACHING_ASSISTANT',
            canEditContent: false,
            canGrade: true,
            canManageLearners: false,
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      renderWithClient(
        <StaffManager
          workspaceId={mockCourse.workspaceId}
          courseId={mockCourse.id}
        />,
      );

      expect(await screen.findByText('a0000000-0000-4000-8000-000000000002')).toBeInTheDocument();
      expect(screen.getByText('Full Access')).toBeInTheDocument();
      expect(screen.getByText('✕ No Edit')).toBeInTheDocument();
      expect(screen.getByText('✓ Grade')).toBeInTheDocument();
    });
  });
});
