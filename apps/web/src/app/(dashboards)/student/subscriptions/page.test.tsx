import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentSubscriptionsPage from './page';
import * as commerceApi from '@/features/commerce/api';
import { mockSubscription } from '@/features/commerce/testing/fixtures';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('StudentSubscriptionsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders student active subscriptions with billing portal and cancel actions', async () => {
    vi.spyOn(commerceApi, 'getMySubscriptions').mockResolvedValueOnce({
      data: [mockSubscription],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    renderWithClient(<StudentSubscriptionsPage />);

    expect(screen.getByRole('heading', { name: /My Subscriptions/i })).toBeInTheDocument();

    expect(await screen.findByText(/Subscription #10000000/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stripe Billing Portal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel at Period End/i })).toBeInTheDocument();
  });

  it('renders empty state when learner has no subscriptions', async () => {
    vi.spyOn(commerceApi, 'getMySubscriptions').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    renderWithClient(<StudentSubscriptionsPage />);

    expect(await screen.findByText(/No active subscriptions/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Browse Available Plans/i })).toBeInTheDocument();
  });
});
