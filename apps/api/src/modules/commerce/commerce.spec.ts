import { allocate, canonical, hash, pageArgs } from './commerce.core';
import { StripePaymentProvider, loadStripe, STRIPE_API_VERSION } from './payment-provider';
import { CheckoutService } from './checkout.service';

describe('commerce exact arithmetic and trust boundaries', () => {
  it('allocates by largest remainder with stable tie breaking', () => {
    expect(allocate(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocate(7, [1, 2, 3])).toEqual([1, 2, 4]);
    expect(allocate(0, [0, 0])).toEqual([0, 0]);
    expect(allocate(2147483647, [2147483646, 1])).toEqual([2147483646, 1]);
  });
  it('reconciles allocations across deterministic generated baskets', () => {
    for (let i = 1; i < 500; i++) {
      const weights = [i * 3, i % 17, i * 19];
      const total = i * 11;
      const parts = allocate(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p, n) => p <= weights[n]!)).toBe(true);
    }
  });
  it('normalizes idempotency hashes independent of object key order', () => {
    expect(hash({ a: 1, b: [2, 3] })).toBe(hash({ b: [2, 3], a: 1 }));
    expect(canonical({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(hash([1, 2])).not.toBe(hash([2, 1]));
  });
  it('rejects malformed and foreign-scope cursors', () => {
    expect(() => pageArgs({ limit: 20, cursor: 'bad' }, {})).toThrow();
    const cursor = Buffer.from(
      JSON.stringify({
        revision: 1,
        sort: 'createdAt',
        id: '11111111-1111-4111-8111-111111111111',
        value: new Date().toISOString(),
        filterHash: hash({ w: 'one' }),
      }),
    ).toString('base64url');
    expect(() => pageArgs({ limit: 20, cursor }, { w: 'two' })).toThrow();
  });
  it('boots with disabled payments and rejects provider operations cleanly', async () => {
    const old = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    try {
      const p = new StripePaymentProvider();
      expect(p.enabled).toBe(false);
      await expect(p.call('customers', 'create', {})).rejects.toThrow('Payments disabled');
    } finally {
      if (old) process.env.STRIPE_SECRET_KEY = old;
    }
  });
  it('passes stable provider idempotency keys through the mocked Stripe SDK', async () => {
    const create = jest.fn().mockResolvedValue({ id: 're_mock', status: 'pending' });
    const p = Object.create(StripePaymentProvider.prototype) as StripePaymentProvider;
    Object.defineProperty(p, 'sdk', { value: { refunds: { create } } });
    Object.defineProperty(p, 'enabled', { value: true });
    await expect(
      p.call('refunds', 'create', { amount: 500, payment_intent: 'pi_mock' }, 'refund-local-id'),
    ).resolves.toMatchObject({ id: 're_mock' });
    expect(create).toHaveBeenCalledWith(
      { amount: 500, payment_intent: 'pi_mock' },
      { idempotencyKey: 'refund-local-id' },
    );
  });
  it('rejects redirect escape paths before contacting a provider', () => {
    const service = Object.create(CheckoutService.prototype) as CheckoutService;
    for (const path of [
      '//evil.com',
      '/checkout/../evil',
      '/checkout/%2f%2fevil',
      '/checkout\\evil',
      'https://evil.com',
    ])
      expect(() => service.url(path)).toThrow();
    expect(service.url('/student/orders')).toContain('/student/orders');
  });
});
const stripeTests = describe;
stripeTests('real Stripe SDK signed webhook fixtures', () => {
  it('verifies exact raw bytes, rejects tampering, old timestamp, live events and unpinned API versions', () => {
    const oldKey = process.env.STRIPE_SECRET_KEY,
      oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = 'sk_test_commerce_fixture';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_commerce_fixture';
    try {
      const p = new StripePaymentProvider();
      const sdk = loadStripe('sk_test_fixture');
      const event = {
        id: 'evt_fixture',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        api_version: STRIPE_API_VERSION,
        data: { object: { id: 'cs_fixture' } },
      };
      const sign = (value: unknown) => {
        const raw = JSON.stringify(value);
        return {
          raw: Buffer.from(raw),
          signature: sdk.webhooks.generateTestHeaderString({
            payload: raw,
            secret: process.env.STRIPE_WEBHOOK_SECRET!,
          }),
        };
      };
      const f = sign(event);
      expect(p.verify(f.raw, f.signature).id).toBe(event.id);
      expect(() => p.verify(Buffer.from(f.raw.toString() + ' '), f.signature)).toThrow();
      expect(() =>
        p.verify(
          f.raw,
          sdk.webhooks.generateTestHeaderString({
            payload: f.raw.toString(),
            secret: process.env.STRIPE_WEBHOOK_SECRET!,
            timestamp: 1,
          }),
        ),
      ).toThrow();
      for (const bad of [
        { ...event, livemode: true },
        { ...event, api_version: 'old' },
      ]) {
        const b = sign(bad);
        expect(() => p.verify(b.raw, b.signature)).toThrow();
      }
    } finally {
      if (oldKey) process.env.STRIPE_SECRET_KEY = oldKey;
      else delete process.env.STRIPE_SECRET_KEY;
      if (oldSecret) process.env.STRIPE_WEBHOOK_SECRET = oldSecret;
      else delete process.env.STRIPE_WEBHOOK_SECRET;
    }
  });
});
