import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Stripe = require('../../apps/api/node_modules/stripe');

export interface StripeWebhookFixtureOptions {
  eventId?: string;
  type: string;
  data: Record<string, unknown>;
  created?: number;
}

export function createStripeWebhookEvent({
  eventId = `evt_test_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
  type,
  data,
  created = Math.floor(Date.now() / 1000),
}: StripeWebhookFixtureOptions): {
  rawBody: string;
  eventId: string;
  event: Record<string, unknown>;
} {
  const event = {
    id: eventId,
    object: 'event',
    livemode: false,
    api_version: '2026-09-30.endive',
    created,
    type,
    data: {
      object: data,
    },
  };

  return {
    rawBody: JSON.stringify(event),
    eventId,
    event,
  };
}

/**
 * Computes a valid Stripe signature header value: t=<timestamp>,v1=<signature>
 */
export function computeStripeSignature(
  rawBody: string,
  secret: string = 'whsec_test_secret_for_qa_testing_only_12345',
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  return new Stripe('sk_test_local_fixture').webhooks.generateTestHeaderString({
    payload: rawBody,
    secret,
    timestamp,
  });
}

/**
 * Pre-built test fixtures for standard Stripe lifecycle events
 */
export const stripeFixtures = {
  checkoutSessionCompleted: (options: {
    sessionId?: string;
    orderId: string;
    workspaceId: string;
    userId: string;
    amountTotal?: number;
    currency?: string;
  }) =>
    createStripeWebhookEvent({
      type: 'checkout.session.completed',
      data: {
        id: options.sessionId ?? `cs_test_${randomUUID()}`,
        object: 'checkout.session',
        client_reference_id: options.orderId,
        metadata: {
          orderId: options.orderId,
          workspaceId: options.workspaceId,
          userId: options.userId,
        },
        payment_status: 'paid',
        amount_total: options.amountTotal ?? 9900,
        currency: (options.currency ?? 'usd').toLowerCase(),
        payment_intent: `pi_test_${randomUUID()}`,
      },
    }),

  paymentIntentSucceeded: (options: {
    paymentIntentId?: string;
    orderId: string;
    amount?: number;
    currency?: string;
  }) =>
    createStripeWebhookEvent({
      type: 'payment_intent.succeeded',
      data: {
        id: options.paymentIntentId ?? `pi_test_${randomUUID()}`,
        object: 'payment_intent',
        amount: options.amount ?? 9900,
        currency: (options.currency ?? 'usd').toLowerCase(),
        status: 'succeeded',
        metadata: {
          orderId: options.orderId,
        },
      },
    }),

  chargeRefunded: (options: {
    refundId?: string;
    paymentIntentId: string;
    amount?: number;
    currency?: string;
  }) =>
    createStripeWebhookEvent({
      type: 'charge.refunded',
      data: {
        id: `ch_test_${randomUUID()}`,
        object: 'charge',
        payment_intent: options.paymentIntentId,
        amount_refunded: options.amount ?? 9900,
        refunds: {
          data: [
            {
              id: options.refundId ?? `re_test_${randomUUID()}`,
              amount: options.amount ?? 9900,
              currency: (options.currency ?? 'usd').toLowerCase(),
              status: 'succeeded',
            },
          ],
        },
      },
    }),

  customerSubscriptionDeleted: (options: { subscriptionId: string; customerId: string }) =>
    createStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: {
        id: options.subscriptionId,
        object: 'subscription',
        customer: options.customerId,
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000),
      },
    }),
};
