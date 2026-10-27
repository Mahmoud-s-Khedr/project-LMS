import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogFixture, fixtureIds } from '@lms/shared';
import * as apiModule from '../api';
import { AcademyProfile } from './academy-profile';
import type { PublicWorkspace } from '../types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('AcademyProfile component', () => {
  const mockWorkspace: PublicWorkspace = {
    id: fixtureIds.workspace,
    kind: 'ACADEMY',
    slug: 'distributed-lab',
    name: 'Distributed Systems Laboratory',
    description: 'Advanced systems architecture, protocols, and performance engineering.',
    logoUrl: 'https://images.local/lab-logo.png',
    timezone: 'America/New_York',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders academy branding and course listing', async () => {
    vi.spyOn(apiModule, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: catalogFixture.data,
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    render(<AcademyProfile workspace={mockWorkspace} />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('heading', { name: 'Distributed Systems Laboratory', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Verified Academy')).toBeInTheDocument();
    expect(screen.getByText('America/New_York')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Reliable software')).toBeInTheDocument();
    });
  });

  it('renders empty state when academy has no published courses yet', async () => {
    vi.spyOn(apiModule, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    render(<AcademyProfile workspace={mockWorkspace} />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No courses available yet')).toBeInTheDocument();
    });
  });
});
