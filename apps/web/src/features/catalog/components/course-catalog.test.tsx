import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogFixture } from '@lms/shared';
import * as apiModule from '../api';
import { CourseCatalog } from './course-catalog';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('CourseCatalog component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders courses from API and displays active controls', async () => {
    vi.spyOn(apiModule, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: catalogFixture.data,
      meta: { nextCursor: null, hasMore: false, limit: 12 },
    });

    render(<CourseCatalog />, { wrapper: createWrapper() });

    expect(
      screen.getByPlaceholderText(/search courses, topics/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Reliable software')).toBeInTheDocument();
    });
  });

  it('filters by search and allows clearing search input', async () => {
    const fetchSpy = vi.spyOn(apiModule, 'fetchCatalogCourses').mockResolvedValue({
      data: catalogFixture.data,
      meta: { nextCursor: null, hasMore: false, limit: 12 },
    });

    render(<CourseCatalog initialFilters={{ search: 'distributed' }} />, {
      wrapper: createWrapper(),
    });

    const searchInput = screen.getByLabelText(/search catalog courses/i);
    expect(searchInput).toHaveValue('distributed');

    const clearBtn = screen.getByLabelText(/clear search/i);
    fireEvent.click(clearBtn);

    expect(searchInput).toHaveValue('');
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('renders empty state when no courses are returned', async () => {
    vi.spyOn(apiModule, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 12 },
    });

    render(<CourseCatalog initialFilters={{ search: 'nonexistent-topic' }} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByText('No courses found')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /reset all filters/i }),
      ).toBeInTheDocument();
    });
  });

  it('renders error state and retries query when retry clicked', async () => {
    const fetchSpy = vi
      .spyOn(apiModule, 'fetchCatalogCourses')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: catalogFixture.data,
        meta: { nextCursor: null, hasMore: false, limit: 12 },
      });

    render(<CourseCatalog />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/failed to load courses/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
