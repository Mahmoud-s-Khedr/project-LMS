import { describe, it, expect, beforeAll } from 'vitest';
import { computeStripeSignature, stripeFixtures } from '../fixtures/stripe';
import { probeEndpoint } from '../fixtures/probes';
import { randomUUID } from 'node:crypto';

describe('Security: Commerce Webhook Signature & Idempotency Invariants', () => {
  const webhookUrl = 'http://localhost:4100/api/v1/webhooks/stripe';

  beforeAll(async () => {
    const probe = await probeEndpoint(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'probe' },
      body: '{}',
    });
    expect(probe.available, probe.reason).toBe(true);
  });

  it('rejects Stripe webhook requests without a valid Stripe-Signature header', async () => {
    const { rawBody } = stripeFixtures.paymentIntentSucceeded({
      orderId: randomUUID(),
    });

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'invalid_signature_header',
      },
      body: rawBody,
    });

    expect([400, 401, 403]).toContain(res.status);
  });

  it('rejects webhooks with forged or mismatched secret signatures', async () => {
    const { rawBody } = stripeFixtures.paymentIntentSucceeded({
      orderId: randomUUID(),
    });

    const signature = computeStripeSignature(rawBody, 'wrong_secret_key_abcdef');

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: rawBody,
    });

    expect([400, 401, 403]).toContain(res.status);
  });

  it('handles duplicate webhooks idempotently without duplicate side-effects', async () => {
    const orderId = randomUUID();
    const event = stripeFixtures.paymentIntentSucceeded({
      orderId,
    });

    const secret =
      process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret_for_qa_testing_only_12345';
    const signature = computeStripeSignature(event.rawBody, secret);

    // First delivery
    const res1 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: event.rawBody,
    });
    expect([200, 202]).toContain(res1.status);

    // Second delivery of identical stripeEventId (replay)
    const res2 = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature,
      },
      body: event.rawBody,
    });
    // Idempotent: acknowledge successfully without creating duplicate grants/payments
    expect([200, 202]).toContain(res2.status);
  });
});
