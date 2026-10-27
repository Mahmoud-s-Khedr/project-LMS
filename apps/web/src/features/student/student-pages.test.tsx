import * as React from 'react';
import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import StudentOverviewPage from '@/app/(dashboards)/student/page';
import StudentEnrollmentsPage from '@/app/(dashboards)/student/enrollments/page';
import EnrollmentDetailPage from '@/app/(dashboards)/student/enrollments/[enrollmentId]/page';
import StudentResultsPage from '@/app/(dashboards)/student/results/page';
import StudentEnrollmentResultsPage from '@/app/(dashboards)/student/results/[enrollmentId]/page';
import StudentCertificatesPage from '@/app/(dashboards)/student/certificates/page';
import StudentNotificationsPage from '@/app/(dashboards)/student/notifications/page';
import StudentSettingsPage from '@/app/(dashboards)/student/settings/page';
import VerifyPage from '@/app/(public)/verify/page';
import VerifyCodePage from '@/app/(public)/verify/[verificationCode]/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <React.Suspense fallback={<div>Loading...</div>}>{ui}</React.Suspense>
    </QueryClientProvider>,
  );
}

const mockMe = {
  id: '10000000-0000-4000-8000-000000000004',
  email: 'student@example.com',
  name: 'Alex Mercer',
  platformRole: 'STUDENT',
  status: 'ACTIVE',
  emailVerifiedAt: '2026-10-01T12:00:00.000Z',
  locale: 'en-US',
  timezone: 'America/New_York',
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-25T14:00:00.000Z',
  avatarUrl: null,
  memberships: [],
};

const mockEnrollment = {
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
  completionPercent: '50.00',
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

describe('Student Workspace Pages Smoke & Route Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
      if (path === '/me') return { data: mockMe };
      if (path === '/me/analytics/progress') {
        return {
          data: {
            enrolledCourses: 1,
            completedCourses: 0,
            learningSeconds: '3600',
            currentStreakDays: 3,
            courses: [],
            activity: [],
          },
        };
      }
      if (path.startsWith('/me/enrollments')) {
        if (path.includes('/outline')) {
          return { data: { enrollmentId: mockEnrollment.id, sections: [] } };
        }
        if (path.includes('/results')) {
          return { data: [] };
        }
        if (path === `/me/enrollments/${mockEnrollment.id}`) {
          return { data: mockEnrollment };
        }
        return { data: [mockEnrollment] };
      }
      if (path.startsWith('/me/certificates')) return { data: [] };
      if (path.startsWith('/me/notifications')) return { data: [] };
      if (path === '/me/sessions') return { data: [] };
      if (path === '/me/notification-preferences') return { data: [] };
      return { data: {} };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders /student overview page', async () => {
    renderWithClient(<StudentOverviewPage />);
    expect(await screen.findByText(/Welcome back, Alex/i)).toBeTruthy();
    expect(screen.getByText('Learning Activity & Progression')).toBeTruthy();
    expect(screen.getByText('Workspace Hub')).toBeTruthy();
  });

  it('renders /student/enrollments page', async () => {
    renderWithClient(<StudentEnrollmentsPage />);
    expect(await screen.findByText('My Enrolled Courses')).toBeTruthy();
    expect(screen.getByText('Explore More Courses')).toBeTruthy();
  });

  it('renders /student/enrollments/[enrollmentId] page', async () => {
    await act(async () => {
      renderWithClient(
        <Suspense fallback={null}>
          <EnrollmentDetailPage params={Promise.resolve({ enrollmentId: mockEnrollment.id })} />
        </Suspense>,
      );
    });
    expect(await screen.findByText(`Course ${mockEnrollment.courseId}`)).toBeTruthy();
    expect(screen.getByText('Curriculum Outline')).toBeTruthy();
  });

  it('renders /student/results page', async () => {
    renderWithClient(<StudentResultsPage />);
    expect(await screen.findByText('Assessment Results & Gradebook')).toBeTruthy();
  });

  it('renders /student/results/[enrollmentId] page', async () => {
    await act(async () => {
      renderWithClient(
        <Suspense fallback={null}>
          <StudentEnrollmentResultsPage
            params={Promise.resolve({ enrollmentId: mockEnrollment.id })}
          />
        </Suspense>,
      );
    });
    expect(await screen.findByText('Assessment Results')).toBeTruthy();
  });

  it('renders /student/certificates page', async () => {
    renderWithClient(<StudentCertificatesPage />);
    expect(await screen.findByText('Earned Certificates')).toBeTruthy();
    expect(screen.getByText('Public Verification Tool')).toBeTruthy();
  });

  it('renders /student/notifications page', async () => {
    renderWithClient(<StudentNotificationsPage />);
    expect(await screen.findByText('Notifications & Alerts')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /in-app feed/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /preferences/i })).toBeTruthy();
  });

  it('renders /student/settings page', async () => {
    renderWithClient(<StudentSettingsPage />);
    expect(await screen.findByText('Account Settings')).toBeTruthy();
  });

  it('renders public /verify page', () => {
    renderWithClient(<VerifyPage />);
    expect(screen.getByText('Official Credential Verification')).toBeTruthy();
  });

  it('renders public /verify/[verificationCode] page', async () => {
    const page = await VerifyCodePage({
      params: Promise.resolve({ verificationCode: 'CERT-12345' }),
    });
    renderWithClient(page);
    expect(screen.getByDisplayValue('CERT-12345')).toBeTruthy();
  });
});
