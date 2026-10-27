import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import { RosterTable } from './components/roster-table';
import { ManualEnrollmentDialog } from './components/manual-enrollment-dialog';
import { LearnerDetailDialog } from './components/learner-detail-dialog';
import { ManualGrantDialog } from './components/manual-grant-dialog';
import { EnrollmentStatusDialog } from './components/enrollment-status-dialog';
import type { Enrollment } from '@lms/shared';

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

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockEnrollment: Enrollment = {
  id: 'enr-1',
  workspaceId: 'ws-1',
  courseId: 'crs-1',
  userId: 'usr-12345678-0000',
  cohortId: 'coh-1',
  status: 'ACTIVE',
  enrolledAt: '2026-10-20T10:00:00Z',
  startedAt: '2026-10-21T10:00:00Z',
  completedAt: null,
  lastActivityAt: '2026-10-25T10:00:00Z',
  completionPercent: '45.00',
  access: {
    allowed: true,
    expiresAt: null,
  },
  grants: [
    {
      id: 'grnt-1',
      source: 'ORDER_ITEM',
      startsAt: '2026-10-20T10:00:00Z',
      expiresAt: null,
      revokedAt: null,
    },
  ],
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
};

const mockDetail = {
  data: {
    ...mockEnrollment,
    grantProvenance: [
      {
        id: 'grnt-1',
        source: 'ORDER_ITEM',
        startsAt: '2026-10-20T10:00:00Z',
        expiresAt: null,
        revokedAt: null,
        workspaceId: 'ws-1',
        enrollmentId: 'enr-1',
        reason: null,
        grantedById: null,
        orderItemId: 'ord-item-1',
        subscriptionId: null,
      },
    ],
  },
};

describe('Roster Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RosterTable', () => {
    it('renders enrollment roster with progress and access badges', async () => {
      vi.mocked(api.get).mockResolvedValueOnce({
        data: [mockEnrollment],
        meta: { limit: 20, hasMore: false },
      });

      renderWithClient(<RosterTable workspaceId="ws-1" courseId="crs-1" />);

      expect(await screen.findByText('usr-12345678-0000')).toBeInTheDocument();
      expect(screen.getByText('45.00%')).toBeInTheDocument();
      expect(screen.getByText('Allowed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enroll learner/i })).toBeInTheDocument();
    });
  });

  describe('ManualEnrollmentDialog', () => {
    it('validates required fields and submits manual enrollment with reason', async () => {
      renderWithClient(<ManualEnrollmentDialog workspaceId="ws-1" courseId="crs-1" />);

      const triggerBtn = screen.getByRole('button', { name: /enroll learner/i });
      fireEvent.click(triggerBtn);

      expect(screen.getByText('Manual Learner Enrollment')).toBeInTheDocument();

      const userInput = screen.getByLabelText(/learner user id/i);
      fireEvent.change(userInput, { target: { value: 'usr-9999' } });

      const reasonInput = screen.getByLabelText(/justification reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Manual scholarship grant' } });

      vi.mocked(api.post).mockResolvedValueOnce({
        data: mockEnrollment,
      });

      const submitBtn = screen.getByRole('button', { name: /confirm enrollment/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/workspaces/ws-1/courses/crs-1/enrollments/manual'),
          expect.objectContaining({
            userId: 'usr-9999',
            reason: 'Manual scholarship grant',
          }),
        );
      });
    });
  });

  describe('LearnerDetailDialog', () => {
    it('displays grant provenance and allows revoking grant with reason', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockDetail);

      renderWithClient(
        <LearnerDetailDialog
          workspaceId="ws-1"
          courseId="crs-1"
          enrollmentId="enr-1"
          onClose={vi.fn()}
          onAddGrant={vi.fn()}
        />,
      );

      expect(await screen.findByText('Entitlement Grants (1)')).toBeInTheDocument();
      expect(screen.getByText('ORDER_ITEM')).toBeInTheDocument();

      const revokeBtn = screen.getByRole('button', { name: /revoke/i });
      fireEvent.click(revokeBtn);

      expect(screen.getByText('Revoke Access Grant')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/reason for revocation/i);
      fireEvent.change(reasonInput, { target: { value: 'Manual course refund granted' } });

      vi.mocked(api.post).mockResolvedValueOnce(undefined);

      const confirmBtn = screen.getByRole('button', { name: /confirm revocation/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/grants/grnt-1/revoke'),
          expect.objectContaining({ reason: 'Manual course refund granted' }),
        );
      });
    });
  });

  describe('ManualGrantDialog', () => {
    it('issues manual grant with valid time window and required reason', async () => {
      renderWithClient(
        <ManualGrantDialog
          workspaceId="ws-1"
          courseId="crs-1"
          enrollmentId="enr-1"
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('Issue Manual Access Grant')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/grant reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Extension approved by instructor' } });

      vi.mocked(api.post).mockResolvedValueOnce({
        data: {
          id: 'grnt-2',
          source: 'MANUAL',
          startsAt: '2026-10-26T00:00:00Z',
          expiresAt: null,
          revokedAt: null,
        },
      });

      const submitBtn = screen.getByRole('button', { name: /issue grant/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/enrollments/enr-1/grants'),
          expect.objectContaining({ reason: 'Extension approved by instructor' }),
        );
      });
    });
  });

  describe('EnrollmentStatusDialog', () => {
    it('updates enrollment status with mandatory reason', async () => {
      renderWithClient(
        <EnrollmentStatusDialog
          workspaceId="ws-1"
          courseId="crs-1"
          enrollment={mockEnrollment}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText('Update Enrollment Status')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/reason for administrative change/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Suspended pending academic honesty investigation' },
      });

      vi.mocked(api.patch).mockResolvedValueOnce({
        data: {
          ...mockEnrollment,
          status: 'SUSPENDED',
        },
      });

      const submitBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          expect.stringContaining('/enrollments/enr-1'),
          expect.objectContaining({
            reason: 'Suspended pending academic honesty investigation',
          }),
          expect.objectContaining({
            headers: {
              'If-Match': expect.stringMatching(/^"[0-9]+"$/),
            },
          }),
        );
      });
    });

    it('on 409 conflict refetches enrollment and displays reload prompt', async () => {
      renderWithClient(
        <EnrollmentStatusDialog
          workspaceId="ws-1"
          courseId="crs-1"
          enrollment={mockEnrollment}
          onClose={vi.fn()}
        />,
      );

      const reasonInput = screen.getByLabelText(/reason for administrative change/i);
      fireEvent.change(reasonInput, { target: { value: 'Transferring to another cohort' } });

      const err409 = Object.assign(new Error('Conflict'), { status: 409 });
      vi.mocked(api.patch).mockRejectedValueOnce(err409);
      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          ...mockEnrollment,
          cohortId: 'coh-2',
          updatedAt: '2026-10-26T12:00:00Z',
        },
      });

      const submitBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(submitBtn);

      expect(
        await screen.findByText(/this enrollment was modified by another session/i),
      ).toBeInTheDocument();

      const reloadBtn = screen.getByRole('button', { name: /reload latest enrollment/i });
      expect(reloadBtn).toBeInTheDocument();

      vi.mocked(api.get).mockResolvedValueOnce({
        data: {
          ...mockEnrollment,
          cohortId: 'coh-2',
          updatedAt: '2026-10-26T12:00:00Z',
        },
      });

      fireEvent.click(reloadBtn);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/enrollments/enr-1'));
      });
    });
  });
});
