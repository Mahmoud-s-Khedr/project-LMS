import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefundDialog } from './refund-dialog';
import * as commerceApi from '../api';
import { mockPaidOrder, COMMERCE_FIXTURE_IDS } from '../testing/fixtures';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('RefundDialog', () => {
  const mockPayment = mockPaidOrder.payments[0]!;
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(commerceApi, 'createPaymentRefund').mockResolvedValue({
      operationId: '10000000-0000-4000-8000-000000000088',
      status: 'PENDING',
    });
  });

  it('renders with prefilled full payment amount and required reason field', () => {
    renderWithClient(
      <RefundDialog
        order={mockPaidOrder}
        payment={mockPayment}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.getByRole('heading', { name: /Issue Payment Refund/i })).toBeInTheDocument();
    const amountInput = screen.getByLabelText(/Refund Amount/i) as HTMLInputElement;
    expect(amountInput.value).toBe('39.20');
  });

  it('validates that reason is required before submitting', async () => {
    renderWithClient(
      <RefundDialog
        order={mockPaidOrder}
        payment={mockPayment}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm Refund/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Please provide a reason for the refund/i)).toBeInTheDocument();
  });

  it('submits refund successfully with access revocation and item allocation', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <RefundDialog
        order={mockPaidOrder}
        payment={mockPayment}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    const reasonInput = screen.getByPlaceholderText(/Explain the reason/i);
    await user.type(reasonInput, 'Customer satisfied guarantee window request');

    const submitBtn = screen.getByRole('button', { name: /Confirm Refund/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(commerceApi.createPaymentRefund).toHaveBeenCalledWith(
        COMMERCE_FIXTURE_IDS.workspace,
        mockPayment!.id,
        expect.objectContaining({
          amount: 3920,
          reason: 'Customer satisfied guarantee window request',
          revokeAccess: true,
          items: [
            expect.objectContaining({
              orderItemId: mockPaidOrder.items[0]!.id,
              amount: 3920,
              revokeAccess: true,
            }),
          ],
        }),
        expect.stringMatching(/^ref-/),
      );
      expect(mockOnSuccess).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000088');
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('prevents refund amounts greater than original payment', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <RefundDialog
        order={mockPaidOrder}
        payment={mockPayment}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
        isOpen={true}
        onClose={mockOnClose}
        onSuccess={mockOnSuccess}
      />,
    );

    const amountInput = screen.getByLabelText(/Refund Amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, '100.00');

    const reasonInput = screen.getByPlaceholderText(/Explain the reason/i);
    await user.type(reasonInput, 'Attempted excessive refund');

    const submitBtn = screen.getByRole('button', { name: /Confirm Refund/i });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Refund amount cannot exceed payment total/i),
    ).toBeInTheDocument();
  });
});
