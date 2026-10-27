/**
 * Test API Client with cookie jar, automatic CSRF handling, and authentication tokens.
 */

export interface TestResponse<T = any> {
  status: number;
  headers: Headers;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ path: string; code: string; message: string }>;
    requestId?: string;
  };
  cookies: Record<string, string>;
  rawText: string;
}

export interface ClientOptions {
  baseUrl?: string;
  origin?: string;
  accessToken?: string;
  autoCsrf?: boolean;
}

export class TestApiClient {
  public baseUrl: string;
  public origin: string;
  public cookies: Map<string, string> = new Map();
  public accessToken?: string;
  public csrfToken?: string;
  private autoCsrf: boolean;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://localhost:4100/api/v1';
    this.origin = options.origin ?? 'http://localhost:3100';
    this.accessToken = options.accessToken;
    this.autoCsrf = options.autoCsrf ?? true;
  }

  /** Set cookie in jar */
  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  /** Get cookie from jar */
  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** Clear all cookies */
  clearCookies(): void {
    this.cookies.clear();
    this.csrfToken = undefined;
  }

  /** Parse Set-Cookie header and store in jar */
  private parseSetCookies(headers: Headers): void {
    const rawCookies = headers.getSetCookie?.() ?? [];
    if (rawCookies.length === 0) {
      const single = headers.get('set-cookie');
      if (single) {
        rawCookies.push(single);
      }
    }

    for (const cookieStr of rawCookies) {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (
          value === '' ||
          cookieStr.includes('Max-Age=0') ||
          cookieStr.includes('Expires=Thu, 01 Jan 1970')
        ) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, value);
        }
      }
    }
  }

  /** Build Cookie header string from jar */
  private buildCookieHeader(): string {
    const pairs: string[] = [];
    this.cookies.forEach((val, name) => {
      pairs.push(`${name}=${val}`);
    });
    return pairs.join('; ');
  }

  /** Fetch CSRF token from /auth/csrf */
  async fetchCsrfToken(): Promise<string> {
    const res = await this.get<{ data: { csrfToken: string } }>('/auth/csrf', { skipCsrf: true });
    if (res.status !== 200 || !res.data?.data?.csrfToken) {
      throw new Error(`Failed to fetch CSRF token: status ${res.status}, body: ${res.rawText}`);
    }
    this.csrfToken = res.data.data.csrfToken;
    return this.csrfToken;
  }

  /** Core request method */
  async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      headers?: Record<string, string>;
      skipCsrf?: boolean;
      customCsrf?: string;
      customOrigin?: string;
      idempotencyKey?: string;
    } = {},
  ): Promise<TestResponse<T>> {
    const method = (options.method ?? 'GET').toUpperCase();
    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // If mutating and autoCsrf enabled and no csrfToken stored yet, fetch it
    if (
      isMutating &&
      this.autoCsrf &&
      !this.csrfToken &&
      !options.skipCsrf &&
      !options.customCsrf
    ) {
      await this.fetchCsrfToken();
    }

    const headers: Record<string, string> = {
      ...options.headers,
    };

    // Set Origin
    if (options.customOrigin !== undefined) {
      if (options.customOrigin !== '') {
        headers['Origin'] = options.customOrigin;
      }
    } else if (isMutating || this.origin) {
      headers['Origin'] = this.origin;
    }

    // Set CSRF token
    if (options.customCsrf !== undefined) {
      if (options.customCsrf !== '') {
        headers['x-csrf-token'] = options.customCsrf;
      }
    } else if (this.csrfToken && !options.skipCsrf) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    // Set Bearer Token
    if (this.accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Set Idempotency-Key
    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    // Set Cookie
    const cookieHeader = this.buildCookieHeader();
    if (cookieHeader && !headers['Cookie']) {
      headers['Cookie'] = cookieHeader;
    }

    // Body formatting
    let bodyPayload: string | undefined;
    if (options.body !== undefined) {
      if (typeof options.body === 'string') {
        bodyPayload = options.body;
      } else {
        bodyPayload = JSON.stringify(options.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const fullUrl = path.startsWith('http')
      ? path
      : `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const res = await fetch(fullUrl, {
      method,
      headers,
      body: bodyPayload,
    });

    this.parseSetCookies(res.headers);

    const rawText = await res.text();
    let data: any = undefined;
    let error: any = undefined;

    if (rawText) {
      try {
        const json = JSON.parse(rawText);
        if (json.error) {
          error = json.error;
        }
        data = json;
      } catch {
        // Raw text response
      }
    }

    const cookieObj: Record<string, string> = {};
    this.cookies.forEach((v, k) => {
      cookieObj[k] = v;
    });

    return {
      status: res.status,
      headers: res.headers,
      data,
      error,
      cookies: cookieObj,
      rawText,
    };
  }

  get<T = any>(path: string, options?: Parameters<TestApiClient['request']>[1]) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = any>(path: string, body?: any, options?: Parameters<TestApiClient['request']>[1]) {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  patch<T = any>(path: string, body?: any, options?: Parameters<TestApiClient['request']>[1]) {
    return this.request<T>(path, { ...options, method: 'PATCH', body });
  }

  put<T = any>(path: string, body?: any, options?: Parameters<TestApiClient['request']>[1]) {
    return this.request<T>(path, { ...options, method: 'PUT', body });
  }

  delete<T = any>(path: string, options?: Parameters<TestApiClient['request']>[1]) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }
}
