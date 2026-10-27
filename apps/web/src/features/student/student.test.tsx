import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { formatSecondsToDuration, formatAccessReason, isAccessAllowed } from './types';
import { OverviewStats } from './components/overview-stats';
import { EnrollmentCard } from './components/enrollment-card';
import { EnrollmentList } from './components/enrollment-list';
import { EnrollmentDetailView } from './components/enrollment-detail-view';
import { HistoricalResultsView } from './components/historical-results-view';
import { ContinueLearningSection } from './components/continue-learning-section';
import type { Enrollment, LearnerOutline, ReleasedResult, StudentAnalytics } from './types';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockActiveEnrollment: Enrollment = {
  id: '30000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000004',
  courseId: '20000000-0000-4000-8000-000000000001',
  cohortId: null,
  status: 'ACTIVE',
  enrolledAt: '2026-10-01T10:00:00.000Z',
  startedAt: '2026-10-01T10:05:00.000Z',
  completedAt: null,
  lastActivityAt: '2026-10-25T14:00:00.000Z',
  completionPercent: '45.00',
  access: { allowed: true, expiresAt: null },
  grants: [
    {
      id: '40000000-0000-4000-8000-000000000001',
      source: 'FREE',
      startsAt: '2026-10-01T10:00:00.000Z',
      expiresAt: null,
      revokedAt: null,
    },
  ],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-25T14:00:00.000Z',
};

const mockExpiredEnrollment: Enrollment = {
  id: '30000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '10000000-0000-4000-8000-000000000004',
  courseId: '20000000-0000-4000-8000-000000000002',
  cohortId: null,
  status: 'ACTIVE',
  enrolledAt: '2026-08-01T10:00:00.000Z',
  startedAt: '2026-08-01T10:05:00.000Z',
  completedAt: null,
  lastActivityAt: '2026-08-20T14:00:00.000Z',
  completionPercent: '75.00',
  access: { allowed: false, reason: 'ACCESS_EXPIRED', unlockAt: null },
  grants: [
    {
      id: '40000000-0000-4000-8000-000000000002',
      source: 'SUBSCRIPTION',
      startsAt: '2026-08-01T10:00:00.000Z',
      expiresAt: '2026-09-01T10:00:00.000Z',
      revokedAt: null,
    },
  ],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const mockOutline: LearnerOutline = {
  enrollmentId: mockActiveEnrollment.id,
  sections: [
    {
      sectionId: '50000000-0000-4000-8000-000000000001',
      title: 'Module 1: Foundations',
      position: 0,
      lessons: [
        {
          lessonId: '60000000-0000-4000-8000-000000000001',
          title: 'Introduction to Architecture',
          type: 'VIDEO',
          position: 0,
          isRequired: true,
          completedAt: '2026-10-02T10:00:00.000Z',
          access: { allowed: true, expiresAt: null },
        },
        {
          lessonId: '60000000-0000-4000-8000-000000000002',
          title: 'Upcoming Scheduled Workshop',
          type: 'LIVE_SESSION',
          position: 1,
          isRequired: false,
          completedAt: null,
          access: {
            allowed: false,
            reason: 'NOT_RELEASED',
            unlockAt: '2026-11-01T10:00:00.000Z',
          },
        },
      ],
    },
  ],
};

const mockReleasedResults: ReleasedResult[] = [
  {
    attemptId: '70000000-0000-4000-8000-000000000001',
    assessmentId: '80000000-0000-4000-8000-000000000001',
    number: 1,
    status: 'GRADED',
    totalPoints: '100.000',
    awardedPoints: '88.500',
    percent: '88.50',
    passed: true,
    gradedAt: '2026-10-20T12:00:00.000Z',
    answers: [
      {
        attemptQuestionId: '90000000-0000-4000-8000-000000000001',
        awardedPoints: '48.500',
        isCorrect: true,
        feedback: 'Excellent reasoning on distributed rollback.',
      },
      {
        attemptQuestionId: '90000000-0000-4000-8000-000000000002',
        awardedPoints: '40.000',
        isCorrect: true,
        feedback: 'Good implementation of idempotent keys.',
      },
    ],
  },
];

describe('Student Domain Helpers', () => {
  it('formats seconds to duration cleanly', () => {
    expect(formatSecondsToDuration(0)).toBe('0 min');
    expect(formatSecondsToDuration('120')).toBe('2 min');
    expect(formatSecondsToDuration(3600)).toBe('1h');
    expect(formatSecondsToDuration(3690)).toBe('1h 1m');
  });

  it('formats access reason cleanly', () => {
    expect(formatAccessReason('ACCESS_EXPIRED')).toBe('Access Expired');
    expect(formatAccessReason('NOT_RELEASED')).toBe('Scheduled Content (Not Released Yet)');
    expect(formatAccessReason('CONTENT_LOCKED')).toBe('Content Locked');
  });

  it('identifies access allowance', () => {
    expect(isAccessAllowed({ allowed: true, expiresAt: null })).toBe(true);
    expect(isAccessAllowed({ allowed: false, reason: 'ACCESS_EXPIRED', unlockAt: null })).toBe(
      false,
    );
  });
});

describe('OverviewStats Component', () => {
  it('renders stats with formatted values', () => {
    const analytics: StudentAnalytics = {
      enrolledCourses: 4,
      completedCourses: 2,
      learningSeconds: '7200',
      currentStreakDays: 5,
      courses: [],
      activity: [],
    };

    renderWithClient(<OverviewStats analytics={analytics} />);

    expect(screen.getByText('Enrolled Courses')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Completed Courses')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Time Learned')).toBeTruthy();
    expect(screen.getByText('2h')).toBeTruthy();
    expect(screen.getByText('Day Streak')).toBeTruthy();
    expect(screen.getByText('5 days')).toBeTruthy();
  });
});

