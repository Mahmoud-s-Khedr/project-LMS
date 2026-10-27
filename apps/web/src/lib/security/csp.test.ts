import { describe, expect, it } from 'vitest';
import { buildCspHeader, generateNonce, parseOrigin, parseOriginList } from './csp';

describe('CSP Security Module', () => {
  describe('generateNonce', () => {
    it('generates a valid 16-byte base64 string', () => {
      const nonce = generateNonce();
      expect(typeof nonce).toBe('string');
      // 16 bytes encoded in base64 is 24 characters with '==' padding
      expect(nonce.length).toBe(24);
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    });

    it('generates distinct nonces on successive calls', () => {
      const nonces = new Set(Array.from({ length: 20 }, () => generateNonce()));
      expect(nonces.size).toBe(20);
    });
  });

  describe('parseOrigin and parseOriginList', () => {
    it('parses valid HTTP and HTTPS URLs to origins', () => {
      expect(parseOrigin('http://localhost:4100/api/v1')).toBe('http://localhost:4100');
      expect(parseOrigin('https://api.example.com/some/path?q=1')).toBe('https://api.example.com');
      expect(parseOrigin('https://sub.domain.co.uk:8443/')).toBe('https://sub.domain.co.uk:8443');
    });

    it('returns null for invalid inputs', () => {
      expect(parseOrigin('')).toBeNull();
      expect(parseOrigin(null)).toBeNull();
      expect(parseOrigin(undefined)).toBeNull();
      expect(parseOrigin('not-a-url')).toBeNull();
      expect(parseOrigin('ftp://ftp.example.com')).toBeNull();
      expect(parseOrigin('javascript:alert(1)')).toBeNull();
    });

    it('parses comma-separated origin lists and filters invalid entries', () => {
      const list =
        'https://player.vimeo.com, invalid-item , https://www.h5p.com/embed, https://player.vimeo.com';
      expect(parseOriginList(list)).toEqual(['https://player.vimeo.com', 'https://www.h5p.com']);
    });
  });

  describe('buildCspHeader', () => {
    it('builds production policy without unsafe-inline or unsafe-eval in script-src', () => {
      const nonce = 'abcd1234efgh5678ijkl90==';
      const csp = buildCspHeader({ nonce, isDev: false });

      const scriptPart = csp.split(';').find((p) => p.trim().startsWith('script-src'));
      expect(scriptPart).toBeDefined();
      expect(scriptPart).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
      expect(scriptPart).not.toContain("'unsafe-inline'");
      expect(scriptPart).not.toContain("'unsafe-eval'");
      expect(csp).toContain('upgrade-insecure-requests');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("form-action 'self'");
    });

    it('includes unsafe-eval in script-src only in development mode', () => {
      const nonce = 'abcd1234efgh5678ijkl90==';
      const devCsp = buildCspHeader({ nonce, isDev: true });

      expect(devCsp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`);
      expect(devCsp).not.toContain('upgrade-insecure-requests');

      const prodCsp = buildCspHeader({ nonce, isDev: false });
      expect(prodCsp).not.toContain("'unsafe-eval'");
      expect(prodCsp).toContain('upgrade-insecure-requests');
    });

    it('narrows img-src, media-src, and connect-src without blanket https: http:', () => {
      const nonce = 'testnonce123456789012==';
      const csp = buildCspHeader({
        nonce,
        isDev: false,
        env: {
          NEXT_PUBLIC_API_URL: 'https://api.myplatform.org/api/v1',
          API_PUBLIC_ORIGIN: 'https://api.myplatform.org',
          S3_ENDPOINT: 'https://storage.myplatform.org',
          CONTENT_PUBLIC_ORIGIN: 'https://cdn.myplatform.org',
          CONTENT_EMBED_ORIGINS: 'https://www.youtube-nocookie.com',
        },
      });

      // No blanket https: or http: in source lists
      expect(csp).not.toMatch(/connect-src[^;]*\bhttps:\b/);
      expect(csp).not.toMatch(/connect-src[^;]*\bhttp:\b/);
      expect(csp).not.toMatch(/img-src[^;]*\bhttps:\b/);
      expect(csp).not.toMatch(/img-src[^;]*\bhttp:\b/);
      expect(csp).not.toMatch(/media-src[^;]*\bhttps:\b/);
      expect(csp).not.toMatch(/media-src[^;]*\bhttp:\b/);

      // connect-src includes self, API, S3, CDN; no Stripe (Checkout is a redirect)
      expect(csp).toContain('connect-src');
      expect(csp).toContain('https://api.myplatform.org');
      expect(csp).toContain('https://storage.myplatform.org');
      expect(csp).toContain('https://cdn.myplatform.org');
      expect(csp).not.toContain('stripe.com');

      // media-src includes storage and cdn
      expect(csp).toContain('media-src');
      expect(csp).toContain('https://storage.myplatform.org');
      expect(csp).toContain('https://cdn.myplatform.org');

      // img-src includes storage and cdn
      expect(csp).toContain('img-src');

      // frame-src includes only embeds
      expect(csp).toContain('frame-src https://www.youtube-nocookie.com;');
    });

    it('gracefully handles missing or invalid environment variables', () => {
      const nonce = 'testnonce123456789012==';
      const csp = buildCspHeader({
        nonce,
        isDev: false,
        env: {
          NEXT_PUBLIC_API_URL: 'invalid-url',
          API_PUBLIC_ORIGIN: 'malformed://bad-proto',
          S3_ENDPOINT: '',
          CONTENT_PUBLIC_ORIGIN: '   ',
          CONTENT_EMBED_ORIGINS: 'not-valid,also-bad',
        },
      });

      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
      expect(csp).not.toContain('invalid-url');
      expect(csp).not.toContain('malformed');
    });

    it('deduplicates duplicate origins', () => {
      const nonce = 'testnonce123456789012==';
      const csp = buildCspHeader({
        nonce,
        isDev: false,
        env: {
          NEXT_PUBLIC_API_URL: 'https://api.example.com/api/v1',
          API_PUBLIC_ORIGIN: 'https://api.example.com',
          API_INTERNAL_ORIGIN: 'https://api.example.com',
          S3_ENDPOINT: 'https://storage.example.com',
          CONTENT_PUBLIC_ORIGIN: 'https://storage.example.com',
        },
      });

      const connectPart = csp.split(';').find((p) => p.trim().startsWith('connect-src'));
      expect(connectPart).toBeDefined();
      // Count occurrences of 'https://api.example.com' in connect-src
      const matches = connectPart!.match(/https:\/\/api\.example\.com/g);
      expect(matches?.length).toBe(1);
    });

    it('keeps style-src self unsafe-inline with explanation', () => {
      const nonce = 'testnonce123456789012==';
      const csp = buildCspHeader({ nonce, isDev: false });
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });
  });
});
