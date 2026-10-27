import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Course } from '@lms/shared';
import { api } from '@/lib/api';
import GradingQueuePage from './page';

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

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => mockSearchParams,
}));

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

describe('Instructor GradingQueuePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('requires selection when query params are absent and does not use hardcoded fixture IDs', async () => {
    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/courses')) {
        return {
          data: [mockCourse],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        };
      }
      return { data: [] };
    });

    renderWithClient(<GradingQueuePage />);

    expect(await screen.findByText('Select Assessment for Grading')).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Advanced Distributed Systems' });
    expect(screen.getByRole('button', { name: /open grading queue/i })).toBeInTheDocument();

    // Verify hardcoded IDs are not used
    expect(screen.queryByText('Consensus & Distributed Systems Midterm')).not.toBeInTheDocument();

    const assessmentInput = screen.getByLabelText(/assessment id/i);
    fireEvent.change(assessmentInput, { target: { value: 'ass-custom-99' } });

    const submitBtn = screen.getByRole('button', { name: /open grading queue/i });
    fireEvent.submit(submitBtn.closest('form')!);

    expect(mockPush).toHaveBeenCalledWith(
      `/instructor/grading?courseId=${mockCourse.id}&assessmentId=ass-custom-99`,
    );
  });

  it('renders GradingQueueView when real query IDs are provided', async () => {
    mockSearchParams = new URLSearchParams('courseId=crs-real-10&assessmentId=ass-real-88');

    vi.mocked(api.get).mockImplementation(async (path) => {
      if (path.includes('/attempts')) {
        return {
          data: [],
          meta: { hasMore: false },
        };
      }
      return { data: [] };
    });

    renderWithClient(<GradingQueuePage />);

    expect(await screen.findByText(/assessment grading queue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch assessment/i })).toBeInTheDocument();
  });
});
