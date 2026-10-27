import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { generateTestEmail, DEFAULT_TEST_PASSWORD } from '../fixtures/auth';

describe('Security: CSRF and Origin Enforcement', () => {
  const client = new TestApiClient();

  beforeAll(async () => {
    // Verify API is running and reachable
    const health = await client.get('/health/live');
    expect(health.status).toBe(200);
  });

  it('rejects registration when Origin header is disallowed', async () => {
    const freshClient = new TestApiClient();
    await freshClient.fetchCsrfToken();

    const res = await freshClient.post(
      '/auth/register',
      {
        email: generateTestEmail('csrf-origin'),
        password: DEFAULT_TEST_PASSWORD,
        name: 'Evil Origin User',
      },
      {
        customOrigin: 'http://malicious-site.example.com',
      },
    );

    expect(res.status).toBe(403);
    expect(res.rawText).toContain('Origin is not allowed');
  });

  it('rejects registration when x-csrf-token header is missing', async () => {
    const freshClient = new TestApiClient();
    await freshClient.fetchCsrfToken();

    const res = await freshClient.post(
      '/auth/register',
      {
        email: generateTestEmail('csrf-no-header'),
        password: DEFAULT_TEST_PASSWORD,
        name: 'No Header User',
      },
      {
        customCsrf: '', // Omit header
      },
    );

    expect(res.status).toBe(403);
    expect(res.rawText).toContain('Invalid CSRF token');
  });

  it('rejects registration when header and cookie do not match', async () => {
    const freshClient = new TestApiClient();
    await freshClient.fetchCsrfToken();
    const mismatchedToken = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

    const res = await freshClient.post(
      '/auth/register',
      {
        email: generateTestEmail('csrf-mismatch'),
        password: DEFAULT_TEST_PASSWORD,
        name: 'Mismatch User',
      },
      {
        customCsrf: mismatchedToken,
      },
    );

    expect(res.status).toBe(403);
    expect(res.rawText).toContain('Invalid CSRF token');
  });

  it('accepts registration and login with valid Origin and double-submit CSRF cookie/header', async () => {
    const validClient = new TestApiClient();
    const testEmail = generateTestEmail('csrf-valid');

    // Register
    const regRes = await validClient.post('/auth/register', {
      email: testEmail,
      password: DEFAULT_TEST_PASSWORD,
      name: 'Valid CSRF User',
    });

    expect(regRes.status).toBe(201);
    // Registration is enumeration-safe: it returns a generic message, no profile or session (P2-B-AUTH-FIX).
    expect(regRes.data?.data?.message).toBe('Check your email for next steps.');
    expect(regRes.data?.data?.email).toBeUndefined();

    // Login
    const loginRes = await validClient.post('/auth/login', {
      email: testEmail,
      password: DEFAULT_TEST_PASSWORD,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.data?.data?.accessToken).toBeDefined();
    expect(validClient.getCookie('lms_refresh')).toBeDefined();
    expect(validClient.getCookie('lms_session')).toBe('1');
  });
});
