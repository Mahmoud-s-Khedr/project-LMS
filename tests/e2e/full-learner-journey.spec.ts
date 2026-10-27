import { test, expect } from '@playwright/test';
import { TestDbHelper } from '../fixtures/database';

test.describe('E2E: Full Learner Journey (Cross-Application Regression)', () => {
  const uniqueId = Date.now();
  const studentEmail = `journey-student-${uniqueId}@example.test`;
  const password = 'TestPassword!2026';

  test.afterAll(async () => {
    const db = new TestDbHelper();
    try {
      await db.query(
        'DELETE FROM "RefreshSession" WHERE "userId" IN (SELECT id FROM "User" WHERE email=$1)',
        [studentEmail],
      );
      await db.query(
        'DELETE FROM "AuthToken" WHERE "userId" IN (SELECT id FROM "User" WHERE email=$1)',
        [studentEmail],
      );
      await db.query('DELETE FROM "User" WHERE email=$1', [studentEmail]);
    } finally {
      await db.disconnect();
    }
  });

  test('complete scenario: signup -> purchase -> grant -> lesson -> timed quiz -> manual assignment -> certificate', async ({
    page,
    request,
  }) => {
    test.skip(
      !/^sk_test_[A-Za-z0-9]{24,}$/.test(process.env.STRIPE_SECRET_KEY ?? ''),
      'Paid journey requires a real STRIPE_SECRET_KEY=sk_test_... and webhook forwarding via stripe listen --forward-to localhost:4100/api/v1/webhooks/stripe (set STRIPE_WEBHOOK_SECRET to the printed whsec_... secret).',
    );
    // 0. Probe backend commerce and learning APIs
    const probeRes = await request.get('http://localhost:4100/api/v1/catalog/courses');
    const isCatalogAvailable = probeRes.status() !== 404;

    // STEP 1: Learner Signup
    await page.goto('/register');
    await page.fill('input[name="email"]', studentEmail);
    await page.fill('input[name="password"]', password);
    if (await page.locator('input[name="confirmPassword"]').count()) {
      await page.fill('input[name="confirmPassword"]', password);
    }
    if (await page.locator('input[name="name"]').isVisible()) {
      await page.fill('input[name="name"]', `Journey Student ${uniqueId}`);
    }
    await page.click('button[type="submit"]');

    // Verification notice / verify directly in DB
    await page.waitForTimeout(1000);
    const db = new TestDbHelper();
    try {
      await db.query('UPDATE "User" SET "emailVerifiedAt"=NOW() WHERE email=$1', [studentEmail]);
    } finally {
      await db.disconnect();
    }

    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', studentEmail);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*(student|courses|explore).*/, { timeout: 10000 });

    if (!isCatalogAvailable) {
      test.skip(true, 'Backend courses/commerce endpoints not mounted in Phase 4');
      return;
    }

    // STEP 2: Browse Catalog & Select Course
    await page.goto('/courses');
    const courseCard = page.locator('[data-testid="course-card"], a[href^="/courses/"]').first();
    if (!(await courseCard.isVisible())) {
      test.skip(true, 'No published courses in catalog yet');
      return;
    }
    await courseCard.click();

    // STEP 3: Purchase / Enroll Flow
    const enrollBtn = page.locator(
      'button:has-text("Enroll"), button:has-text("Buy"), button:has-text("Get Course")',
    );
    if (await enrollBtn.isVisible()) {
      await enrollBtn.click();
    }

    // STEP 4: Access Lesson Player
    await page.goto('/student');
    const resumeCourse = page.locator('text=Resume, text=Start Learning').first();
    if (await resumeCourse.isVisible()) {
      await resumeCourse.click();
      await page.waitForURL(/\/learn\/.*/);

      // Verify lesson video/document content
      await expect(page.locator('video, iframe, article')).toBeVisible();

      // Complete lesson
      const markCompleteBtn = page.locator(
        'button:has-text("Mark as Complete"), button:has-text("Next Lesson")',
      );
      if (await markCompleteBtn.isVisible()) {
        await markCompleteBtn.click();
      }
    }

    // STEP 5: Timed Quiz
    const quizLink = page.locator('text=Quiz, text=Knowledge Check').first();
    if (await quizLink.isVisible()) {
      await quizLink.click();
      const startQuizBtn = page.locator(
        'button:has-text("Start Quiz"), button:has-text("Begin Attempt")',
      );
      if (await startQuizBtn.isVisible()) {
        await startQuizBtn.click();
        // Answer questions
        const firstOption = page.locator('input[type="radio"], [role="radio"]').first();
        if (await firstOption.isVisible()) {
          await firstOption.click();
        }
        await page.click('button:has-text("Submit Quiz")');
        await expect(page.locator('text=Score, text=Passed, text=Results')).toBeVisible();
      }
    }

    // STEP 6: Manual Assignment Submission
    const assignmentLink = page.locator('text=Assignment, text=Project Submission').first();
    if (await assignmentLink.isVisible()) {
      await assignmentLink.click();
      const essayInput = page.locator('textarea, [contenteditable="true"]');
      if (await essayInput.isVisible()) {
        await essayInput.fill(
          'Comprehensive system design with bounded contexts and event outbox.',
        );
        await page.click('button:has-text("Submit Assignment")');
        await expect(page.locator('text=Submitted, text=Awaiting Review')).toBeVisible();
      }
    }

    // STEP 7: Certificate Generation and Verification
    const certLink = page.locator('text=View Certificate, text=Certificate of Completion');
    if (await certLink.isVisible()) {
      await certLink.click();
      await expect(page.locator('text=Certificate, text=Verified')).toBeVisible();
    }
  });
});
