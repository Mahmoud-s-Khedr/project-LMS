import { expect, it } from 'vitest';
import config from '../next.config';

it('sets baseline security headers for all paths and delegates CSP to nonce middleware', async () => {
  const rules = await config.headers!();
  expect(rules[0]!.source).toBe('/:path*');
  const headers = Object.fromEntries(rules[0]!.headers.map(({ key, value }) => [key, value]));
  // CSP is dynamically built per-request with nonces in middleware, not statically in next.config
  expect(headers['Content-Security-Policy']).toBeUndefined();
  expect(headers['X-Frame-Options']).toBe('DENY');
  expect(headers['X-Content-Type-Options']).toBe('nosniff');
  expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['Permissions-Policy']).toContain('camera=()');
});

it('enables HSTS only in production', async () => {
  const previous = process.env.NODE_ENV;
  try {
    Object.assign(process.env, { NODE_ENV: 'production' });
    expect(
      (await config.headers!())[0]!.headers.some(
        (header) => header.key === 'Strict-Transport-Security',
      ),
    ).toBe(true);
    Object.assign(process.env, { NODE_ENV: 'development' });
    expect(
      (await config.headers!())[0]!.headers.some(
        (header) => header.key === 'Strict-Transport-Security',
      ),
    ).toBe(false);
  } finally {
    Object.assign(process.env, { NODE_ENV: previous });
  }
});
