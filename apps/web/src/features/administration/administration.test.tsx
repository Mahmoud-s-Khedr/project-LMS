import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import { UsersTable } from './components/users-table';
import { WorkspacesTable } from './components/workspaces-table';
import { MembersTable } from './components/members-table';
import { OperationsEventsTable } from './components/operations-events-table';
import { WebhooksTable } from './components/webhooks-table';
import { AuditLogsTable } from './components/audit-logs-table';
import { AdminOverview } from './components/admin-overview';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/features/workspaces', () => ({
  useActiveWorkspace: () => ({
    activeWorkspaceId: '10000000-0000-4000-8000-000000000001',
    activeWorkspace: {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Test Academy',
      slug: 'test-academy',
      kind: 'ACADEMY',
    },
  }),
}));

vi.mock('@/features/auth/hooks', () => ({
  useMeQuery: () => ({
    data: {
      id: '90000000-0000-4000-8000-000000000001',
      name: 'Super Admin',
      email: 'admin@platform.org',
      platformRole: 'SUPER_ADMIN',
    },
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

describe('Administration Feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('UsersTable Component', () => {
    const mockUsers = {
      data: [
        {
          id: 'user-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          platformRole: 'STUDENT',
          status: 'ACTIVE',
          emailVerifiedAt: '2026-10-26T00:00:00Z',
          locale: 'en',
          timezone: 'UTC',
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
          avatarUrl: null,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };

    it('renders users list and handles update dialog', async () => {
      vi.mocked(api.get).mockResolvedValue(mockUsers);
      renderWithClient(<UsersTable />);

      expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();

      const manageBtn = screen.getByRole('button', { name: /manage/i });
      fireEvent.click(manageBtn);

      expect(screen.getByText('Manage Platform User')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/reason for administrative change/i);
      fireEvent.change(reasonInput, { target: { value: 'Security review' } });

      vi.mocked(api.patch).mockResolvedValueOnce({
        data: {
          ...mockUsers.data[0],
          status: 'SUSPENDED',
        },
      });

      const submitBtn = screen.getByRole('button', { name: /confirm changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          expect.stringContaining('/admin/users/user-1'),
          expect.objectContaining({
            reason: 'Security review',
          }),
          { headers: { 'If-Match': '"2026-10-20T10:00:00.000Z"' } },
        );
      });
    });
  });

  describe('WorkspacesTable Component', () => {
    const mockWorkspaces = {
      data: [
        {
          id: 'ws-1',
          name: 'Acme Academy',
          slug: 'acme-academy',
          kind: 'ACADEMY',
          status: 'ACTIVE',
          timezone: 'America/New_York',
          ownerId: 'owner-1',
          description: null,
          logoUrl: null,
          settings: {},
          suspendedAt: null,
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };

    it('renders workspaces and handles status changes', async () => {
      vi.mocked(api.get).mockResolvedValue(mockWorkspaces);
      renderWithClient(<WorkspacesTable />);

      expect(await screen.findByText('Acme Academy')).toBeInTheDocument();
      expect(screen.getByText('/acme-academy')).toBeInTheDocument();

      const govBtn = screen.getByRole('button', { name: /governance/i });
      fireEvent.click(govBtn);

      expect(screen.getByText('Workspace Governance')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/reason for administrative action/i);
      fireEvent.change(reasonInput, { target: { value: 'Compliance verification' } });

      vi.mocked(api.patch).mockResolvedValueOnce({
        data: {
          ...mockWorkspaces.data[0],
          status: 'SUSPENDED',
          suspendedAt: new Date().toISOString(),
        },
      });

      const confirmBtn = screen.getByRole('button', { name: /confirm status/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith(
          expect.stringContaining('/admin/workspaces/ws-1'),
          expect.objectContaining({
            reason: 'Compliance verification',
          }),
          { headers: { 'If-Match': `"ws-1:${new Date('2026-10-20T10:00:00Z').getTime()}"` } },
        );
      });
    });
  });

  describe('MembersTable Component', () => {
    const mockMembers = {
      data: [
        {
          id: 'mem-1',
          userId: 'user-100',
          role: 'INSTRUCTOR',
          status: 'ACTIVE',
          joinedAt: '2026-10-20T10:00:00Z',
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
        },
      ],
      meta: { limit: 20, hasMore: false },
    };

    const mockInvitations = {
      data: [
        {
          id: 'inv-1',
          email: 'invited@academy.org',
          role: 'TEACHING_ASSISTANT',
          invitedById: 'owner-1',
          expiresAt: '2026-11-20T10:00:00Z',
          acceptedAt: null,
          revokedAt: null,
          createdAt: '2026-10-20T10:00:00Z',
          updatedAt: '2026-10-20T10:00:00Z',
        },
      ],
      meta: { limit: 20, hasMore: false },
    };

    it('renders members and outstanding invitations', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockMembers).mockResolvedValueOnce(mockInvitations);

      renderWithClient(<MembersTable workspaceId="ws-1" />);

      expect(await screen.findByText('user-100')).toBeInTheDocument();
      expect(screen.getByText('invited@academy.org')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /invite staff/i })).toBeInTheDocument();
    });
  });

  describe('OperationsEventsTable Component', () => {
    const mockEvents = {
      data: [
        {
          id: 'evt-1',
          workspaceId: 'ws-1',
          type: 'order.paid.v1',
          schemaVersion: 1,
          aggregateType: 'Order',
          aggregateId: 'ord-123',
          sequence: '100',
          status: 'FAILED',
          attempts: 3,
          availableAt: '2026-10-26T10:00:00Z',
          createdAt: '2026-10-26T10:00:00Z',
          publishedAt: null,
          errorCode: 'TIMEOUT',
        },
      ],
      meta: { limit: 20, hasMore: false },
    };

    it('renders failed events and triggers replay with reason', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockEvents);
      renderWithClient(<OperationsEventsTable workspaceId="ws-1" />);

      expect(await screen.findByText('order.paid.v1')).toBeInTheDocument();
      expect(screen.getByText('TIMEOUT')).toBeInTheDocument();

      const replayBtn = screen.getByRole('button', { name: /replay/i });
      fireEvent.click(replayBtn);

      expect(screen.getByText('Replay Outbox Event')).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/reason for administrative replay/i);
      fireEvent.change(reasonInput, { target: { value: 'Manual retry after worker reboot' } });

      vi.mocked(api.post).mockResolvedValueOnce({
        data: { operationId: 'op-1', status: 'PENDING' },
      });

      const confirmBtn = screen.getByRole('button', { name: /trigger replay/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/operations/events/evt-1/replay'),
          expect.objectContaining({ reason: 'Manual retry after worker reboot' }),
        );
      });
    });
  });

  describe('WebhooksTable Component', () => {
    const mockWebhooks = {
      data: [
        {
          id: 'hook-1',
          workspaceId: null,
          type: 'checkout.session.completed',
          status: 'SUCCEEDED',
          attempts: 1,
          receivedAt: '2026-10-26T10:00:00Z',
          processedAt: '2026-10-26T10:00:01Z',
          errorCode: null,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    };

    it('renders webhooks list and allows replay', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockWebhooks);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderWithClient(<WebhooksTable />);

      expect(await screen.findByText('checkout.session.completed')).toBeInTheDocument();

      const replayBtn = screen.getByRole('button', { name: /replay/i });
      vi.mocked(api.post).mockResolvedValueOnce({
        data: { operationId: 'op-2', status: 'PENDING' },
      });

      fireEvent.click(replayBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          expect.stringContaining('/admin/webhooks/hook-1/replay'),
          expect.anything(),
        );
      });
    });
  });

  describe('AuditLogsTable Component', () => {
    const mockLogs = {
      data: [
        {
          id: 'log-1',
          workspaceId: 'ws-1',
          actorId: 'usr-12345678',
          action: 'member.role_updated',
          resourceType: 'WorkspaceMember',
          resourceId: 'mem-999',
          requestId: 'req-45678912',
          changes: {
            fields: ['role'],
            reason: 'Promotion to lead instructor',
          },
          createdAt: '2026-10-26T11:00:00Z',
        },
      ],
      meta: { limit: 20, hasMore: false },
    };

    it('renders audit logs with reason and changed fields', async () => {
      vi.mocked(api.get).mockResolvedValueOnce(mockLogs);
      renderWithClient(<AuditLogsTable workspaceId="ws-1" />);

      expect(await screen.findByText('member.role_updated')).toBeInTheDocument();
      expect(screen.getByText('WorkspaceMember')).toBeInTheDocument();
      expect(screen.getByText(/"Promotion to lead instructor"/i)).toBeInTheDocument();
      expect(screen.getByText('role')).toBeInTheDocument();
    });
  });

  describe('AdminOverview Component', () => {
    it('renders overview metrics and navigation shortcuts', async () => {
      vi.mocked(api.get)
        .mockResolvedValueOnce({
          data: [],
          meta: { page: 1, pageSize: 1, total: 42, totalPages: 1 },
        }) // users
        .mockResolvedValueOnce({
          data: [],
          meta: { page: 1, pageSize: 1, total: 7, totalPages: 1 },
        }) // workspaces
        .mockResolvedValueOnce({ data: [], meta: { limit: 20, hasMore: false } }) // operations
        .mockResolvedValueOnce({
          data: [],
          meta: { page: 1, pageSize: 1, total: 0, totalPages: 1 },
        }) // webhooks
        .mockResolvedValueOnce({ data: [], meta: { limit: 20, hasMore: false } }); // audit

      renderWithClient(<AdminOverview />);

      expect(await screen.findByText('42')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(screen.getAllByText('Platform Users')[0]).toBeInTheDocument();
      expect(screen.getByText('Active Tenants')).toBeInTheDocument();
    });
  });
});
