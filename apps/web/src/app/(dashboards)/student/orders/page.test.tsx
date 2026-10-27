import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentOrdersPage from './page';
import * as commerceApi from '@/features/commerce/api';
import { mockPaidOrder, mockPendingOrder } from '@/features/commerce/testing/fixtures';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('StudentOrdersPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders student orders list with receipts and statuses', async () => {
    vi.spyOn(commerceApi, 'getMyOrders').mockResolvedValueOnce({
      data: [mockPaidOrder, mockPendingOrder],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    renderWithClient(<StudentOrdersPage />);

    expect(screen.getByRole('heading', { name: /Order History & Receipts/i })).toBeInTheDocument();

    expect(await screen.findByText('#ORD-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('#ORD-2026-0002')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Payment Pending')).toBeInTheDocument();
  });

  it('renders empty state when learner has no past orders', async () => {
    vi.spyOn(commerceApi, 'getMyOrders').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    renderWithClient(<StudentOrdersPage />);

    expect(await screen.findByText(/No orders found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore Catalog/i })).toBeInTheDocument();
  });
});
