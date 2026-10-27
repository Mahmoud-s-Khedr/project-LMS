import { apiErrorSchema, type ApiErrorEnvelope } from '@lms/shared';

const API_URL =
  typeof window === 'undefined'
    ? `${process.env.API_INTERNAL_ORIGIN ?? 'http://localhost:4100'}/api/v1`
    : (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100/api/v1');

export class ApiError extends Error {
  readonly status: number;
  readonly envelope: ApiErrorEnvelope;

  constructor(status: number, envelope: ApiErrorEnvelope) {
    super(envelope.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.envelope = envelope;
  }

  get code(): string {
    return this.envelope.error.code;
  }
  get requestId(): string {
    return this.envelope.error.requestId;
  }
  get details(): unknown {
    return this.envelope.error.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'credentials'> {
  body?: unknown;
  /** Disable refresh for auth endpoints, or when a caller handles authentication. */
  skipAuthRefresh?: boolean;
}

let refreshInFlight: Promise<boolean> | undefined;
let accessToken: string | undefined;
let csrfInFlight: Promise<string> | undefined;
let tokenChannel: BroadcastChannel | undefined;

async function withSessionLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof window !== 'undefined' && navigator.locks) {
    return await navigator.locks.request('lms-session-refresh', action);
  }
  return action();
}

function ensureTokenChannel(): void {
  if (
    tokenChannel ||
    typeof window === 'undefined' ||
    !navigator.locks ||
    typeof BroadcastChannel === 'undefined'
  )
    return;
  tokenChannel = new BroadcastChannel('lms-session');
  tokenChannel.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (typeof data !== 'object' || data === null) return;
    const message = data as Record<string, unknown>;
    if (
      message.type === 'access-token' &&
      (typeof message.token === 'string' || message.token === null)
    ) {
      accessToken = message.token ?? undefined;
    }
  };
  window.addEventListener(
    'pagehide',
    () => {
      tokenChannel?.close();
      tokenChannel = undefined;
    },
    { once: true },
  );
}

function resourceData(payload: unknown): Record<string, unknown> {
  const record =
    typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  return typeof record.data === 'object' && record.data !== null
    ? (record.data as Record<string, unknown>)
    : record;
}

/** Obtain the matching double-submit token before a cookie-changing auth request. */
export function getCsrfToken(): Promise<string> {
  if (!csrfInFlight) {
    csrfInFlight = (async () => {
      const response = await fetch(`${API_URL}/auth/csrf`, {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw await toApiError(response, '/auth/csrf');
      const data = resourceData(await response.json());
      if (typeof data.csrfToken !== 'string')
        throw new Error('The API returned an invalid CSRF token');
      return data.csrfToken;
    })().finally(() => {
      csrfInFlight = undefined;
    });
  }
  return csrfInFlight;
}

/** Keep access tokens in memory; refresh tokens remain in HttpOnly cookies. */
export function setAccessToken(token: string | undefined): void {
  accessToken = token;
  ensureTokenChannel();
  tokenChannel?.postMessage({ type: 'access-token', token: token ?? null });
}

async function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    ensureTokenChannel();
    const tokenBeforeRefresh = accessToken;
    const rotate = async () => {
      // A tab waiting for the browser lock can reuse a token broadcast by the previous holder.
      if (accessToken && accessToken !== tokenBeforeRefresh) return true;
      try {
        const csrfToken = await getCsrfToken();
        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken },
        });
        if (!response.ok) {
          setAccessToken(undefined);
          return false;
        }
        const data = resourceData(await response.json());
        if (typeof data.accessToken !== 'string') return false;
        setAccessToken(data.accessToken);
        return true;
      } catch {
        return false;
      }
    };
    refreshInFlight = withSessionLock(rotate).finally(() => {
      refreshInFlight = undefined;
    });
  }
  return refreshInFlight;
}

async function toApiError(response: Response, path: string): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => undefined);
  const parsed = apiErrorSchema.safeParse(payload);
  return new ApiError(
    response.status,
    parsed.success
      ? parsed.data
      : {
          error: {
            code: 'HTTP_ERROR',
            message: response.statusText || 'Request failed',
            requestId: response.headers.get('x-request-id') ?? 'unknown',
            timestamp: new Date().toISOString(),
            path,
          },
        },
  );
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('API paths must begin with a single slash');
  const { body, skipAuthRefresh = false, ...init } = options;
  ensureTokenChannel();
  const baseHeaders = new Headers(init.headers);
  const method = (init.method ?? 'GET').toUpperCase();
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const route = path.split('?')[0];
  const changesAuthCookie =
    unsafe &&
    ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'].includes(route ?? '');
  // Keep one key for the original write and its possible retry.
  if (unsafe && !path.startsWith('/auth/') && !baseHeaders.has('Idempotency-Key')) {
    baseHeaders.set('Idempotency-Key', crypto.randomUUID());
  }
  const send = () => {
    const headers = new Headers(baseHeaders);
    headers.set('Accept', 'application/json');
    if (accessToken && !headers.has('Authorization'))
      headers.set('Authorization', `Bearer ${accessToken}`);
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isFormData) headers.set('Content-Type', 'application/json');
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      ...(body !== undefined ? { body: isFormData ? body : JSON.stringify(body) } : {}),
    });
  };
  let response = await (changesAuthCookie
    ? withSessionLock(async () => {
        if (!baseHeaders.has('X-CSRF-Token')) baseHeaders.set('X-CSRF-Token', await getCsrfToken());
        return send();
      })
    : send());
  if (
    response.status === 401 &&
    !skipAuthRefresh &&
    !path.startsWith('/auth/') &&
    (await refreshSession())
  ) {
    response = await send();
  }
  if (!response.ok) throw await toApiError(response, path);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, options?: ApiRequestOptions) =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),
};
