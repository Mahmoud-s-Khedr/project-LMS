import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogDetailFixture, fixtureIds, fixtureTimestamp } from '@lms/shared';
import { api, ApiError } from '@/lib/api';
import { CourseDetail } from './course-detail';
import type { PublicCourseDetail } from '../types';
import * as authModule from '@/features/auth';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/features/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth')>();
  return {
    ...actual,
    useMeQuery: vi.fn(),
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockUser = {
  id: fixtureIds.user,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  status: 'ACTIVE' as const,
  platformRole: 'STUDENT' as const,
  profile: { displayName: 'Ada Lovelace', avatarUrl: null, headline: null, bio: null },
  memberships: [],
  activeWorkspaceId: null,
};

const mockEnrollment = {
  id: fixtureIds.enrollment,
  workspaceId: fixtureIds.workspace,
  courseId: fixtureIds.course,
  userId: fixtureIds.user,
  cohortId: null,
  status: 'ACTIVE' as const,
  enrolledAt: fixtureTimestamp,
  startedAt: null,
  completedAt: null,
  lastActivityAt: null,
  completionPercent: '0.00',
  createdAt: fixtureTimestamp,
  updatedAt: fixtureTimestamp,
  access: {
    allowed: true,
    expiresAt: null,
  },
  grants: [
    {
      id: '10000000-0000-4000-8000-000000000088',
      source: 'FREE' as const,
      startsAt: fixtureTimestamp,
      expiresAt: null,
      revokedAt: null,
    },
  ],
};

const freeSelfPacedCourse: PublicCourseDetail = {
  ...catalogDetailFixture.data,
  id: fixtureIds.course,
  slug: 'free-self-paced-algorithms',
  isFree: true,
  status: 'PUBLISHED',
  deliveryMode: 'SELF_PACED',
  prices: [],
};

const mockCohortId = '10000000-0000-4000-8000-000000000077';
const freeCohortCourse: PublicCourseDetail = {
  ...catalogDetailFixture.data,
  id: fixtureIds.course,
  slug: 'free-cohort-systems',
  isFree: true,
  status: 'PUBLISHED',
  deliveryMode: 'COHORT',
  prices: [],
};

describe('P3-F-FREE-ENROLL Free Course Enrollment CTA', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  describe('Signed-out visitor state', () => {
    it('renders "Sign in to enroll" linking to /login?redirect=<course page>', () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      const link = screen.getByRole('link', { name: /sign in to enroll/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', `/login?redirect=/courses/${freeSelfPacedCourse.slug}`);
      expect(screen.queryByRole('button', { name: /enroll for free/i })).not.toBeInTheDocument();
    });
  });

  describe('Signed-in user on free self-paced course', () => {
    it('calls POST /courses/:courseId/enroll with Idempotency-Key and redirects to /learn/:enrollmentId on 201', async () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      // No existing enrollment
      vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockEnrollment });

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      const enrollBtn = screen.getByRole('button', { name: /enroll for free/i });
      expect(enrollBtn).toBeInTheDocument();
      fireEvent.click(enrollBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(1);
      });

      const [path, body, options] = postSpy.mock.calls[0] as [
        string,
        unknown,
        { headers?: Record<string, string> },
      ];
      expect(path).toBe(`/courses/${freeSelfPacedCourse.id}/enroll`);
      expect(body).toEqual({});

      const key = options.headers?.['Idempotency-Key'];
      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key!.length).toBeGreaterThanOrEqual(16);
      expect(key!.length).toBeLessThanOrEqual(128);
      expect(/^[A-Za-z0-9._:-]+$/.test(key!)).toBe(true);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/learn/${mockEnrollment.id}`);
      });
    });
  });

  describe('Signed-in user on free cohort course', () => {
    it('displays cohort selector and requires cohort selection before enrolling', async () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
        if (path.includes('/cohorts')) {
          return {
            data: [
              {
                id: mockCohortId,
                workspaceId: fixtureIds.workspace,
                courseId: freeCohortCourse.id,
                name: 'Spring 2027 Cohort',
                startsAt: '2027-04-01T00:00:00.000Z',
                endsAt: '2027-05-15T00:00:00.000Z',
                enrollmentOpensAt: '2027-01-01T00:00:00.000Z',
                enrollmentClosesAt: '2027-03-31T00:00:00.000Z',
                seatsAvailable: 15,
                capacity: 30,
                timezone: 'America/New_York',
                isPublished: true,
              },
            ],
            meta: { nextCursor: null, hasMore: false, limit: 20 },
          };
        }
        if (path.includes('/me/enrollments')) {
          return { data: [] };
        }
        return { data: [] };
      });

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: { ...mockEnrollment, cohortId: mockCohortId },
      });

      render(<CourseDetail course={freeCohortCourse} />, { wrapper: createWrapper() });

      // Cohort select must be present
      await waitFor(() => {
        expect(screen.getByLabelText(/select cohort/i)).toBeInTheDocument();
      });

      // Clicking enroll without cohort selection shows inline error
      const enrollBtn = screen.getByRole('button', { name: /enroll for free/i });
      fireEvent.click(enrollBtn);

      expect(postSpy).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/please select a cohort/i);

      // Now select the cohort
      const cohortSelect = screen.getByLabelText(/select cohort/i);
      fireEvent.change(cohortSelect, { target: { value: mockCohortId } });

      // Click enroll again
      fireEvent.click(enrollBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(1);
      });

      const [path, body, options] = postSpy.mock.calls[0] as [
        string,
        unknown,
        { headers?: Record<string, string> },
      ];
      expect(path).toBe(`/courses/${freeCohortCourse.id}/enroll`);
      expect(body).toEqual({ cohortId: mockCohortId });
      expect(options.headers?.['Idempotency-Key']).toBeDefined();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/learn/${mockEnrollment.id}`);
      });
    });
  });

  describe('Idempotency-Key reuse on retry', () => {
    it('generates key once per click and reuses the exact key on retry after failure', async () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      vi.spyOn(api, 'get').mockResolvedValue({ data: [] });

      const postSpy = vi
        .spyOn(api, 'post')
        .mockRejectedValueOnce(
          new ApiError(503, {
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Database temporarily unavailable',
              requestId: 'req-503',
              timestamp: fixtureTimestamp,
              path: `/courses/${freeSelfPacedCourse.id}/enroll`,
            },
          }),
        )
        .mockResolvedValueOnce({ data: mockEnrollment });

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      const enrollBtn = screen.getByRole('button', { name: /enroll for free/i });
      fireEvent.click(enrollBtn);

      // Wait for 503 error alert
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/database temporarily unavailable/i);

      expect(postSpy).toHaveBeenCalledTimes(1);
      const firstKey = (
        postSpy.mock.calls[0] as [string, unknown, { headers?: Record<string, string> }]
      )[2].headers?.['Idempotency-Key'];

      // Click "Try again" (retry)
      const retryBtn = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(2);
      });

      const secondKey = (
        postSpy.mock.calls[1] as [string, unknown, { headers?: Record<string, string> }]
      )[2].headers?.['Idempotency-Key'];

      // EXACT key must be reused on retry!
      expect(secondKey).toBe(firstKey);
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(`/learn/${mockEnrollment.id}`);
      });
    });
  });

  describe('Already enrolled state', () => {
    it('shows "Go to course" linking to /learn/:enrollmentId when user is already enrolled on load', async () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      // User already has an enrollment for this course
      vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
        if (path.includes('/me/enrollments')) {
          return { data: [mockEnrollment] };
        }
        return { data: [] };
      });

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /go to course/i })).toBeInTheDocument();
      });

      const link = screen.getByRole('link', { name: /go to course/i });
      expect(link).toHaveAttribute('href', `/learn/${mockEnrollment.id}`);
      expect(screen.queryByRole('button', { name: /enroll for free/i })).not.toBeInTheDocument();
    });

    it('shows inline message and "Go to course" button when enrollment returns 409 Conflict', async () => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      vi.spyOn(api, 'get').mockImplementation(async (path: string) => {
        if (path.includes('/me/enrollments')) {
          return { data: [mockEnrollment] };
        }
        return { data: [] };
      });

      vi.spyOn(api, 'post').mockRejectedValueOnce(
        new ApiError(409, {
          error: {
            code: 'ENROLLMENT_CONFLICT',
            message: 'You are already enrolled in this course',
            requestId: 'req-409',
            timestamp: fixtureTimestamp,
            path: `/courses/${freeSelfPacedCourse.id}/enroll`,
          },
        }),
      );

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      const enrollBtn = screen.getByRole('button', { name: /enroll for free/i });
      fireEvent.click(enrollBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent(/already enrolled in this course/i);

      // Must show "Go to course"
      await waitFor(() => {
        expect(screen.getByText(/go to course/i)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling (400, 403, 409, 422, 429, 503)', () => {
    it.each([
      {
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Invalid enrollment request. Please check your selections and try again.',
      },
      {
        status: 403,
        code: 'FORBIDDEN',
        message: 'You do not have permission to enroll in this course.',
      },
      {
        status: 422,
        code: 'COHORT_REQUIRED',
        message: 'A cohort is required for this course',
      },
      {
        status: 429,
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many enrollment attempts. Please slow down and try again shortly.',
      },
      {
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message:
          'Enrollment service is temporarily unavailable. Please try again in a few moments.',
      },
    ])('displays clear inline message on HTTP $status', async ({ status, code, message }) => {
      vi.mocked(authModule.useMeQuery).mockReturnValue({
        data: mockUser,
        isPending: false,
        isError: false,
      } as unknown as ReturnType<typeof authModule.useMeQuery>);

      vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
      vi.spyOn(api, 'post').mockRejectedValueOnce(
        new ApiError(status, {
          error: {
            code,
            message,
            requestId: `req-${status}`,
            timestamp: fixtureTimestamp,
            path: `/courses/${freeSelfPacedCourse.id}/enroll`,
          },
        }),
      );

      render(<CourseDetail course={freeSelfPacedCourse} />, { wrapper: createWrapper() });

      const enrollBtn = screen.getByRole('button', { name: /enroll for free/i });
      fireEvent.click(enrollBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
      expect(screen.getByRole('alert')).toHaveTextContent(message);
    });
  });

  describe('Paid courses', () => {
    it('keeps existing checkout flow unchanged with "Enroll Now" link to register/courses', () => {
      const paidCourse: PublicCourseDetail = {
        ...catalogDetailFixture.data,
        id: fixtureIds.course,
        slug: 'paid-advanced-systems',
        isFree: false,
        prices: [
          {
            priceId: fixtureIds.price,
            productId: fixtureIds.product,
            currency: 'usd',
            amount: 9900,
            interval: null,
            intervalCount: 1,
            trialDays: 0,
          },
        ],
      };

      render(<CourseDetail course={paidCourse} />, { wrapper: createWrapper() });

      const enrollLink = screen.getByRole('link', { name: /enroll now/i });
      expect(enrollLink).toBeInTheDocument();
      expect(enrollLink).toHaveAttribute('href', `/register?redirect=/courses/${paidCourse.slug}`);
      expect(screen.queryByRole('button', { name: /enroll for free/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /sign in to enroll/i })).not.toBeInTheDocument();
    });
  });
});
