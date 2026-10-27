import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/lib/api';
import { CreateWorkspaceForm, slugify } from './components/create-workspace-form';
import { WorkspaceSwitcher } from './components/workspace-switcher';
import { WorkspaceChooser } from './components/workspace-chooser';
import type { MyWorkspace } from '@lms/shared';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/onboarding',
}));

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockWorkspaces: MyWorkspace[] = [
  {
    id: '00000000-0000-0000-0000-000000000010',
    workspaceId: '00000000-0000-0000-0000-000000000010',
    name: 'Elena Studio',
    slug: 'elena-studio',
    kind: 'PERSONAL',
    description: 'Personal instructor workspace for data science',
    logoUrl: null,
    defaultCurrency: 'usd',
    timezone: 'UTC',
    settings: {},
    status: 'ACTIVE',
    ownerId: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    membership: {
      id: '00000000-0000-0000-0000-000000000101',
      workspaceId: '00000000-0000-0000-0000-000000000010',
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'ADMIN',
      status: 'ACTIVE',
      joinedAt: '2026-10-01T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    permissions: ['workspace.manage', 'courses.create', 'courses.edit'],
  },
  {
    id: '00000000-0000-0000-0000-000000000020',
    workspaceId: '00000000-0000-0000-0000-000000000020',
    name: 'Apex Academy',
    slug: 'apex-academy',
    kind: 'ACADEMY',
    description: 'Full team academy',
    logoUrl: null,
    defaultCurrency: 'usd',
    timezone: 'America/New_York',
    settings: {},
    status: 'ACTIVE',
    ownerId: '00000000-0000-0000-0000-000000000002',
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    membership: {
      id: '00000000-0000-0000-0000-000000000102',
      workspaceId: '00000000-0000-0000-0000-000000000020',
      userId: '00000000-0000-0000-0000-000000000001',
      role: 'INSTRUCTOR',
      status: 'ACTIVE',
      joinedAt: '2026-10-02T00:00:00.000Z',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
    permissions: ['courses.create', 'courses.edit'],
  },
];

describe('Workspaces Feature', () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.restoreAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  describe('slugify helper', () => {
    it('converts titles into url-safe slugs', () => {
      expect(slugify('My Awesome Academy! 2026')).toBe('my-awesome-academy-2026');
      expect(slugify('  --Python & Rust Masterclass-- ')).toBe('python-rust-masterclass');
    });
  });

  describe('CreateWorkspaceForm', () => {
    it('automatically generates slug as user types workspace name', async () => {
      renderWithQueryClient(<CreateWorkspaceForm />);

      const nameInput = screen.getByLabelText(/workspace name/i);
      fireEvent.change(nameInput, { target: { value: 'Frontend Masters Studio' } });

      const slugInput = screen.getByLabelText(/workspace url slug/i) as HTMLInputElement;
      expect(slugInput.value).toBe('frontend-masters-studio');
    });

    it('submits valid workspace and invokes onSuccess callback', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          id: '00000000-0000-0000-0000-000000000099',
          name: 'NextGen Academy',
          slug: 'nextgen-academy',
          kind: 'ACADEMY',
          description: 'A modern academy',
          defaultCurrency: 'usd',
          timezone: 'UTC',
          settings: {},
          status: 'ACTIVE',
          ownerId: '00000000-0000-0000-0000-000000000001',
          createdAt: '2026-10-26T10:00:00.000Z',
          updatedAt: '2026-10-26T10:00:00.000Z',
        },
      });

      const successCb = vi.fn();
      renderWithQueryClient(<CreateWorkspaceForm defaultKind="ACADEMY" onSuccess={successCb} />);

      fireEvent.change(screen.getByLabelText(/workspace name/i), {
        target: { value: 'NextGen Academy' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create workspace/i }));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/workspaces',
          expect.objectContaining({
            name: 'NextGen Academy',
            slug: 'nextgen-academy',
            kind: 'ACADEMY',
            defaultCurrency: 'usd',
            timezone: 'UTC',
          }),
        );
      });

      expect(successCb).toHaveBeenCalledWith(expect.objectContaining({ slug: 'nextgen-academy' }));
    });

    it('displays error banner when workspace creation fails', async () => {
      vi.spyOn(api, 'post').mockRejectedValueOnce(
        new ApiError(409, {
          error: {
            code: 'CONFLICT',
            message: 'Workspace slug already in use',
            requestId: 'req_ws_conflict',
            timestamp: '2026-10-26T10:00:00.000Z',
            path: '/api/v1/workspaces',
          },
        }),
      );

      renderWithQueryClient(<CreateWorkspaceForm />);

      fireEvent.change(screen.getByLabelText(/workspace name/i), {
        target: { value: 'Duplicate Slug Studio' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create workspace/i }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('Workspace slug already in use');
      expect(alert.textContent).toContain('req_ws_conflict');
    });
  });

  describe('WorkspaceSwitcher', () => {
    it('renders current active workspace and switches between them', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: mockWorkspaces,
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      renderWithQueryClient(<WorkspaceSwitcher />);

      expect(await screen.findByText('Elena Studio')).toBeTruthy();
      expect(screen.getByText('Personal')).toBeTruthy();

      const trigger = screen.getByRole('button', {
        name: /current workspace: elena studio/i,
      });
      fireEvent.pointerDown(trigger, { button: 0 });
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });

      expect(await screen.findByText('Apex Academy')).toBeTruthy();

      fireEvent.click(screen.getByText('Apex Academy'));

      expect(window.localStorage.getItem('lms_active_workspace_id')).toBe(
        '00000000-0000-0000-0000-000000000020',
      );
    });

    it('renders create workspace button when user has no workspaces', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      renderWithQueryClient(<WorkspaceSwitcher />);

      const createBtn = await screen.findByRole('link', { name: /create workspace/i });
      expect(createBtn.getAttribute('href')).toBe('/onboarding');
    });
  });

  describe('WorkspaceChooser', () => {
    it('renders workspace cards and navigates on selection', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: mockWorkspaces,
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      renderWithQueryClient(<WorkspaceChooser />);

      expect(await screen.findByText('Elena Studio')).toBeTruthy();
      expect(screen.getByText('Apex Academy')).toBeTruthy();

      const openButtons = screen.getAllByRole('button', { name: /open studio/i });
      expect(openButtons.length).toBe(2);

      // Click second workspace (Apex Academy, role INSTRUCTOR)
      fireEvent.click(openButtons[1]!);

      expect(pushMock).toHaveBeenCalledWith('/instructor');
      expect(window.localStorage.getItem('lms_active_workspace_id')).toBe(
        '00000000-0000-0000-0000-000000000020',
      );
    });

    it('renders empty card when user belongs to no workspaces', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      const createMock = vi.fn();
      renderWithQueryClient(<WorkspaceChooser onCreateNew={createMock} />);

      expect(await screen.findByText(/no workspaces found/i)).toBeTruthy();

      const createFirstBtn = screen.getByRole('button', { name: /create first workspace/i });
      fireEvent.click(createFirstBtn);
      expect(createMock).toHaveBeenCalled();
    });
  });
});
