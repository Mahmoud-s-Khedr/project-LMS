import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Course } from '@lms/shared';
import { api } from '@/lib/api';
import AssessmentsPage from './page';

const mockWorkspaceId = 'a0000000-0000-4000-8000-000000000010';

const mockCourse: Course = {
  id: 'a0000000-0000-4000-8000-000000000001',
  workspaceId: mockWorkspaceId,
  slug: 'adv-dist-sys',
  title: 'Advanced Distributed Systems',
  summary: 'Modern distributed architectures',
  description: { type: 'doc', content: [] },
  visibility: 'PUBLIC',
  deliveryMode: 'SELF_PACED',
  language: 'en',
  level: 'ADVANCED',
  isFree: true,
  estimatedMinutes: 120,
  coverId: null,
  status: 'PUBLISHED',
  version: 1,
  createdById: 'a0000000-0000-4000-8000-000000000002',
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock('@/features/workspaces', () => ({
  useActiveWorkspace: () => ({
    activeWorkspaceId: mockWorkspaceId,
    workspaces: [{ id: mockWorkspaceId, name: 'Engineering Academy' }],
    isLoading: false,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Instructor AssessmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no assessments exist and discovers real courses', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/courses') && !path.includes('/sections')) {
        return {
          data: [mockCourse],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        };
      }
      if (path.includes('/sections')) {
        return { data: [] };
      }
      return { data: [] };
    });

    renderWithClient(<AssessmentsPage />);

    expect(screen.getByText('Assessments & Exams')).toBeInTheDocument();
    expect(await screen.findByText('No assessments found')).toBeInTheDocument();

    // Verify hardcoded fixture is gone
    expect(screen.queryByText('Distributed Consensus & Replication Quiz')).not.toBeInTheDocument();
  });

  it('allows creating an assessment with discovered course and lesson', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/courses') && !path.includes('/sections')) {
        return {
          data: [mockCourse],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        };
      }
      if (path.includes('/sections')) {
        return {
          data: [
            {
              id: 'a0000000-0000-4000-8000-000000000100',
              workspaceId: mockWorkspaceId,
              courseId: mockCourse.id,
              title: 'Module 1',
              position: 0,
              createdAt: '2026-10-01T00:00:00.000Z',
              updatedAt: '2026-10-01T00:00:00.000Z',
              lessons: [
                {
                  id: 'a0000000-0000-4000-8000-000000000101',
                  title: 'Module 1 Quiz Check',
                  type: 'QUIZ',
                },
              ],
            },
          ],
        };
      }
      return { data: [] };
    });

    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        id: 'a0000000-0000-4000-8000-000000000055',
        workspaceId: mockWorkspaceId,
        courseId: mockCourse.id,
        lessonId: 'a0000000-0000-4000-8000-000000000101',
        kind: 'QUIZ',
        title: 'New Distributed Systems Quiz',
        currentPublishedVersion: 1,
        createdAt: '2026-10-26T12:00:00Z',
        updatedAt: '2026-10-26T12:00:00Z',
      },
    });

    renderWithClient(<AssessmentsPage />);

    expect(await screen.findByText('No assessments found')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /create assessment/i }));

    expect(screen.getByText('Create New Assessment')).toBeInTheDocument();

    // Wait for courses and lessons to load in dialog
    await screen.findByRole('option', { name: 'Advanced Distributed Systems' });
    const lessonOption = await screen.findByRole('option', { name: /module 1 quiz check/i });
    expect(lessonOption).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/assessment title/i);
    fireEvent.change(titleInput, { target: { value: 'New Distributed Systems Quiz' } });

    const targetLesson = screen.getByLabelText(/target lesson/i);
    fireEvent.change(targetLesson, { target: { value: 'a0000000-0000-4000-8000-000000000101' } });

    const submitBtn = screen.getByRole('button', { name: /create & open editor/i });
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        expect.stringContaining('/lessons/a0000000-0000-4000-8000-000000000101/assessment'),
        expect.objectContaining({
          title: 'New Distributed Systems Quiz',
          kind: 'QUIZ',
        }),
      );
    });

    expect(await screen.findByText('New Distributed Systems Quiz')).toBeInTheDocument();
  });
});
