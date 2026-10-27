import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { createAndLoginTestUser, generateTestEmail, DEFAULT_TEST_PASSWORD } from '../fixtures/auth';

describe('Security: Session Hint, Bearer Auth, and Session Revocation', () => {
  beforeAll(async () => {
    const probe = new TestApiClient();
    const health = await probe.get('/health/live');
    expect(health.status).toBe(200);
  });

  it('rejects access to protected /me endpoint without Authorization header', async () => {
    const unauthClient = new TestApiClient();
    const res = await unauthClient.get('/me');
    expect(res.status).toBe(401);
  });

  it('rejects access with forged or malformed Bearer token', async () => {
    const client = new TestApiClient({
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature',
    });
    const res = await client.get('/me');
    expect(res.status).toBe(401);
  });

  it('sets lms_session navigation hint on login and returns sanitized user profile', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('session-hint'),
      direct: true,
    });

    // Check navigation hint cookie
    expect(user.client.getCookie('lms_session')).toBe('1');

    // Fetch /me
    const meRes = await user.client.get('/me');
    expect(meRes.status).toBe(200);
    expect(meRes.data?.data?.id).toBe(user.id);
    expect(meRes.data?.data?.email).toBe(user.email);

    // Verify absence of sensitive fields
    expect(meRes.data?.data?.passwordHash).toBeUndefined();
    expect(meRes.data?.data?.refreshToken).toBeUndefined();
    expect(meRes.data?.data?.tokenHash).toBeUndefined();
  });

  it('logout revokes session family, clears cookies, and rejects further refreshes', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('logout-test'),
      direct: true,
    });

    expect(user.client.getCookie('lms_refresh')).toBeDefined();

    // Call logout
    const logoutRes = await user.client.post('/auth/logout');
    expect([200, 204]).toContain(logoutRes.status);

    // Refresh cookies should be cleared in client jar
    expect(user.client.getCookie('lms_refresh')).toBeUndefined();
    expect(user.client.getCookie('lms_session')).toBeUndefined();

    // Any attempt to refresh with the prior token fails
    const postLogoutRefresh = await user.client.post('/auth/refresh');
    expect([400, 401, 403]).toContain(postLogoutRefresh.status);
  });

  it('logout-all revokes all sessions across all devices for the user', async () => {
    const user = await createAndLoginTestUser({
      email: generateTestEmail('logout-all'),
      direct: true,
    });

    // Device 1 triggers logout-all
    const logoutAllRes = await user.client.post('/auth/logout-all');
    expect([200, 204]).toContain(logoutAllRes.status);

    // Session is now revoked in database: subsequent refresh fails
    const postLogoutAllRefresh = await user.client.post('/auth/refresh');
    expect([400, 401, 403]).toContain(postLogoutAllRefresh.status);
  });
});
