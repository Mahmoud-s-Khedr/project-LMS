import type { Prisma } from '@prisma/client';

/**
 * Redaction for audit records and diagnostic projections.
 *
 * Audit `changes` must never contain credentials, one-time capabilities, answer keys / learner answers or
 * signed links (ARCHITECTURE §3, §5, §9). Redaction is applied by key name AND by value shape so a secret
 * smuggled under an innocent key (for example a presigned URL in `location`) is still removed.
 */

export const REDACTED = '[REDACTED]';
export const TRUNCATED = '[TRUNCATED]';

export interface RedactionLimits {
  /** Maximum nesting depth retained; deeper values become `[TRUNCATED]`. */
  readonly maxDepth: number;
  /** Maximum array items retained per array. */
  readonly maxArrayItems: number;
  /** Maximum keys retained per object. */
  readonly maxObjectKeys: number;
  /** Maximum characters retained per string. */
  readonly maxStringLength: number;
}

export const DEFAULT_REDACTION_LIMITS: RedactionLimits = Object.freeze({
  maxDepth: 6,
  maxArrayItems: 50,
  maxObjectKeys: 100,
  maxStringLength: 2000,
});

/** Normalized (lowercase, no separators) key names that are always secret. */
const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'oldpassword',
  'secret',
  'clientsecret',
  'webhooksecret',
  'token',
  'tokens',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'csrftoken',
  'sessiontoken',
  'uploadtoken',
  'tokenhash',
  'verifier',
  'apikey',
  'privatekey',
  'authorization',
  'cookie',
  'cookies',
  'setcookie',
  'otp',
  'verificationcode',
  'ciphertext',
  'mailcapability',
  'capability',
  'cardnumber',
  'cvc',
  'cvv',
  'iban',
  'hosturl',
  'hosturlencrypted',
  'signedurl',
  'presignedurl',
  'downloadurl',
  'uploadurl',
  'signature',
]);

/** Answer keys, grading secrets and learner answers (assessment integrity, §4). */
const ANSWER_KEYS = new Set([
  'answerkey',
  'answerkeys',
  'correctoption',
  'correctoptions',
  'correctoptionkeys',
  'correctanswer',
  'correctanswers',
  'solution',
  'solutions',
  'gradingconfig',
  'seed',
  'randomseed',
  'answer',
  'answers',
  'response',
  'responses',
  'answertext',
]);

/** Suffixes on normalized keys that always indicate a secret (e.g. `stripeSecret`, `resetToken`). */
const SECRET_SUFFIXES = ['password', 'passwordhash', 'secret', 'token', 'tokenhash', 'apikey', 'privatekey'];

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PROVIDER_SECRET_PATTERN = /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}\b|\bwhsec_[A-Za-z0-9]{8,}\b/g;
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const SIGNED_QUERY_PATTERN =
  /[?&](x-amz-signature|x-amz-credential|x-amz-security-token|signature|sig|token|access_token|key-pair-id|policy|expires|code)=/i;

export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True when a key name always holds secret / answer material. */
export function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (SECRET_KEYS.has(normalized) || ANSWER_KEYS.has(normalized)) return true;
  return SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/** Removes signed-link query strings, bearer credentials, JWTs and provider secrets from free text. */
export function redactString(value: string, maxLength = DEFAULT_REDACTION_LIMITS.maxStringLength): string {
  let result = value
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(BEARER_PATTERN, '$1 [REDACTED]')
    .replace(PROVIDER_SECRET_PATTERN, '[REDACTED_SECRET]')
    .replace(URL_PATTERN, (url) => redactUrl(url));
  if (result.length > maxLength) result = `${result.slice(0, maxLength)}…${TRUNCATED}`;
  return result;
}

