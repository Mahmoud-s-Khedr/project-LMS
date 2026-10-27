import { test, expect } from '@playwright/test';
import { TestDbHelper } from '../fixtures/database';

test.describe('E2E: Authentication Journey', () => {
  const uniqueId = Date.now();
  const testEmail = `student-${uniqueId}@example.test`;
  const testPassword = 'TestPassword!2026';
  const testName = `Student ${uniqueId}`;

  test.afterAll(async () => {
    const db = new TestDbHelper();
    try {
      await db.query(
        'DELETE FROM "AuthToken" WHERE "userId" IN (SELECT id FROM "User" WHERE email=$1)',
        [testEmail],
      );
      await db.query('DELETE FROM "User" WHERE email=$1', [testEmail]);
    } finally {
      await db.disconnect();
    }
  });

  test('visitor can navigate public landing, register as student, and see email verification notice', async ({
    page,
  }) => {
    // 1. Visit landing page
    await page.goto('/');
    await expect(page).toHaveTitle(/LMS|Learn|Course/i);

    // 2. Navigate to register
    await page.goto('/register');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Create your account' }),
    ).toBeVisible();

    // 3. Fill registration form
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    if (await page.locator('input[name="confirmPassword"]').count())
      await page.fill('input[name="confirmPassword"]', testPassword);
    if (await page.locator('input[name="name"]').isVisible()) {
      await page.fill('input[name="name"]', testName);
    }

    // 4. Submit
    await page.click('button[type="submit"]');

    // 5. Expect confirmation message or redirect to verification notice
    await expect(
      page.getByRole('heading', { name: 'Check your email for next steps' }),
    ).toBeVisible({ timeout: 10000 });
  });

  test('seeded verified student can log in, establish session hint, and access student dashboard', async ({
    page,
    context,
  }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', 'student@example.test');
    await page.fill('input[name="password"]', 'Lms-demo-only!2026');
    if (await page.locator('input[name="confirmPassword"]').count())
      await page.fill('input[name="confirmPassword"]', 'Lms-demo-only!2026');
    await page.click('button[type="submit"]');

    // After login, should redirect to /student or dashboard
    await page.waitForURL(/.*(student|dashboard|courses).*/, { timeout: 10000 });

    // Verify session cookie is set
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'lms_session');
    expect(sessionCookie).toBeDefined();

    // Student dashboard components visible
    await expect(page.locator('main')).toBeVisible();
  });

  test('user can log out and session cookie is cleared', async ({ page, context }) => {
    // Pre-seed session or login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'student@example.test');
    await page.fill('input[name="password"]', 'Lms-demo-only!2026');
    if (await page.locator('input[name="confirmPassword"]').count())
      await page.fill('input[name="confirmPassword"]', 'Lms-demo-only!2026');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*(student|dashboard|courses).*/);

    await page.getByRole('button', { name: 'Open user account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();

    // Verify redirected to public route
    await page.waitForURL(/\/(login|\/)?$/);

    // Verify session cookie cleared
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === 'lms_session');
    expect(sessionCookie?.value ?? '').toBe('');
  });
});
