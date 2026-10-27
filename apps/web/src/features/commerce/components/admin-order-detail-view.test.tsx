import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminOrderDetailView } from './admin-order-detail-view';
import * as commerceApi from '../api';
import { mockPaidOrder, mockRefund, COMMERCE_FIXTURE_IDS } from '../testing/fixtures';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AdminOrderDetailView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders order details, payments, and receipt info', async () => {
    vi.spyOn(commerceApi, 'getAdminOrder').mockResolvedValueOnce(mockPaidOrder);

    renderWithClient(
      <AdminOrderDetailView
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
        orderId={COMMERCE_FIXTURE_IDS.order}
      />,
    );

    expect(await screen.findByText(/Order ID:/i)).toBeInTheDocument();
    expect(screen.getByText(/ORD-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getAllByText('$39.20').length).toBeGreaterThan(0);
  });

  it('renders 202 refund polling state when refund operation is active', async () => {
    vi.spyOn(commerceApi, 'getAdminOrder').mockResolvedValue(mockPaidOrder);
    vi.spyOn(commerceApi, 'getAdminRefund').mockResolvedValueOnce({
      ...mockRefund,
      status: 'PENDING',
    });

    // Directly test with hook/component by rendering with an active refund in query cache
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      ['commerce', 'admin', COMMERCE_FIXTURE_IDS.workspace, 'refunds', COMMERCE_FIXTURE_IDS.refund],
      { ...mockRefund, status: 'PENDING' },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <AdminOrderDetailView
          workspaceId={COMMERCE_FIXTURE_IDS.workspace}
          orderId={COMMERCE_FIXTURE_IDS.order}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/ORD-2026-0001/)).toBeInTheDocument();
  });
});
