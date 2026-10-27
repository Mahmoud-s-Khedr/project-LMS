import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderReceiptCard } from './order-receipt-card';
import {
  mockPaidOrder,
  mockFulfillmentPendingOrder,
  mockRefundedOrder,
  mockPendingOrder,
} from '../testing/fixtures';

describe('OrderReceiptCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders order number, items, and breakdown', () => {
    render(<OrderReceiptCard order={mockPaidOrder} />);

    expect(screen.getByText('Order #ORD-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Deep Learning Mastery')).toBeInTheDocument();
    expect(screen.getAllByText('$39.20').length).toBeGreaterThan(0);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Access Granted')).toBeInTheDocument();
  });

  it('displays awaiting fulfillment progress state when fulfillment is pending', () => {
    render(<OrderReceiptCard order={mockFulfillmentPendingOrder} />);

    expect(screen.getByText(/Payment received — setting up your access/i)).toBeInTheDocument();
    expect(screen.getByText(/Provisioning Access/i)).toBeInTheDocument();
  });

  it('displays awaiting payment banner when order status is pending', () => {
    render(<OrderReceiptCard order={mockPendingOrder} />);

    expect(screen.getByText(/Awaiting payment confirmation/i)).toBeInTheDocument();
    expect(screen.getByText(/Payment Pending/i)).toBeInTheDocument();
  });

  it('displays refund details when order has refunds', () => {
    render(<OrderReceiptCard order={mockRefundedOrder} />);

    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('Access Revoked')).toBeInTheDocument();
    expect(screen.getByText(/Refunds Issued:/i)).toBeInTheDocument();
    expect(screen.getByText(/-\$39\.20/)).toBeInTheDocument();
  });

  it('triggers window.print when print button is clicked', () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    render(<OrderReceiptCard order={mockPaidOrder} />);

    const printBtn = screen.getByRole('button', { name: /Print receipt/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
  });
});
