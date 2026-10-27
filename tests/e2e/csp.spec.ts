import { test, expect, type Page } from '@playwright/test';

interface CspViolation {
  blockedURI: string;
  violatedDirective: string;
  originalPolicy: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  sample?: string;
}

declare global {
  interface Window {
    __cspViolations: CspViolation[];
  }
}

/**
 * Setup CSP violation monitoring on the page:
 * - Collects 'securitypolicyviolation' DOM events
 * - Collects console errors relating to CSP
 */
function setupCspTracking(page: Page) {
  const violations: CspViolation[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (
        text.includes('Content Security Policy') ||
        text.includes('Content-Security-Policy') ||
        text.includes('securitypolicyviolation') ||
        text.includes('CSP') ||
        text.includes('refused to') ||
        text.includes('violates the following Content Security Policy directive')
      ) {
        consoleErrors.push(text);
      }
    }
  });

  page.on('pageerror', (err) => {
    if (err.message.includes('Content Security Policy') || err.message.includes('CSP')) {
      consoleErrors.push(err.message);
    }
  });

  return {
    async init() {
      await page.addInitScript(() => {
        window.__cspViolations = [];
        window.addEventListener('securitypolicyviolation', (e) => {
          window.__cspViolations.push({
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            originalPolicy: e.originalPolicy,
            sourceFile: (e as any).sourceFile,
            lineNumber: (e as any).lineNumber,
            columnNumber: (e as any).columnNumber,
            sample: (e as any).sample,
          });
        });
      });
    },
    async getViolations(): Promise<{ domViolations: CspViolation[]; consoleErrors: string[] }> {
      const domViolations = await page
        .evaluate(() => window.__cspViolations || [])
        .catch(() => [] as CspViolation[]);
      return { domViolations, consoleErrors };
    },
  };
}

test.describe('Strict Content Security Policy (FIX2-CSP)', () => {
  test('landing page serves strict CSP header and has zero CSP violations', async ({ page }) => {
    const tracker = setupCspTracking(page);
    await tracker.init();

    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const csp = response!.headers()['content-security-policy'];
    expect(csp).toBeDefined();

    // Verify directives
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");

    // Wait for hydration and dynamic scripts
    await page.waitForLoadState('networkidle').catch(() => {});

    const { domViolations, consoleErrors } = await tracker.getViolations();
    expect(domViolations, `DOM CSP violations on /: ${JSON.stringify(domViolations)}`).toEqual([]);
    expect(consoleErrors, `Console CSP errors on /: ${JSON.stringify(consoleErrors)}`).toEqual([]);
  });

  test('login page and authentication flow execute without CSP violations', async ({ page }) => {
    const tracker = setupCspTracking(page);
    await tracker.init();

    const response = await page.goto('/login');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const csp = response!.headers()['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain('strict-dynamic');

    await page.getByLabel('Email address', { exact: true }).fill('student@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/student');

    await page.waitForLoadState('networkidle').catch(() => {});

    const { domViolations, consoleErrors } = await tracker.getViolations();
    expect(domViolations, `DOM CSP violations on login: ${JSON.stringify(domViolations)}`).toEqual(
      [],
    );
    expect(consoleErrors, `Console CSP errors on login: ${JSON.stringify(consoleErrors)}`).toEqual(
      [],
    );
  });

  test('dashboards (student and instructor) render without CSP violations', async ({ page }) => {
    const tracker = setupCspTracking(page);
    await tracker.init();

    // Log in as instructor
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill('instructor@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/(student|instructor|admin)$/);

    await page.waitForLoadState('networkidle').catch(() => {});

    let result = await tracker.getViolations();
    expect(
      result.domViolations,
      `Violations on dashboard: ${JSON.stringify(result.domViolations)}`,
    ).toEqual([]);
    expect(
      result.consoleErrors,
      `Errors on dashboard: ${JSON.stringify(result.consoleErrors)}`,
    ).toEqual([]);

    // Check instructor courses subpage
    await page.goto('/instructor/courses');
    await page.waitForLoadState('networkidle').catch(() => {});

    result = await tracker.getViolations();
    expect(
      result.domViolations,
      `Violations on /instructor/courses: ${JSON.stringify(result.domViolations)}`,
    ).toEqual([]);
    expect(
      result.consoleErrors,
      `Errors on /instructor/courses: ${JSON.stringify(result.consoleErrors)}`,
    ).toEqual([]);
  });

  test('course catalog, player with media, and certificate view load without CSP violations', async ({
    page,
    request,
  }) => {
    const tracker = setupCspTracking(page);
    await tracker.init();

    // 1. Course catalog
    const catalogRes = await page.goto('/courses');
    expect(catalogRes).not.toBeNull();
    expect(catalogRes!.status()).toBe(200);
    await page.waitForLoadState('networkidle').catch(() => {});

    let result = await tracker.getViolations();
    expect(
      result.domViolations,
      `Violations on /courses: ${JSON.stringify(result.domViolations)}`,
    ).toEqual([]);
    expect(
      result.consoleErrors,
      `Errors on /courses: ${JSON.stringify(result.consoleErrors)}`,
    ).toEqual([]);

    // 2. Public certificate verifier
    const verifyRes = await page.goto('/verify');
    expect(verifyRes).not.toBeNull();
    expect(verifyRes!.status()).toBe(200);
    await page.waitForLoadState('networkidle').catch(() => {});

    result = await tracker.getViolations();
    expect(
      result.domViolations,
      `Violations on /verify: ${JSON.stringify(result.domViolations)}`,
    ).toEqual([]);
    expect(
      result.consoleErrors,
      `Errors on /verify: ${JSON.stringify(result.consoleErrors)}`,
    ).toEqual([]);

    // 3. Login as student to access student certificates and course player
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill('student@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/student');

    // Student certificates page
    await page.goto('/student/certificates');
    await page.waitForLoadState('networkidle').catch(() => {});

    result = await tracker.getViolations();
    expect(
      result.domViolations,
      `Violations on /student/certificates: ${JSON.stringify(result.domViolations)}`,
    ).toEqual([]);
    expect(
      result.consoleErrors,
      `Errors on /student/certificates: ${JSON.stringify(result.consoleErrors)}`,
    ).toEqual([]);

    // Find a course from catalog API to view course details and player
    const apiCourses = await request.get('http://localhost:4100/api/v1/catalog/courses');
    if (apiCourses.ok()) {
      const { data: courses } = await apiCourses.json();
      if (courses && courses.length > 0) {
        const course = courses[0];
        await page.goto(`/courses/${course.id}`);
        await page.waitForLoadState('networkidle').catch(() => {});

        result = await tracker.getViolations();
        expect(
          result.domViolations,
          `Violations on /courses/${course.id}: ${JSON.stringify(result.domViolations)}`,
        ).toEqual([]);
        expect(
          result.consoleErrors,
          `Errors on /courses/${course.id}: ${JSON.stringify(result.consoleErrors)}`,
        ).toEqual([]);
      }
    }
  });
});
