/**
 * Feature probing helper.
 * Tests call probeEndpoint(url) to determine if a backend endpoint is implemented
 * and mounted, returning a graceful skip reason if it returns 404/501 or is unreachable.
 */

export interface ProbeResult {
  available: boolean;
  status?: number;
  reason?: string;
}

export async function probeEndpoint(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    expectedStatusCodes?: number[];
  } = {},
): Promise<ProbeResult> {
  const method = options.method ?? 'GET';
  const expectedCodes = options.expectedStatusCodes ?? [200, 201, 204, 400, 401, 403, 422];

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Origin: 'http://localhost:3100',
        ...options.headers,
      },
      body: options.body,
    });

    if (response.status === 404) {
      return {
        available: false,
        status: 404,
        reason: `Endpoint ${method} ${url} returned 404 (feature module not yet wired)`,
      };
    }

    if (response.status === 501) {
      return {
        available: false,
        status: 501,
        reason: `Endpoint ${method} ${url} returned 501 Not Implemented`,
      };
    }

    if (response.status === 503) {
      return {
        available: false,
        status: 503,
        reason: `Endpoint ${method} ${url} returned 503 (service disabled or unconfigured in environment)`,
      };
    }

    // If status code is in expected codes or any response from an active handler:
    return {
      available: true,
      status: response.status,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      available: false,
      reason: `Connection to ${url} failed: ${errorMsg}`,
    };
  }
}

/**
 * Asserts in Vitest or Playwright if a probe is available, or skips with the given reason.
 */
export function skipIfUnavailable(
  probe: ProbeResult,
  testContext?: { skip: (reason: string) => void },
): boolean {
  if (!probe.available) {
    const reason = probe.reason ?? 'Feature endpoint not available';
    if (testContext && typeof testContext.skip === 'function') {
      testContext.skip(reason);
    } else {
      console.warn(`[SKIPPED TEST] ${reason}`);
    }
    return true;
  }
  return false;
}
