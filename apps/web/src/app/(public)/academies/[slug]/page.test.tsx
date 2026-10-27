import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { fixtureIds } from '@lms/shared';
import * as catalogApi from '@/features/catalog/api';
import AcademyPage, { generateMetadata } from './page';
import type { PublicWorkspace } from '@/features/catalog';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('AcademyPage', () => {
  const mockWorkspace: PublicWorkspace = {
    id: fixtureIds.workspace,
    kind: 'ACADEMY',
    slug: 'software-craft',
    name: 'Software Craft Academy',
    description: 'High standard software design courses.',
    logoUrl: null,
    timezone: 'UTC',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders academy page when workspace is found', async () => {
    vi.spyOn(catalogApi, 'fetchPublicWorkspace').mockResolvedValueOnce(mockWorkspace);
    vi.spyOn(catalogApi, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    const jsx = await AcademyPage({
      params: Promise.resolve({ slug: 'software-craft' }),
    });

    render(jsx, { wrapper: createWrapper() });

    expect(
      screen.getByRole('heading', { name: 'Software Craft Academy', level: 1 }),
    ).toBeInTheDocument();
  });

  it('calls notFound() when workspace does not exist', async () => {
    vi.spyOn(catalogApi, 'fetchPublicWorkspace').mockRejectedValueOnce(new Error('Not found'));

    await AcademyPage({
      params: Promise.resolve({ slug: 'invalid-academy' }),
    });

    expect(notFound).toHaveBeenCalled();
  });

  it('generates dynamic SEO metadata', async () => {
    vi.spyOn(catalogApi, 'fetchPublicWorkspace').mockResolvedValueOnce(mockWorkspace);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'software-craft' }),
    });

    expect(metadata.title).toBe('Software Craft Academy | Academy Profile');
  });
});
