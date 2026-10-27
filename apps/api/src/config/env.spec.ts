import { parseTrustProxy, validateEnvironment } from './env';

const base = {
  DATABASE_URL: 'postgres://localhost/lms',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'password',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};
describe('environment configuration', () => {
  it('parses proxy settings and rejects invalid addresses and hop counts', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toEqual(['loopback', '10.0.0.0/8']);
    for (const value of ['11', '10.0.0.0/33', '', 'unknown'])
      expect(() => parseTrustProxy(value)).toThrow();
  });
  it('enforces production secrets and Stripe mode', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      TENANCY_MAIL_KEY: Buffer.alloc(32, 1).toString('base64'),
      AUDIT_IP_HASH_SECRET: 'a'.repeat(16),
      CONTENT_HOST_KEY: 'b'.repeat(64),
    };
    expect(() => validateEnvironment({ ...base, NODE_ENV: 'production' })).toThrow();
    expect(() =>
      validateEnvironment({
        ...production,
        TENANCY_MAIL_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      }),
    ).toThrow();
    expect(() => validateEnvironment({ ...production, CONTENT_HOST_KEY: '' })).toThrow();
    expect(
      validateEnvironment({
        ...production,
        STRIPE_MODE: 'live',
        STRIPE_SECRET_KEY: 'rk_live_example',
      }).SWAGGER_ENABLED,
    ).toBe(false);
    expect(() =>
      validateEnvironment({ ...base, STRIPE_MODE: 'live', STRIPE_SECRET_KEY: 'sk_live_example' }),
    ).toThrow();
    expect(() => validateEnvironment({ ...base, STRIPE_SECRET_KEY: 'sk_live_example' })).toThrow();
    expect(
      validateEnvironment({ ...base, STRIPE_SECRET_KEY: 'rk_test_example' }).SWAGGER_ENABLED,
    ).toBe(true);
    expect(() => validateEnvironment({ ...production, THROTTLE_STORAGE: 'memory' })).toThrow();
  });
});
