import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { catalogFixture, fixtureIds, fixtureDocument, fixtureTimestamp } from '@lms/shared';
import { ProductDetail } from './product-detail';
import type { PublicProduct } from '../types';

describe('ProductDetail component', () => {
  const mockProduct: PublicProduct = {
    id: fixtureIds.product,
    workspaceId: fixtureIds.workspace,
    type: 'BUNDLE',
    status: 'ACTIVE',
    slug: 'backend-mastery-bundle',
    name: 'Backend Systems Mastery Bundle',
    description: fixtureDocument,
    accessDurationDays: 365,
    courses: catalogFixture.data,
    prices: [
      {
        id: fixtureIds.price,
        workspaceId: fixtureIds.workspace,
        productId: fixtureIds.product,
        currency: 'usd',
        amount: 14900,
        interval: null,
        intervalCount: 1,
        trialDays: 0,
        isActive: true,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      },
      {
        id: '10000000-0000-4000-8000-000000000099',
        workspaceId: fixtureIds.workspace,
        productId: fixtureIds.product,
        currency: 'usd',
        amount: 1900,
        interval: 'MONTH',
        intervalCount: 1,
        trialDays: 7,
        isActive: true,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      },
    ],
  };

  it('renders bundle title, badge, duration, and included courses', () => {
    render(<ProductDetail product={mockProduct} />);

    expect(
      screen.getByRole('heading', { name: 'Backend Systems Mastery Bundle', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Course Bundle')).toBeInTheDocument();
    expect(screen.getByText('365 Days Access')).toBeInTheDocument();
    expect(screen.getByText('Reliable software')).toBeInTheDocument();
  });

  it('allows toggling between one-time and monthly pricing options', () => {
    render(<ProductDetail product={mockProduct} />);

    expect(screen.getAllByText('$149').length).toBeGreaterThanOrEqual(1);

    const monthlyBtn = screen.getByRole('button', { name: /monthly billing/i });
    fireEvent.click(monthlyBtn);

    expect(screen.getAllByText('$19 / month').length).toBeGreaterThanOrEqual(1);
  });
});
