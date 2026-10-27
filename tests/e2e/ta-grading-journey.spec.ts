import { test, expect } from '@playwright/test';
import { TestDbHelper } from '../fixtures/database';

test('assigned TA can load the grading queue for a persisted assessment', async ({ page }) => {
  test.setTimeout(120000);
  const db = new TestDbHelper();
  let scope;
  try {
    [scope] = await db.query(
      `SELECT a.id, a."workspaceId", a."courseId" FROM "Assessment" a JOIN "CourseStaff" s ON s."courseId"=a."courseId" JOIN "User" u ON u.id=s."userId" WHERE u.email='ta@example.test' AND a.kind='ASSIGNMENT' AND a."deletedAt" IS NULL LIMIT 1`,
    );
  } finally {
    await db.disconnect();
  }
  expect(scope).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill('ta@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
  let login = page.waitForResponse(
    (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const first = await login;
  if (first.status() === 429) {
    // Keep the real login throttle enabled while running six independent browser logins.
    await page.waitForTimeout((Number(first.headers()['retry-after'] ?? 60) + 1) * 1000);
    login = page.waitForResponse(
      (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await login).status()).toBe(200);
  } else expect(first.status()).toBe(200);
  await page.waitForURL(/\/(student|instructor)$/);
  const response = page.waitForResponse(
    (r) =>
      r.url().includes(`/courses/${scope.courseId}/assessments/${scope.id}/attempts`) &&
      r.status() === 200,
  );
  await page.goto(`/instructor/grading?courseId=${scope.courseId}&assessmentId=${scope.id}`);
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Manual Grading Queue' })).toBeVisible();
  await expect(page.getByText('Failed to load grading queue:', { exact: false })).toHaveCount(0);
});