describe('EnrollmentCard Component', () => {
  it('renders active enrollment with Continue button', () => {
    renderWithClient(
      <EnrollmentCard enrollment={mockActiveEnrollment} courseTitle="Distributed Systems" />,
    );

    expect(screen.getByText('Distributed Systems')).toBeTruthy();
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('In Progress')).toBeTruthy();
    expect(screen.getByText('Free Enrollment')).toBeTruthy();
    expect(screen.getByRole('link', { name: /continue/i })).toBeTruthy();
  });

  it('distinguishes expired access and shows View Results button', () => {
    renderWithClient(
      <EnrollmentCard enrollment={mockExpiredEnrollment} courseTitle="Legacy Cloud" />,
    );

    expect(screen.getByText('Legacy Cloud')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getAllByText(/Access Expired/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Historical records preserved/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /view results/i })).toBeTruthy();
  });
});

describe('EnrollmentList Component', () => {
  it('filters enrollments by status tab and search query', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <EnrollmentList enrollments={[mockActiveEnrollment, mockExpiredEnrollment]} />,
    );

    // Initial view shows all 2 enrollments
    expect(screen.getAllByRole('progressbar').length).toBe(2);

    // Filter by restricted / expired
    const restrictedTab = screen.getByRole('tab', { name: /restricted/i });
    await user.click(restrictedTab);
    expect(screen.getAllByRole('progressbar').length).toBe(1);

    // Search query that matches nothing
    const searchInput = screen.getByPlaceholderText(/search enrollments/i);
    await user.type(searchInput, 'nonexistent-uuid');
    expect(screen.getByText(/no matching enrollments found/i)).toBeTruthy();
  });
});

describe('EnrollmentDetailView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders outline sections and lessons with lock reasons and grant history', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path.includes('/outline')) return { data: mockOutline };
      return { data: mockActiveEnrollment };
    });

    renderWithClient(<EnrollmentDetailView enrollmentId={mockActiveEnrollment.id} />);

    expect(await screen.findByText('Module 1: Foundations')).toBeTruthy();
    expect(screen.getByText('Introduction to Architecture')).toBeTruthy();
    expect(screen.getByText('Upcoming Scheduled Workshop')).toBeTruthy();
    expect(screen.getByText(/Scheduled Content/i)).toBeTruthy();
    expect(screen.getByText('Access Grants & Provenance')).toBeTruthy();
    expect(screen.getByText('FREE')).toBeTruthy();
  });
});

describe('HistoricalResultsView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders released grades, percent, and instructor feedback', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockReleasedResults });

    renderWithClient(<HistoricalResultsView enrollmentId={mockActiveEnrollment.id} />);

    expect(await screen.findByText('Attempt #1')).toBeTruthy();
    expect(screen.getByText('Passed')).toBeTruthy();
    expect(screen.getByText('88.5%')).toBeTruthy();
    expect(screen.getByText(/88.500 \/ 100.000/i)).toBeTruthy();
    expect(screen.getByText('Question Feedback Breakdown')).toBeTruthy();
    expect(screen.getByText(/Excellent reasoning on distributed rollback/i)).toBeTruthy();
    expect(screen.getByText(/Permanent Academic Record/i)).toBeTruthy();
  });

  it('renders empty state when no grades released', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] });

    renderWithClient(<HistoricalResultsView enrollmentId={mockActiveEnrollment.id} />);

    expect(await screen.findByText(/No released grades yet/i)).toBeTruthy();
  });
});

describe('ContinueLearningSection Component', () => {
  it('renders continue learning cards for active courses', () => {
    renderWithClient(
      <ContinueLearningSection enrollments={[mockActiveEnrollment, mockExpiredEnrollment]} />,
    );

    expect(screen.getByText('Continue Learning')).toBeTruthy();
    // Only mockActiveEnrollment qualifies as continue learning (since mockExpired has expired access)
    expect(screen.getAllByRole('progressbar').length).toBe(1);
  });
});
