import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { catalogFixture } from '@lms/shared';
import { CheckoutView } from './checkout-view';
import * as commerceApi from '../api';
import * as authHooks from '@/features/auth/hooks';
import type { PublicProduct } from '@/features/catalog';
import {
  mockCheckoutQuote,
  mockCheckoutSession,
  mockFreeCheckoutSession,
  COMMERCE_FIXTURE_IDS,
} from '../testing/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockPublicProduct: PublicProduct = {
  id: COMMERCE_FIXTURE_IDS.product,
  workspaceId: COMMERCE_FIXTURE_IDS.workspace,
  type: 'COURSE',
  status: 'ACTIVE',
  slug: 'deep-learning-mastery',
  name: 'Deep Learning Mastery',
  description: { type: 'doc', content: [] },
  accessDurationDays: 365,
  courses: [catalogFixture.data[0]!],
  prices: [
    {
      id: COMMERCE_FIXTURE_IDS.price,
      workspaceId: COMMERCE_FIXTURE_IDS.workspace,
      productId: COMMERCE_FIXTURE_IDS.product,
      currency: 'usd',
      amount: 4900,
      interval: null,
      intervalCount: 1,
      trialDays: 0,
      isActive: true,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('CheckoutView', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    vi.spyOn(authHooks, 'useMeQuery').mockReturnValue({
      data: {
        id: COMMERCE_FIXTURE_IDS.user,
        email: 'student@example.com',
        fullName: 'Test Student',
        emailVerifiedAt: '2026-10-01T00:00:00.000Z',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      isLoading: false,
    } as unknown as ReturnType<typeof authHooks.useMeQuery>);

    // Default mock quote
    vi.spyOn(commerceApi, 'getCheckoutQuote').mockResolvedValue(mockCheckoutQuote);
  });

  it('renders checkout product details and server calculated quote', async () => {
    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Checkout', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('Deep Learning Mastery').length).toBeGreaterThan(0);

    // Check quote totals rendered
    expect(await screen.findByText('$39.20')).toBeInTheDocument(); // total
    expect(screen.getByText('-$9.80')).toBeInTheDocument(); // discount
    expect(screen.getByText('$49.00')).toBeInTheDocument(); // subtotal
  });

  it('handles coupon code application and recalculation', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    // Wait for initial quote load
    await screen.findByText('$39.20');

    const couponInput = screen.getByPlaceholderText(/e\.g\. SAVE20/i);
    await user.type(couponInput, 'SAVE20');

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    await waitFor(() => expect(applyButton).not.toBeDisabled());
    await user.click(applyButton);

    await waitFor(() => {
      expect(commerceApi.getCheckoutQuote).toHaveBeenCalledWith(
        COMMERCE_FIXTURE_IDS.workspace,
        expect.objectContaining({ couponCode: 'SAVE20' }),
      );
    });
  });

  it('handles coupon rejection with clear user error', async () => {
    // First quote succeeds, second with coupon fails
    vi.spyOn(commerceApi, 'getCheckoutQuote')
      .mockResolvedValueOnce(mockCheckoutQuote)
      .mockRejectedValueOnce(new Error('Coupon has expired or does not apply to this product'));

    const user = userEvent.setup();
    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    await screen.findByText('$39.20');

    const couponInput = screen.getByPlaceholderText(/e\.g\. SAVE20/i);
    await user.type(couponInput, 'EXPIRED');

    const applyButton = screen.getByRole('button', { name: 'Apply' });
    await waitFor(() => expect(applyButton).not.toBeDisabled());
    await user.click(applyButton);

    expect(
      await screen.findByText(/Coupon has expired or does not apply to this product/i),
    ).toBeInTheDocument();
  });

  it('redirects to Stripe Hosted Checkout on paid session creation', async () => {
    const sessionSpy = vi
      .spyOn(commerceApi, 'createCheckoutSession')
      .mockResolvedValueOnce(mockCheckoutSession);

    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });

    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    await screen.findByText('$39.20');

    const submitBtn = screen.getByRole('button', { name: /Proceed to Stripe Checkout/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalledWith(
        COMMERCE_FIXTURE_IDS.workspace,
        expect.objectContaining({
          items: [{ priceId: COMMERCE_FIXTURE_IDS.price, cohorts: undefined }],
        }),
        expect.stringMatching(/^chk-/),
      );
      expect(window.location.href).toBe('https://checkout.stripe.test/c/pay/cs_test_sample');
    });
  });

  it('completes free zero-dollar checkout immediately without Stripe redirect', async () => {
    vi.spyOn(commerceApi, 'getCheckoutQuote').mockResolvedValue({
      ...mockCheckoutQuote,
      subtotal: 4900,
      discountTotal: 4900,
      grandTotal: 0,
      items: [
        {
          ...mockCheckoutQuote.items[0]!,
          discountAmount: 4900,
          totalAmount: 0,
        },
      ],
    });

    const sessionSpy = vi
      .spyOn(commerceApi, 'createCheckoutSession')
      .mockResolvedValueOnce(mockFreeCheckoutSession);

    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    const submitBtn = await screen.findByRole('button', { name: /Complete Free Enrollment/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(sessionSpy).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(
        `/checkout/success?orderId=${COMMERCE_FIXTURE_IDS.order}`,
      );
    });
  });

  it('warns when email is unverified and blocks checkout', () => {
    vi.spyOn(authHooks, 'useMeQuery').mockReturnValue({
      data: {
        id: COMMERCE_FIXTURE_IDS.user,
        email: 'unverified@example.com',
        fullName: 'Unverified User',
        emailVerifiedAt: null,
        role: 'USER',
        status: 'ACTIVE',
      },
      isLoading: false,
    } as unknown as ReturnType<typeof authHooks.useMeQuery>);

    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    expect(screen.getByText(/Email verification required/i)).toBeInTheDocument();
    const submitBtn = screen.getByRole('button', { name: /Proceed to Stripe Checkout/i });
    expect(submitBtn).toBeDisabled();
  });

  it('displays friendly payments unavailable message when backend returns 503 for paid checkout', async () => {
    const error503 = Object.assign(new Error('Payments disabled'), { status: 503 });
    vi.spyOn(commerceApi, 'createCheckoutSession').mockRejectedValueOnce(error503);

    renderWithClient(
      <CheckoutView
        product={mockPublicProduct}
        initialPriceId={COMMERCE_FIXTURE_IDS.price}
        workspaceId={COMMERCE_FIXTURE_IDS.workspace}
      />,
    );

    const submitBtn = await screen.findByRole('button', { name: /Proceed to Stripe Checkout/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Online card payments are currently unavailable for this academy/i),
    ).toBeInTheDocument();
  });
});
