import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import { catalogFixture, fixtureIds, fixtureDocument, fixtureTimestamp } from '@lms/shared';
import * as catalogApi from '@/features/catalog/api';
import ProductDetailPage, { generateMetadata } from './page';
import type { PublicProduct } from '@/features/catalog';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

describe('ProductDetailPage', () => {
  const mockProduct: PublicProduct = {
    id: fixtureIds.product,
    workspaceId: fixtureIds.workspace,
    type: 'BUNDLE',
    status: 'ACTIVE',
    slug: 'system-bundle',
    name: 'Full Stack Systems Bundle',
    description: fixtureDocument,
    accessDurationDays: 180,
    courses: catalogFixture.data,
    prices: [
      {
        id: fixtureIds.price,
        workspaceId: fixtureIds.workspace,
        productId: fixtureIds.product,
        currency: 'usd',
        amount: 7900,
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

  it('renders product detail when product is found', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockResolvedValueOnce(mockProduct);

    const jsx = await ProductDetailPage({
      params: Promise.resolve({ productId: fixtureIds.product }),
    });

    render(jsx);

    expect(
      screen.getByRole('heading', { name: 'Full Stack Systems Bundle', level: 1 }),
    ).toBeInTheDocument();
  });

  it('calls notFound() when product fetch throws', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockRejectedValueOnce(new Error('Not found'));

    await ProductDetailPage({
      params: Promise.resolve({ productId: 'invalid-id' }),
    });

    expect(notFound).toHaveBeenCalled();
  });

  it('generates dynamic SEO metadata', async () => {
    vi.spyOn(catalogApi, 'fetchCatalogProductDetail').mockResolvedValueOnce(mockProduct);

    const metadata = await generateMetadata({
      params: Promise.resolve({ productId: fixtureIds.product }),
    });

    expect(metadata.title).toBe('Full Stack Systems Bundle');
  });
});
