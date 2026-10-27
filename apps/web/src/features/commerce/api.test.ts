import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import {
  getCheckoutQuote,
  createCheckoutSession,
  getMyOrders,
  getMyOrder,
  cancelOrder,
  getMySubscriptions,
  getMySubscription,
  cancelMySubscription,
  resumeMySubscription,
  createBillingPortalSession,
  createAdminProduct,
  updateAdminProduct,
  createAdminPrice,
  createAdminCoupon,
  deleteAdminCoupon,
  createPaymentRefund,
  getAdminRefund,
} from './api';
import {
  mockPaidOrder,
  mockPendingOrder,
  mockSubscription,
  mockProduct,
  mockPrice,
  mockCoupon,
  mockRefund,
  mockCheckoutQuote,
  mockCheckoutSession,
  mockFreeCheckoutSession,
  COMMERCE_FIXTURE_IDS,
} from './testing/fixtures';

describe('commerce API client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Checkout & Quotes', () => {
    it('fetches server-priced checkout quote successfully', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCheckoutQuote });

      const quote = await getCheckoutQuote(COMMERCE_FIXTURE_IDS.workspace, {
        items: [{ priceId: COMMERCE_FIXTURE_IDS.price }],
        couponCode: 'SAVE20',
      });

      expect(quote.grandTotal).toBe(3920);
      expect(quote.discountTotal).toBe(980);
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${COMMERCE_FIXTURE_IDS.workspace}/checkout/quote`,
        expect.objectContaining({ couponCode: 'SAVE20' }),
      );
    });

    it('creates checkout session with idempotency key header', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCheckoutSession });

      const session = await createCheckoutSession(
        COMMERCE_FIXTURE_IDS.workspace,
        {
          items: [{ priceId: COMMERCE_FIXTURE_IDS.price }],
          successPath: '/checkout/success',
          cancelPath: '/checkout',
        },
        'idemp-test-key-123',
      );

      expect(session.orderId).toBe(COMMERCE_FIXTURE_IDS.order);
      expect(session.checkoutUrl).toBe('https://checkout.stripe.test/c/pay/cs_test_sample');
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${COMMERCE_FIXTURE_IDS.workspace}/checkout/sessions`,
        expect.any(Object),
        { headers: { 'Idempotency-Key': 'idemp-test-key-123' } },
      );
    });

    it('handles zero-dollar free checkout session completion', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockFreeCheckoutSession });

      const session = await createCheckoutSession(COMMERCE_FIXTURE_IDS.workspace, {
        items: [{ priceId: COMMERCE_FIXTURE_IDS.price }],
        successPath: '/checkout/success',
        cancelPath: '/checkout',
      });

      expect(session.orderId).toBe(COMMERCE_FIXTURE_IDS.order);
      expect(session.checkoutUrl).toBeNull();
      expect(session.expiresAt).toBeNull();
    });
  });

  describe('Student Orders', () => {
    it('fetches learner orders with cursor pagination and status filter', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [mockPaidOrder],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      const res = await getMyOrders({ status: 'PAID' });
      expect(res.data).toHaveLength(1);
      expect(res.data[0]?.number).toBe('ORD-2026-0001');
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('/me/orders?status=PAID'));
    });

    it('fetches single order by id', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockPaidOrder });

      const order = await getMyOrder(COMMERCE_FIXTURE_IDS.order);
      expect(order.id).toBe(COMMERCE_FIXTURE_IDS.order);
      expect(order.fulfillmentStatus).toBe('FULFILLED');
    });

    it('cancels pending order with idempotency key', async () => {
      const canceled = { ...mockPendingOrder, status: 'CANCELED' as const };
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: canceled });

      const res = await cancelOrder(
        COMMERCE_FIXTURE_IDS.workspace,
        COMMERCE_FIXTURE_IDS.order,
        'cancel-key-1',
      );

      expect(res.status).toBe('CANCELED');
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${COMMERCE_FIXTURE_IDS.workspace}/orders/${COMMERCE_FIXTURE_IDS.order}/cancel`,
        {},
        { headers: { 'Idempotency-Key': 'cancel-key-1' } },
      );
    });
  });

  describe('Student Subscriptions', () => {
    it('fetches student subscriptions', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [mockSubscription],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      });

      const res = await getMySubscriptions();
      expect(res.data).toHaveLength(1);
      expect(res.data[0]?.status).toBe('ACTIVE');
    });

    it('fetches subscription by id', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockSubscription });

      const sub = await getMySubscription(COMMERCE_FIXTURE_IDS.subscription);
      expect(sub.id).toBe(COMMERCE_FIXTURE_IDS.subscription);
    });

    it('cancels subscription at period end', async () => {
      const scheduled = { ...mockSubscription, cancelAtPeriodEnd: true };
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: scheduled });

      const res = await cancelMySubscription(COMMERCE_FIXTURE_IDS.subscription, 'sub-cancel-key');
      expect(res.cancelAtPeriodEnd).toBe(true);
      expect(api.post).toHaveBeenCalledWith(
        `/me/subscriptions/${COMMERCE_FIXTURE_IDS.subscription}/cancel`,
        {},
        { headers: { 'Idempotency-Key': 'sub-cancel-key' } },
      );
    });

    it('resumes subscription scheduled for cancellation', async () => {
      const resumed = { ...mockSubscription, cancelAtPeriodEnd: false };
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: resumed });

      const res = await resumeMySubscription(COMMERCE_FIXTURE_IDS.subscription, 'resume-key-1');
      expect(res.cancelAtPeriodEnd).toBe(false);
      expect(api.post).toHaveBeenCalledWith(
        `/me/subscriptions/${COMMERCE_FIXTURE_IDS.subscription}/resume`,
        {},
        { headers: { 'Idempotency-Key': 'resume-key-1' } },
      );
    });

    it('creates stripe customer billing portal session', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: { url: 'https://billing.stripe.test/session/sample' },
      });

      const res = await createBillingPortalSession(COMMERCE_FIXTURE_IDS.workspace, {
        returnPath: '/student/subscriptions',
      });

      expect(res.url).toBe('https://billing.stripe.test/session/sample');
    });
  });

  describe('Admin Commerce Operations', () => {
    it('creates product and updates product with If-Match precondition', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockProduct });

      const created = await createAdminProduct(COMMERCE_FIXTURE_IDS.workspace, {
        type: 'COURSE',
        slug: 'deep-learning-mastery',
        name: 'Deep Learning Mastery',
        description: { type: 'doc', content: [] },
        accessDurationDays: 365,
        courseIds: [COMMERCE_FIXTURE_IDS.course],
      });
      expect(created.id).toBe(COMMERCE_FIXTURE_IDS.product);

      vi.spyOn(api, 'patch').mockResolvedValueOnce({
        data: { ...mockProduct, status: 'ACTIVE' },
      });
      const updated = await updateAdminProduct(
        COMMERCE_FIXTURE_IDS.workspace,
        COMMERCE_FIXTURE_IDS.product,
        { status: 'ACTIVE' },
        mockProduct.updatedAt,
      );
      expect(updated.status).toBe('ACTIVE');
      expect(api.patch).toHaveBeenCalledWith(
        `/workspaces/${COMMERCE_FIXTURE_IDS.workspace}/products/${COMMERCE_FIXTURE_IDS.product}`,
        { status: 'ACTIVE' },
        { headers: { 'If-Match': `"${new Date(mockProduct.updatedAt).getTime()}"` } },
      );
    });

    it('creates price for product', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockPrice });

      const price = await createAdminPrice(
        COMMERCE_FIXTURE_IDS.workspace,
        COMMERCE_FIXTURE_IDS.product,
        {
          currency: 'usd',
          amount: 4900,
          interval: null,
          intervalCount: 1,
          trialDays: 0,
          isActive: true,
        },
      );
      expect(price.amount).toBe(4900);
    });

    it('creates and manages promotional coupons with If-Match header on delete', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCoupon });

      const coupon = await createAdminCoupon(COMMERCE_FIXTURE_IDS.workspace, {
        kind: 'PERCENT',
        code: 'SAVE20',
        percentOff: '20.00',
        validFrom: '2026-10-01T00:00:00.000Z',
        validUntil: null,
        maxRedemptions: 100,
        maxPerUser: 1,
        minimumOrderAmount: 0,
        isActive: true,
      });
      expect(coupon.rules.code).toBe('SAVE20');

      vi.spyOn(api, 'delete').mockResolvedValueOnce(undefined);
      await expect(
        deleteAdminCoupon(
          COMMERCE_FIXTURE_IDS.workspace,
          COMMERCE_FIXTURE_IDS.coupon,
          mockCoupon.updatedAt,
        ),
      ).resolves.toBeUndefined();
      expect(api.delete).toHaveBeenCalledWith(
        `/workspaces/${COMMERCE_FIXTURE_IDS.workspace}/coupons/${COMMERCE_FIXTURE_IDS.coupon}`,
        { headers: { 'If-Match': `"${new Date(mockCoupon.updatedAt).getTime()}"` } },
      );
    });

    it('issues refund with item allocations and access revocation', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          operationId: '10000000-0000-4000-8000-000000000099',
          status: 'PENDING',
        },
      });

      const res = await createPaymentRefund(
        COMMERCE_FIXTURE_IDS.workspace,
        COMMERCE_FIXTURE_IDS.payment,
        {
          amount: 3920,
          reason: 'Student dissatisfied',
          revokeAccess: true,
          items: [
            {
              orderItemId: COMMERCE_FIXTURE_IDS.orderItem,
              amount: 3920,
              revokeAccess: true,
            },
          ],
        },
        'ref-key-99',
      );

      expect(res.status).toBe('PENDING');
      expect(res.operationId).toBe('10000000-0000-4000-8000-000000000099');
    });

    it('polls admin refund details', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockRefund });

      const refund = await getAdminRefund(
        COMMERCE_FIXTURE_IDS.workspace,
        COMMERCE_FIXTURE_IDS.refund,
      );
      expect(refund.status).toBe('SUCCEEDED');
      expect(refund.amount).toBe(3920);
    });
  });
});
