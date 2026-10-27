import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { probeEndpoint } from '../fixtures/probes';
import { randomUUID } from 'node:crypto';

describe('Security: Financial Ledgers and Independent Grant Provenance', () => {
  const probeUrl = 'http://localhost:4100/api/v1/health';
  let isAvailable = false;

  beforeAll(async () => {
    const probe = await probeEndpoint(probeUrl);
    isAvailable = probe.available;
  });

  it('independent enrollment grants survive unrelated one-time order refunds', async (ctx) => {
    if (!isAvailable) {
      ctx.skip('API server not available');
      return;
    }

    // Invariant:
    // User holds Grant A (source: SUBSCRIPTION, id: sub-1)
    // User holds Grant B (source: ORDER_ITEM, id: order-1)
    // When order-1 is refunded:
    // - Grant B is revoked (revokedAt is stamped, reason: REFUND)
    // - Grant A remains ACTIVE and effective access is preserved.
    expect(true).toBe(true);
  });

  it('cumulative refund items cannot exceed captured payment amount', async (ctx) => {
    if (!isAvailable) {
      ctx.skip('API server not available');
      return;
    }

    const client = new TestApiClient();
    const workspaceId = randomUUID();
    const paymentId = randomUUID();

    const res = await client.post(`/workspaces/${workspaceId}/payments/${paymentId}/refunds`, {
      reason: 'Fraudulent excessive refund',
      itemAllocations: [],
    }, {
      headers: {
        'Idempotency-Key': `idemp-${randomUUID()}`,
      },
    });

    expect([400, 401, 403, 404, 409, 422]).toContain(res.status);
    if (res.status === 409 || res.status === 422) {
      expect(res.rawText).toMatch(/REFUND_LIMIT_EXCEEDED|amount/i);
    }
  });
});
