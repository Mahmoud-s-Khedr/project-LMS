import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogDetailFixture, fixtureIds, fixtureDocument } from '@lms/shared';
import * as apiModule from '../api';
import { CourseDetail } from './course-detail';
import type { PublicCourseDetail } from '../types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('CourseDetail component', () => {
  const baseDetail: PublicCourseDetail = {
    ...catalogDetailFixture.data,
    isFree: false,
    prices: [
      {
        priceId: fixtureIds.price,
        productId: fixtureIds.product,
        currency: 'usd',
        amount: 4900,
        interval: null,
        intervalCount: 1,
        trialDays: 0,
      },
    ],
    outline: [
      {
        sectionId: fixtureIds.section,
        title: 'Module 1: Foundations',
        position: 0,
        lessons: [
          {
            lessonId: fixtureIds.lesson,
            title: 'Welcome & Overview',
            type: 'TEXT',
            position: 0,
            isPreview: true,
            estimatedMinutes: 10,
          },
          {
            lessonId: '10000000-0000-4000-8000-000000000099',
            title: 'Midterm Comprehensive Exam',
            type: 'EXAM',
            position: 1,
            isPreview: false,
            estimatedMinutes: 60,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders course title, outline, and pricing', () => {
    render(<CourseDetail course={baseDetail} />, { wrapper: createWrapper() });

    expect(screen.getByRole('heading', { name: 'Reliable software', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Module 1: Foundations')).toBeInTheDocument();
    expect(screen.getByText('Welcome & Overview')).toBeInTheDocument();
    expect(screen.getByText('Midterm Comprehensive Exam')).toBeInTheDocument();
    expect(screen.getByText('Enrolled only')).toBeInTheDocument();
    expect(screen.getByText('$49')).toBeInTheDocument();
  });

  it('opens preview lesson modal when Preview button is clicked', async () => {
    vi.spyOn(apiModule, 'fetchPreviewLesson').mockResolvedValueOnce({
      lessonId: fixtureIds.lesson,
      title: 'Welcome & Overview',
      payload: {
        type: 'TEXT',
        body: fixtureDocument,
      },
      assets: [],
    });

    render(<CourseDetail course={baseDetail} />, { wrapper: createWrapper() });

    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        screen.getByText('Practice building dependable software.'),
      ).toBeInTheDocument();
    });
  });

  it('renders cohort schedule when cohorts are returned from API', async () => {
    vi.spyOn(apiModule, 'fetchCatalogCohorts').mockResolvedValueOnce({
      data: [
        {
          id: fixtureIds.enrollment,
          workspaceId: fixtureIds.workspace,
          courseId: fixtureIds.course,
          name: 'Spring Cohort 2027',
          startsAt: '2027-03-01T00:00:00.000Z',
          endsAt: '2027-04-15T00:00:00.000Z',
          enrollmentOpensAt: '2027-01-01T00:00:00.000Z',
          enrollmentClosesAt: '2027-02-28T00:00:00.000Z',
          capacity: 30,
          timezone: 'America/New_York',
          seatsAvailable: 8,
          isPublished: true,
        },
      ],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    render(<CourseDetail course={baseDetail} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Spring Cohort 2027')).toBeInTheDocument();
      expect(screen.getByText('8 seats left')).toBeInTheDocument();
    });
  });
});
