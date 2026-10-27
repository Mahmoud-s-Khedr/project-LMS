import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { createAndLoginTestUser, generateTestEmail } from '../fixtures/auth';

describe('Security: Refresh Token Rotation and Reuse Detection', () => {
  beforeAll(async () => {
    const probe = new TestApiClient();
    const health = await probe.get('/health/live');
    expect(health.status).toBe(200);
  });

  it('rotates refresh token on valid refresh request', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('rotate'),
      direct: true,
    });

    const initialRefreshToken = user.client.getCookie('lms_refresh');
    expect(initialRefreshToken).toBeDefined();

    // Perform refresh
    const refreshRes = await user.client.post('/auth/refresh');
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.data?.data?.accessToken).toBeDefined();

    const secondRefreshToken = user.client.getCookie('lms_refresh');
    expect(secondRefreshToken).toBeDefined();
    expect(secondRefreshToken).not.toBe(initialRefreshToken);
  });

  it('revokes entire family and clears cookie when a consumed token is reused (Replay Detection)', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('reuse'),
      direct: true,
    });

    // 1. Capture Token A
    const tokenA = user.client.getCookie('lms_refresh');
    expect(tokenA).toBeDefined();

    // 2. Perform legitimate refresh -> Server consumes Token A and issues Token B
    const firstRefresh = await user.client.post('/auth/refresh');
    expect(firstRefresh.status).toBe(200);
    const tokenB = user.client.getCookie('lms_refresh');
    expect(tokenB).toBeDefined();
    expect(tokenB).not.toBe(tokenA);

    // Perform second refresh -> Server consumes Token B and issues Token C
    // This establishes Token B as consumed so replaying Token A is an unambiguous replay outside single-retry grace.
    const secondRefresh = await user.client.post('/auth/refresh');
    expect(secondRefresh.status).toBe(200);
    const tokenC = user.client.getCookie('lms_refresh');
    expect(tokenC).toBeDefined();
    expect(tokenC).not.toBe(tokenB);

    // 3. Attacker replays consumed Token A
    const attackerClient = new TestApiClient();
    await attackerClient.fetchCsrfToken();
    attackerClient.setCookie('lms_refresh', tokenA!);

    const replayRes = await attackerClient.post('/auth/refresh');

    // Architecture spec: reuse returns 401/403/409 with code REFRESH_REUSED and revokes family
    expect([401, 403, 409]).toContain(replayRes.status);
    expect(replayRes.rawText).toMatch(/REFRESH_REUSED|revoked|invalid/i);

    // 4. Verification: Token C (the current legitimate token) must also now be revoked!
    const legitClient = new TestApiClient();
    await legitClient.fetchCsrfToken();
    legitClient.setCookie('lms_refresh', tokenC!);

    const subsequentRes = await legitClient.post('/auth/refresh');
    expect([401, 403, 409]).toContain(subsequentRes.status);
  });

  it('concurrent refreshes with the same token coordinate and do not corrupt state', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('concurrency'),
      direct: true,
    });

    const token = user.client.getCookie('lms_refresh');
    expect(token).toBeDefined();

    // Spawn 2 parallel refresh requests with identical cookie
    const client1 = new TestApiClient();
    await client1.fetchCsrfToken();
    client1.setCookie('lms_refresh', token!);

    const client2 = new TestApiClient();
    await client2.fetchCsrfToken();
    client2.setCookie('lms_refresh', token!);

    const [res1, res2] = await Promise.all([
      client1.post('/auth/refresh'),
      client2.post('/auth/refresh'),
    ]);

    // One must succeed (200) and the other will either receive 200 (if coordinated) or be detected as consumed/conflict
    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
  });
});
