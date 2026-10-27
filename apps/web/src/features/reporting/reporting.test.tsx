import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import { CourseOverviewMetrics } from './components/course-overview-metrics';
import { LearnerAnalyticsTable } from './components/learner-analytics-table';
import { AssessmentAnalyticsCard } from './components/assessment-analytics-card';
import { RevenueAnalyticsCard } from './components/revenue-analytics-card';
import { ExportTriggerModal } from './components/export-trigger-modal';
import { ExportJobsTracker } from './components/export-jobs-tracker';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
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

describe('Reporting Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CourseOverviewMetrics', () => {
    const mockOverview = {
      courseId: 'crs-1',
      enrollments: '42',
      activeLearners: '30',
      completions: '12',
      completionRate: '28.57',
      learningSeconds: '7200',
      daily: [
        {
          courseId: 'crs-1',
          day: '2026-10-26',
          newEnrollments: 5,
          activeLearners: 15,
          completions: 3,
          learningSeconds: '3600',
          assessmentSubmissions: 8,
        },
      ],
    };

    it('renders KPI metrics and daily breakdown', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockOverview });

      renderWithClient(<CourseOverviewMetrics workspaceId="ws-1" courseId="crs-1" />);

      expect(await screen.findByText('42')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
      expect(screen.getByText('28.57%')).toBeInTheDocument();
      expect(screen.getByText('2h 0m')).toBeInTheDocument();
      expect(screen.getByText('2026-10-26')).toBeInTheDocument();
    });
  });

  describe('LearnerAnalyticsTable', () => {
    const mockLearners = {
      data: [
        {
          enrollmentId: 'enr-1',
          userId: 'usr-learn-10',
          cohortId: 'coh-alpha',
          completionPercent: '80.00',
          lastActivityAt: '2026-10-26T10:00:00Z',
          learningSeconds: '5400',
        },
      ],
      meta: { limit: 20, hasMore: false },
    };

    it('renders learner progress and engagement statistics', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockLearners);

      renderWithClient(<LearnerAnalyticsTable workspaceId="ws-1" courseId="crs-1" />);

      expect(await screen.findByText('usr-learn-10')).toBeInTheDocument();
      expect(screen.getByText('80.00%')).toBeInTheDocument();
      expect(screen.getByText('1h 30m')).toBeInTheDocument();
    });
  });

  describe('AssessmentAnalyticsCard', () => {
    const mockAssessments = [
      {
        assessmentId: 'asm-101',
        attempts: '50',
        passed: '40',
        awaitingManualGrading: '3',
        averagePercent: '82.50',
      },
    ];

    it('renders assessment pass metrics and manual grading queue alert', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockAssessments });

      renderWithClient(<AssessmentAnalyticsCard workspaceId="ws-1" courseId="crs-1" />);

      expect(await screen.findByText('asm-101')).toBeInTheDocument();
      expect(screen.getByText('80.0%')).toBeInTheDocument();
      expect(screen.getByText('3 Pending')).toBeInTheDocument();
    });
  });

  describe('RevenueAnalyticsCard', () => {
    const mockRevenue = [
      { currency: 'usd', paid: 100000, refunded: 10000, net: 90000 },
      { currency: 'eur', paid: 50000, refunded: 0, net: 50000 },
    ];

    it('renders multi-currency financial ledger with reconciled amounts', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockRevenue });

      renderWithClient(<RevenueAnalyticsCard workspaceId="ws-1" />);

      expect(await screen.findAllByText('$900.00')).toHaveLength(2);
      expect(screen.getAllByText('€500.00')[0]).toBeInTheDocument();
      expect(screen.getAllByText(/reconciled/i)[0]).toBeInTheDocument();
    });
  });

  describe('ExportTriggerModal & ExportJobsTracker', () => {
    it('enqueues report export and tracks polling operation status to ready', async () => {
      const onExportStarted = vi.fn();
      renderWithClient(
        <ExportTriggerModal
          workspaceId="ws-1"
          defaultCourseId="crs-1"
          onExportStarted={onExportStarted}
        />,
      );

      const triggerBtn = screen.getByRole('button', { name: /request export/i });
      fireEvent.click(triggerBtn);

      expect(screen.getByText('Request Report Export')).toBeInTheDocument();

      vi.mocked(api.post).mockResolvedValueOnce({
        data: { operationId: 'op-exp-99', status: 'PENDING' },
      });

      const enqueueBtn = screen.getByRole('button', { name: /enqueue job/i });
      fireEvent.click(enqueueBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/workspaces/ws-1/analytics/exports'),
          expect.objectContaining({ kind: 'LEARNERS' }),
        );
        expect(onExportStarted).toHaveBeenCalledWith('op-exp-99');
      });

      // Now verify tracker
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          operationId: 'op-exp-99',
          status: 'READY',
          expiresAt: '2026-10-27T10:00:00Z',
          url: 'https://storage.platform.org/export-99.csv?signature=abc',
        },
      });

      renderWithClient(
        <ExportJobsTracker workspaceId="ws-1" operationIds={['op-exp-99']} onDismiss={vi.fn()} />,
      );

      expect(await screen.findByText('op-exp-99')).toBeInTheDocument();
      expect(screen.getByText('READY')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /download csv/i })).toHaveAttribute(
        'href',
        'https://storage.platform.org/export-99.csv?signature=abc',
      );
    });

    it('omits course selector for REVENUE exports and sends parameters without courseId', async () => {
      const onExportStarted = vi.fn();
      renderWithClient(
        <ExportTriggerModal
          workspaceId="ws-1"
          defaultCourseId="crs-1"
          onExportStarted={onExportStarted}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /request export/i }));

      const select = screen.getByLabelText(/report type/i);
      fireEvent.change(select, { target: { value: 'REVENUE' } });

      // Course ID input must be omitted for REVENUE
      expect(screen.queryByLabelText(/course id/i)).not.toBeInTheDocument();

      vi.mocked(api.post).mockResolvedValueOnce({
        data: { operationId: 'op-rev-101', status: 'PENDING' },
      });

      fireEvent.click(screen.getByRole('button', { name: /enqueue job/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/workspaces/ws-1/analytics/exports'),
          expect.objectContaining({
            kind: 'REVENUE',
            parameters: expect.not.objectContaining({ courseId: expect.anything() }),
          }),
        );
        expect(onExportStarted).toHaveBeenCalledWith('op-rev-101');
      });
    });

    it('requires courseId for course reports and shows error when empty', async () => {
      const onExportStarted = vi.fn();
      renderWithClient(<ExportTriggerModal workspaceId="ws-1" onExportStarted={onExportStarted} />);

      fireEvent.click(screen.getByRole('button', { name: /request export/i }));

      // By default kind is LEARNERS
      expect(screen.getByLabelText(/course id/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /enqueue job/i }));

      expect(
        await screen.findByText(/course id is required for course reports/i),
      ).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    });
  });
});
