import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CheckoutSuccessPage from './page';
import * as commerceApi from '@/features/commerce/api';
import { mockPaidOrder, COMMERCE_FIXTURE_IDS } from '@/features/commerce/testing/fixtures';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CheckoutSuccessPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders confirmation view with order reference when orderId is provided', async () => {
    vi.spyOn(commerceApi, 'getMyOrder').mockResolvedValueOnce(mockPaidOrder);

    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ orderId: COMMERCE_FIXTURE_IDS.order }),
    });

    renderWithClient(jsx);

    expect(await screen.findByText('ORD-2026-0001')).toBeInTheDocument();
    expect(screen.getByText(/Go to Student Portal/i)).toBeInTheDocument();
    expect(screen.getByText(/View Full Receipt/i)).toBeInTheDocument();
  });

  it('renders fallback notice when orderId is omitted', async () => {
    const jsx = await CheckoutSuccessPage({
      searchParams: Promise.resolve({}),
    });

    renderWithClient(jsx);

    expect(screen.getByText(/Checkout Complete/i)).toBeInTheDocument();
  });
});
