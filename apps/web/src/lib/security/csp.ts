/**
 * Content-Security-Policy (CSP) generation with nonces and strict-dynamic.
 * Follows the official Next.js 15 App Router nonce specification.
 */

export interface CspOptions {
  nonce: string;
  isDev?: boolean;
  env?: Record<string, string | undefined>;
}

/**
 * Generate a cryptographically secure 16-byte base64 nonce using Web Crypto.
 * Edge-runtime and Node.js compatible.
 */
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Safely extract protocol + host origin from a URL string.
 * Returns null if the value is missing, invalid, or not http/https.
 */
export function parseOrigin(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Parse comma-separated origin strings into a list of valid unique origins.
 */
export function parseOriginList(value?: string | null): string[] {
  if (!value || typeof value !== 'string') return [];
  const origins: string[] = [];
  for (const part of value.split(',')) {
    const parsed = parseOrigin(part);
    if (parsed && !origins.includes(parsed)) {
      origins.push(parsed);
    }
  }
  return origins;
}

function dedupe(origins: (string | null | undefined)[]): string[] {
  const result: string[] = [];
  for (const item of origins) {
    if (item && !result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Build the Content-Security-Policy header value for the web application.
 */
export function buildCspHeader(options: CspOptions): string {
  const { nonce } = options;
  const env = options.env ?? process.env;
  const isDev = options.isDev ?? env.NODE_ENV === 'development';

  // Derive API origins from environment
  const apiOrigins = dedupe([
    parseOrigin(env.NEXT_PUBLIC_API_URL || 'http://localhost:4100/api/v1'),
    parseOrigin(env.API_PUBLIC_ORIGIN || 'http://localhost:4100'),
    parseOrigin(env.API_INTERNAL_ORIGIN),
  ]);

  // Derive S3 and public media origins
  const s3Origins = dedupe([
    parseOrigin(env.S3_ENDPOINT || 'http://localhost:59000'),
    parseOrigin(env.CONTENT_PUBLIC_ORIGIN),
  ]);

  // Derive external embed origins (video players, H5P)
  const embedOrigins = dedupe(
    parseOriginList(
      env.CONTENT_EMBED_ORIGINS ||
        'https://www.youtube-nocookie.com,https://player.vimeo.com,https://www.h5p.com',
    ),
  );

  const mediaOrigins = dedupe([...s3Origins, ...apiOrigins]);
  // Stripe Checkout is a full-page redirect; the web app never loads Stripe.js.
  const connectOrigins = dedupe([...apiOrigins, ...s3Origins]);

  const scriptSrcParts = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isDev ? ["'unsafe-eval'"] : []),
  ];

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrcParts.join(' ')}`,
    // style-src 'unsafe-inline' is retained because Next.js App Router, Tailwind CSS v4,
    // and UI components (radix/shadcn/sonner) inject dynamic runtime styles and inline
    // style attributes on DOM elements during hydration and layout transitions.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${mediaOrigins.join(' ')}`.trim(),
    `media-src 'self' data: blob: ${mediaOrigins.join(' ')}`.trim(),
    `connect-src 'self' ${connectOrigins.join(' ')}`.trim(),
    embedOrigins.length ? `frame-src ${embedOrigins.join(' ')}` : "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}