/** A URL keeps origin + path; any query string or fragment (signatures, tokens) is dropped. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const hadSecrets = url.search.length > 0 || url.hash.length > 0 || url.username || url.password;
    if (!hadSecrets) return raw;
    return `${url.protocol}//${url.host}${url.pathname}?${REDACTED}`;
  } catch {
    return raw.includes('?') ? `${raw.slice(0, raw.indexOf('?'))}?${REDACTED}` : raw;
  }
}

/** True for strings that look like signed links / bearer capabilities. */
export function looksLikeCapability(value: string): boolean {
  JWT_PATTERN.lastIndex = 0;
  PROVIDER_SECRET_PATTERN.lastIndex = 0;
  if (JWT_PATTERN.test(value) || PROVIDER_SECRET_PATTERN.test(value)) {
    JWT_PATTERN.lastIndex = 0;
    PROVIDER_SECRET_PATTERN.lastIndex = 0;
    return true;
  }
  const urls = value.match(URL_PATTERN) ?? [];
  return urls.some((url) => SIGNED_QUERY_PATTERN.test(url));
}

/**
 * Deep-redacts an arbitrary value into JSON that is safe to persist in AuditLog.changes or expose in an
 * operations projection. Never throws; non-JSON values are converted (Date → ISO, bigint → digits).
 */
export function redact(value: unknown, limits: RedactionLimits = DEFAULT_REDACTION_LIMITS): Prisma.InputJsonValue {
  const seen = new WeakSet<object>();
  const visit = (input: unknown, depth: number): Prisma.InputJsonValue | null => {
    if (input === null || input === undefined) return null;
    if (typeof input === 'string') return redactString(input, limits.maxStringLength);
    if (typeof input === 'number') return Number.isFinite(input) ? input : String(input);
    if (typeof input === 'boolean') return input;
    if (typeof input === 'bigint') return input.toString();
    if (typeof input === 'function' || typeof input === 'symbol') return null;
    if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input.toISOString();
    if (Buffer.isBuffer(input) || ArrayBuffer.isView(input)) return '[BINARY]';
    if (typeof input !== 'object') return null;
    if (seen.has(input)) return '[CIRCULAR]';
    if (depth >= limits.maxDepth) return TRUNCATED;
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        const items = input.slice(0, limits.maxArrayItems).map((item) => visit(item, depth + 1));
        if (input.length > limits.maxArrayItems) items.push(`${TRUNCATED}:${input.length - limits.maxArrayItems}`);
        return items as Prisma.InputJsonArray;
      }
      if (input instanceof Map) return visit(Object.fromEntries(input), depth);
      if (input instanceof Set) return visit([...input], depth);
      if (input instanceof Error) return { name: input.name, message: redactString(input.message, limits.maxStringLength) };
      const output: Record<string, Prisma.InputJsonValue | null> = {};
      const entries = Object.entries(input as Record<string, unknown>);
      for (const [key, child] of entries.slice(0, limits.maxObjectKeys)) {
        if (child === undefined || typeof child === 'function' || typeof child === 'symbol') continue;
        output[key] = isSensitiveKey(key) ? REDACTED : visit(child, depth + 1);
      }
      if (entries.length > limits.maxObjectKeys) output[TRUNCATED] = entries.length - limits.maxObjectKeys;
      return output as Prisma.InputJsonObject;
    } finally {
      seen.delete(input);
    }
  };
  return visit(value, 0) ?? {};
}

export interface SensitiveFinding {
  readonly path: string;
  readonly reason: 'sensitive-key' | 'capability-value';
}

/**
 * Finds credential/answer keys and capability-shaped values. Used to reject event payloads before they
 * are persisted (events carry IDs; consumers load trusted state themselves). Keys listed in `allowKeys`
 * (normalized) are skipped entirely — used for the envelope-encrypted mail capability.
 */
export function findSensitiveContent(
  value: unknown,
  allowKeys: ReadonlySet<string> = new Set(),
  path = '$',
  depth = 0,
): SensitiveFinding[] {
  if (depth > 32) return [];
  if (typeof value === 'string') return looksLikeCapability(value) ? [{ path, reason: 'capability-value' }] : [];
  if (value === null || typeof value !== 'object') return [];
  const findings: SensitiveFinding[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => findings.push(...findSensitiveContent(item, allowKeys, `${path}[${index}]`, depth + 1)));
    return findings;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (allowKeys.has(normalizeKey(key))) continue;
    if (isSensitiveKey(key)) {
      findings.push({ path: childPath, reason: 'sensitive-key' });
      continue;
    }
    findings.push(...findSensitiveContent(child, allowKeys, childPath, depth + 1));
  }
  return findings;
}
