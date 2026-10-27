import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { catalogDetailFixture } from '@lms/shared';
import * as catalogApi from '@/features/catalog/api';
import CourseDetailPage, { generateMetadata } from './page';

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

describe('CourseDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders course detail when course is found by slug', async () => {
    vi.spyOn(catalogApi, 'findCatalogCourseBySlug').mockResolvedValueOnce(
      catalogDetailFixture.data,
    );

    const jsx = await CourseDetailPage({
      params: Promise.resolve({ slug: 'reliable-software' }),
    });

    render(jsx, { wrapper: createWrapper() });

    expect(
      screen.getByRole('heading', { name: 'Reliable software', level: 1 }),
    ).toBeInTheDocument();
  });

  it('calls notFound() when course does not exist', async () => {
    vi.spyOn(catalogApi, 'findCatalogCourseBySlug').mockResolvedValueOnce(null);

    await CourseDetailPage({
      params: Promise.resolve({ slug: 'nonexistent' }),
    });

    expect(notFound).toHaveBeenCalled();
  });

  it('generates dynamic SEO metadata', async () => {
    vi.spyOn(catalogApi, 'findCatalogCourseBySlug').mockResolvedValueOnce(
      catalogDetailFixture.data,
    );

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'reliable-software' }),
    });

    expect(metadata.title).toBe('Reliable software');
    expect(metadata.description).toBe(catalogDetailFixture.data.summary);
  });

  it('passes workspace searchParam to findCatalogCourseBySlug to resolve tenant-local slugs', async () => {
    const findSpy = vi
      .spyOn(catalogApi, 'findCatalogCourseBySlug')
      .mockResolvedValueOnce(catalogDetailFixture.data);

    const jsx = await CourseDetailPage({
      params: Promise.resolve({ slug: 'reliable-software' }),
      searchParams: Promise.resolve({ workspace: 'acme-academy' }),
    });

    render(jsx, { wrapper: createWrapper() });

    expect(findSpy).toHaveBeenCalledWith('reliable-software', 'acme-academy');
    expect(
      screen.getByRole('heading', { name: 'Reliable software', level: 1 }),
    ).toBeInTheDocument();
  });
});
