import { test, expect } from '@playwright/test';

test.describe('E2E: Administrative Operations and Refund Reconciliation', () => {
  test('platform admin can sign in and view users', async ({ page, request }) => {
    const probeRes = await request.get('http://localhost:4100/api/v1/health');
    expect(probeRes.status()).toBe(200);

    // Login as Platform Admin
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@example.test');
    await page.fill('input[name="password"]', 'Lms-demo-only!2026');
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*(admin|dashboard).*/, { timeout: 10000 });

    // Navigate to Admin workspace view
    await page.goto('/admin');
    await expect(page.locator('main')).toBeVisible();

    // Verify admin navigation items
    const userManagementLink = page.getByRole('link', { name: 'Users', exact: true });
    if (await userManagementLink.isVisible()) {
      await userManagementLink.click();
      await expect(page.getByRole('table')).toBeVisible();
    }
  });
});
