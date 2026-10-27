import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckoutPage, { generateMetadata } from './page';
import * as catalogApi from '@/features/catalog/api';
import * as authHooks from '@/features/auth/hooks';
import type { PublicProduct } from '@/features/catalog';
import { COMMERCE_FIXTURE_IDS } from '@/features/commerce/testing/fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: vi.fn(),
}));

vi.mock('@/features/auth/hooks', () => ({
  useMeQuery: vi.fn(),
}));

const mockProduct: PublicProduct = {
  id: COMMERCE_FIXTURE_IDS.product,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  type: 'COURSE',
  status: 'ACTIVE',
  slug: 'deep-learning-mastery',
  name: 'Deep Learning Mastery',
  description: { type: 'doc', content: [] },
  accessDurationDays: 365,
  courses: [],
  prices: [
    {
      id: COMMERCE_FIXTURE_IDS.price,
      workspaceId: COMMERCE_FIXTURE_IDS.workspace,
      productId: COMMERCE_FIXTURE_IDS.product,
      currency: 'usd',
      amount: 4900,
      interval: null,
      intervalCount: 1,
      trialDays: 0,
      isActive: true,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authHooks, 'useMeQuery').mockReturnValue({
      data: {
        id: COMMERCE_FIXTURE_IDS.user,
        email: 'student@example.com',
        fullName: 'Student',
        emailVerified: true,
        role: 'USER',
        status: 'ACTIVE',
      },
      isLoading: false,
    } as unknown as ReturnType<typeof authHooks.useMeQuery>);
  });

  it('renders checkout view when productId is provided and product exists', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockResolvedValueOnce(mockProduct);

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ productId: COMMERCE_FIXTURE_IDS.product }),
    });

    renderWithClient(jsx);

    expect(screen.getByRole('heading', { name: 'Checkout', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('Deep Learning Mastery').length).toBeGreaterThan(0);
  });

  it('renders "No Product Selected" card when productId is omitted', async () => {
    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({}),
    });

    renderWithClient(jsx);

    expect(screen.getByText(/No Product Selected/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse Catalog/i })).toBeInTheDocument();
  });

  it('renders error state when product fetch throws', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockRejectedValueOnce(
      new Error('Product not found'),
    );

    const jsx = await CheckoutPage({
      searchParams: Promise.resolve({ productId: 'invalid-id' }),
    });

    renderWithClient(jsx);

    expect(screen.getByText(/Product Not Found/i)).toBeInTheDocument();
  });

  it('generates SEO metadata', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockResolvedValueOnce(mockProduct);

    const meta = await generateMetadata({
      searchParams: Promise.resolve({ productId: COMMERCE_FIXTURE_IDS.product }),
    });

    expect(meta.title).toContain('Enroll in Deep Learning Mastery');
  });
});
