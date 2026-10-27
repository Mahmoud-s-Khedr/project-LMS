import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogFixture } from '@lms/shared';
import * as catalogApi from '@/features/catalog/api';
import { createSiteConfig } from '../site-config';
import { LandingPage } from './landing-page';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('LandingPage component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders hero, value props, illustrative preview, and cleanly omits empty stats and testimonials by default', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: catalogFixture.data,
      meta: { nextCursor: null, hasMore: false, limit: 4 },
    });
    vi.spyOn(catalogApi, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 3 },
    });

    render(<LandingPage />, { wrapper: createWrapper() });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /depth for learners/i,
    );
    // Unverified/fabricated claims are cleanly omitted
    expect(screen.queryByText('Cohort Completion')).not.toBeInTheDocument();
    expect(screen.queryByText('24k+')).not.toBeInTheDocument();
    expect(screen.queryByText('4.92')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /trusted by creators/i })).not.toBeInTheDocument();

    // Illustrative preview is rendered without numeric claims
    expect(
      screen.getByLabelText(/preview of the LMS learning and cohort workspace/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Reliable software')).toBeInTheDocument();
    });
  });

  it('renders stats and testimonials sections when configured with entries', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 4 },
    });
    vi.spyOn(catalogApi, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 3 },
    });

    const customConfig = createSiteConfig({
      name: 'Custom LMS',
      stats: [
        { label: 'Published Courses', value: '12' },
        { label: 'Active Academies', value: '3' },
      ],
      testimonials: [
        {
          id: 'test-1',
          quote: 'Seamless cohort operations and assignments.',
          authorName: 'Jordan Lee',
          authorTitle: 'Studio Director',
          organization: 'Apex Lab',
          rating: 5,
          initials: 'JL',
        },
      ],
    });

    render(<LandingPage config={customConfig} />, { wrapper: createWrapper() });

    expect(screen.getByText('Published Courses')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Active Academies')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    expect(screen.getByText(/seamless cohort operations and assignments/i)).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText(/studio director · apex lab/i)).toBeInTheDocument();
  });

  it('gracefully renders an empty state when no courses are published yet in the database', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 4 },
    });
    vi.spyOn(catalogApi, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 3 },
    });

    render(<LandingPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByText('Upcoming Studio Courses in Preparation'),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /become an instructor/i })).toBeInTheDocument();
    });
  });

  it('toggles billing frequency between annual and monthly pricing', () => {
    vi.spyOn(catalogApi, 'fetchCatalogCourses').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 4 },
    });
    vi.spyOn(catalogApi, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 3 },
    });

    render(<LandingPage />, { wrapper: createWrapper() });

    const monthlyBtn = screen.getByRole('button', { name: /monthly billing/i });
    fireEvent.click(monthlyBtn);

    expect(monthlyBtn).toHaveAttribute('aria-pressed', 'true');
  });
});
