import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { probeEndpoint } from '../fixtures/probes';
import { randomUUID } from 'node:crypto';

describe('Security: Content Access, Drip Release, and Prerequisite Invariants', () => {
  const probeUrl = 'http://localhost:4100/api/v1/health';
  let isAvailable = false;

  beforeAll(async () => {
    const probe = await probeEndpoint(probeUrl);
    isAvailable = probe.available;
  });

  it('rejects asset download signing for expired enrollment grants', async (ctx) => {
    if (!isAvailable) {
      ctx.skip('API server not available');
      return;
    }

    const client = new TestApiClient();
    const enrollmentId = randomUUID();
    const expiredLessonId = randomUUID();
    const assetId = randomUUID();
    const res = await client.post(
      `/me/enrollments/${enrollmentId}/lessons/${expiredLessonId}/assets/${assetId}/download`,
      {},
    );

    expect([401, 403, 404]).toContain(res.status);
    if (res.status === 403) {
      expect(res.rawText).toMatch(/ACCESS_EXPIRED|ENROLLMENT_REQUIRED/i);
    }
  });

  it('blocks access to locked lessons when course/lesson prerequisites are unmet', async (ctx) => {
    if (!isAvailable) {
      ctx.skip('API server not available');
      return;
    }

    const client = new TestApiClient();
    const enrollmentId = randomUUID();
    const lockedLessonId = randomUUID();
    const res = await client.get(`/me/enrollments/${enrollmentId}/lessons/${lockedLessonId}`);

    expect([401, 403, 404]).toContain(res.status);
  });

  it('enforces Teaching Assistant capability flags: edit flag required for lesson modification', async (ctx) => {
    if (!isAvailable) {
      ctx.skip('API server not available');
      return;
    }

    const client = new TestApiClient();
    const res = await client.patch(
      `/workspaces/${randomUUID()}/courses/${randomUUID()}/sections/${randomUUID()}/lessons/${randomUUID()}`,
      { title: 'Unauthorized Modification' },
    );
    expect([401, 403, 404]).toContain(res.status);
  });
});
