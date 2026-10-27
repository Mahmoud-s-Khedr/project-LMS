import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogFixture, fixtureIds, fixtureDocument, fixtureTimestamp } from '@lms/shared';
import * as apiModule from '../api';
import { ProductCatalog } from './product-catalog';
import type { PublicProduct } from '../types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('ProductCatalog component', () => {
  const mockProduct: PublicProduct = {
    id: fixtureIds.product,
    workspaceId: fixtureIds.workspace,
    type: 'BUNDLE',
    status: 'ACTIVE',
    slug: 'backend-bundle',
    name: 'Backend Architecture Bundle',
    description: fixtureDocument,
    accessDurationDays: null,
    courses: catalogFixture.data,
    prices: [
      {
        id: fixtureIds.price,
        workspaceId: fixtureIds.workspace,
        productId: fixtureIds.product,
        currency: 'usd',
        amount: 8900,
        interval: null,
        intervalCount: 1,
        trialDays: 0,
        isActive: true,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders products and filters by product type', async () => {
    const fetchSpy = vi.spyOn(apiModule, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [mockProduct],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    render(<ProductCatalog />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('Backend Architecture Bundle')).toBeInTheDocument();
      expect(screen.getByText('$89')).toBeInTheDocument();
    });

    const bundleFilterBtn = screen.getByRole('button', { name: /course bundles/i });
    fireEvent.click(bundleFilterBtn);

    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'BUNDLE' }));
  });

  it('renders empty state when no products match', async () => {
    vi.spyOn(apiModule, 'fetchCatalogProducts').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    render(<ProductCatalog />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText('No products found')).toBeInTheDocument();
    });
  });
});
