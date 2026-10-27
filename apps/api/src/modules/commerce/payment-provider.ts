import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { createRequire } from 'node:module';
import { z } from 'zod';

export const PAYMENT_PROVIDER = Symbol('commerce.payment-provider');
export const STRIPE_API_VERSION = '2026-09-30.endive';
export const stripeObject = z.looseObject({ id: z.string() });
export const stripeEvent = z.object({
  id: z.string(),
  type: z.string(),
  created: z.number().int(),
  livemode: z.boolean(),
  api_version: z.string().nullable().optional(),
  data: z.object({ object: stripeObject }),
});
export type ProviderObject = z.infer<typeof stripeObject>;
export type ProviderEvent = z.infer<typeof stripeEvent>;
export interface PaymentProvider {
  readonly enabled: boolean;
  verify(raw: Buffer, signature: string): ProviderEvent;
  call(
    resource: string,
    action: string,
    params: Record<string, unknown>,
    key?: string,
    id?: string,
  ): Promise<ProviderObject>;
}
/** Narrow SDK boundary: Stripe objects are untrusted until validated by each reconciliation command. */
export interface StripeSdk {
  webhooks: {
    constructEvent(raw: Buffer, signature: string, secret: string): unknown;
    generateTestHeaderString(options: {
      payload: string;
      secret: string;
      timestamp?: number;
    }): string;
  };
  [resource: string]: unknown;
}
export function loadStripe(key: string): StripeSdk {
  const SDK = createRequire(__filename)(
    process.env.NODE_ENV === 'test' && process.env.COMMERCE_STRIPE_SDK_PATH
      ? process.env.COMMERCE_STRIPE_SDK_PATH
      : 'stripe',
  ) as new (key: string, options: Record<string, unknown>) => StripeSdk;
  return new SDK(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 10000 });
}
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly enabled: boolean;
  private readonly sdk: StripeSdk | null;
  constructor() {
    const key = process.env.STRIPE_SECRET_KEY;
    // This deployment deliberately supports test keys only.
    this.enabled = !!key?.startsWith('sk_test_') && !!process.env.STRIPE_WEBHOOK_SECRET;
    this.sdk = this.enabled ? loadStripe(key!) : null;
  }
  verify(raw: Buffer, signature: string): ProviderEvent {
    if (!this.sdk) throw new ServiceUnavailableException('Payments disabled');
    try {
      const event = stripeEvent.parse(
        this.sdk.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!),
      );
      if (event.livemode || event.api_version !== STRIPE_API_VERSION)
        throw new Error('Unsupported event');
      return event;
    } catch {
      throw new BadRequestException('Invalid Stripe signature or event version');
    }
  }
  async call(
    resource: string,
    action: string,
    params: Record<string, unknown>,
    key?: string,
    id?: string,
  ): Promise<ProviderObject> {
    if (!this.sdk) throw new ServiceUnavailableException('Payments disabled');
    const path = resource.split('.');
    let target: unknown = this.sdk;
    for (const part of path) target = (target as Record<string, unknown>)[part];
    const methods = target as Record<string, (...args: unknown[]) => Promise<unknown>>;
    const method = methods[action];
    if (!method) throw new Error('Invalid Stripe operation');
    const args: unknown[] = id ? [id, params] : [params];
    if (key) args.push({ idempotencyKey: key });
    let result: unknown;
    try {
      result = await method.apply(target, args);
    } catch (error: unknown) {
      const status = z.object({ statusCode: z.number() }).safeParse(error);
      if (status.success && status.data.statusCode >= 400 && status.data.statusCode < 500)
        throw new BadRequestException('Payment provider rejected operation');
      throw new ServiceUnavailableException('Payment provider unavailable');
    }
    return action === 'list'
      ? stripeObject.parse({ id: 'list', ...(result as Record<string, unknown>) })
      : stripeObject.parse(result);
  }
}
export const stripeId = (v: unknown): string | null =>
  typeof v === 'string' ? v : (stripeObject.safeParse(v).data?.id ?? null);
export const seconds = (v: unknown): Date | null =>
  typeof v === 'number' && Number.isFinite(v) ? new Date(v * 1000) : null;
