import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCommercePage from './page';
import * as commerceApi from '@/features/commerce/api';
import * as workspaceHooks from '@/features/workspaces/hooks';
import {
  mockProduct,
  mockCoupon,
  mockPaidOrder,
  COMMERCE_FIXTURE_IDS,
} from '@/features/commerce/testing/fixtures';

vi.mock('@/features/workspaces/hooks', () => ({
  useActiveWorkspace: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AdminCommercePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(workspaceHooks, 'useActiveWorkspace').mockReturnValue({
      activeWorkspaceId: COMMERCE_FIXTURE_IDS.workspace,
      activeWorkspace: {
        id: COMMERCE_FIXTURE_IDS.workspace,
        slug: 'test-academy',
        name: 'Test Academy',
      } as unknown as ReturnType<typeof workspaceHooks.useActiveWorkspace>['activeWorkspace'],
      setActiveWorkspaceId: vi.fn(),
      workspaces: [],
      isLoading: false,
      error: null,
    });

    vi.spyOn(commerceApi, 'getAdminProducts').mockResolvedValue({
      data: [mockProduct],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    vi.spyOn(commerceApi, 'getAdminCoupons').mockResolvedValue({
      data: [mockCoupon],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    vi.spyOn(commerceApi, 'getAdminOrders').mockResolvedValue({
      data: [mockPaidOrder],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });
  });

  it('renders commerce admin tabs: products, coupons, and orders', async () => {
    renderWithClient(<AdminCommercePage />);

    expect(screen.getByRole('heading', { name: /Commerce Administration/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Products & Pricing/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Coupons/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Orders & Accounting/i })).toBeInTheDocument();

    // Default tab is products
    expect(await screen.findByText('Deep Learning Mastery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New Product/i })).toBeInTheDocument();
  });

  it('navigates to coupons tab and displays coupons', async () => {
    const user = userEvent.setup();
    renderWithClient(<AdminCommercePage />);

    const couponsTab = screen.getByRole('tab', { name: /Coupons/i });
    await user.click(couponsTab);

    expect(await screen.findByText('SAVE20')).toBeInTheDocument();
    expect(await screen.findByText(/20.*off/i)).toBeInTheDocument();
  });

  it('navigates to orders tab and displays orders ledger', async () => {
    const user = userEvent.setup();
    renderWithClient(<AdminCommercePage />);

    const ordersTab = screen.getByRole('tab', { name: /Orders & Accounting/i });
    await user.click(ordersTab);

    expect(await screen.findByText('#ORD-2026-0001')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View Accounting/i })).toBeInTheDocument();
  });
});
