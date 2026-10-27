import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { TestApiClient } from '../fixtures/client';
import { TestDbHelper } from '../fixtures/database';

const rich = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const password = 'TestPassword!2026';
async function login(page: Page, email: string, secret = password) {
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/(student|instructor|admin)$/);
}
async function call(client: TestApiClient, path: string, method = 'GET', body?: unknown) {
  const response = await client.request(path, { method, body });
  expect(response.status, `${method} ${path}: ${response.rawText}`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${method} ${path}: ${response.rawText}`).toBeLessThan(300);
  return response.data?.data;
}

test('free learner completes lesson, timed quiz and uploaded assignment; worker issues one private certificate and email', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const suffix = randomUUID();
  const email = `free-journey-${suffix}@example.test`;
  const name = `Journey Learner ${suffix}`;
  const title = `Free Journey ${suffix}`;
  const instructor = new TestApiClient();
  const session = await call(instructor, '/auth/login', 'POST', {
    email: 'instructor@example.test',
    password: 'Lms-demo-only!2026',
  });
  instructor.accessToken = session.accessToken;
  const workspaces = await call(instructor, '/me/workspaces');
  const workspaceId = workspaces[0].id;
  const base = `/workspaces/${workspaceId}`;
  const course = await call(instructor, `${base}/courses`, 'POST', {
    slug: `journey-${suffix}`,
    title,
    summary: 'Complete free learner journey',
    description: rich('Learn, demonstrate and certify.'),
    isFree: true,
  });
  const coursePath = `${base}/courses/${course.id}`;
  const section = await call(instructor, `${coursePath}/sections`, 'POST', {
    title: 'Journey',
    position: 0,
  });
  const lesson = async (type: string, position: number) =>
    call(instructor, `${coursePath}/sections/${section.id}/lessons`, 'POST', {
      title: `Journey ${type}`,
      position,
      isRequired: true,
      isPreview: false,
      isPublished: true,
      estimatedMinutes: 1,
      completionRule: type === 'TEXT' ? 'ACKNOWLEDGE' : 'ASSESSMENT_PASS',
      requiredWatchPercent: 80,
      release: { releaseType: 'IMMEDIATE' },
      payload: { type, body: type === 'TEXT' ? rich('Released learning content') : {} },
    });
  const text = await lesson('TEXT', 0);
  const bank = await call(instructor, `${base}/question-banks`, 'POST', { name: title });
  const makeAssessment = async (kind: 'QUIZ' | 'ASSIGNMENT', position: number) => {
    const activity = await lesson(kind, position);
    const assessment = await call(
      instructor,
      `${coursePath}/lessons/${activity.id}/assessment`,
      'POST',
      { kind, title: `Journey ${kind}` },
    );
    const type = kind === 'QUIZ' ? 'TRUE_FALSE' : 'FILE_UPLOAD';
    const question = await call(instructor, `${base}/question-banks/${bank.id}/questions`, 'POST', {
      title: `Journey ${type}`,
      tags: [],
      payload: {
        type,
        prompt: rich(kind === 'QUIZ' ? 'Learning is useful.' : 'Upload your work.'),
        options: [],
        explanation: null,
        defaultPoints: '10',
        answerKey: kind === 'QUIZ' ? { value: true } : {},
        gradingConfig: {},
      },
    });
    const versions = await call(instructor, `${coursePath}/assessments/${assessment.id}/versions`);
    let version = versions[0];
    const versionPath = `${coursePath}/assessments/${assessment.id}/versions/${version.id}`;
    version = await call(instructor, versionPath, 'PATCH', {
      version: version.version,
      timeLimitSeconds: kind === 'QUIZ' ? 300 : null,
      passPercent: '50',
      feedbackPolicy: 'IMMEDIATE',
      ...(kind === 'ASSIGNMENT'
        ? { rubric: { criteria: [{ id: 'work', label: 'Completed work', maxPoints: '10' }] } }
        : {}),
    });
    version = await call(instructor, `${versionPath}/questions`, 'PUT', {
      version: version.version,
      questions: [
        {
          questionVersionId: question.latestVersion.id,
          points: '10',
          position: 0,
          isRequired: true,
        },
      ],
    });
    await call(instructor, `${versionPath}/publish`, 'POST', {});
    return { ...assessment, activityId: activity.id };
  };
  const quiz = await makeAssessment('QUIZ', 1);
  const assignment = await makeAssessment('ASSIGNMENT', 2);
  await call(instructor, `${coursePath}/certificate-templates`, 'POST', {
    name: title,
    issuerName: 'Journey Academy',
    layout: {
      orientation: 'LANDSCAPE',
      title: 'Completion',
      body: 'Successfully completed the course.',
      accentColor: '#123456',
    },
    backgroundAssetId: null,
    isActive: true,
  });
  const current = await call(instructor, coursePath);
  await call(instructor, `${coursePath}/publish`, 'POST', { version: current.version });

  // Registration is real; the only direct database write is email verification.
  const student = new TestApiClient();
  await call(student, '/auth/register', 'POST', {
    email,
    password,
    name,
    onboardingMode: 'STUDENT',
  });
  const db = new TestDbHelper();
  try {
    await db.query('UPDATE "User" SET "emailVerifiedAt"=NOW() WHERE email=$1', [email]);
    await login(page, email);
    await page.goto(`/courses/${course.id}`);
    await page.waitForLoadState('networkidle');
    const enrolled = page.waitForResponse(
      (r) => r.url().endsWith(`/courses/${course.id}/enroll`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Enroll for free', exact: true }).click();
    expect((await enrolled).status()).toBe(201);
    await page.waitForURL(/\/learn\/[0-9a-f-]+$/);
    const enrollmentId = page.url().split('/').pop()!;
    await page.getByRole('link', { name: 'Start Course', exact: true }).click();
    await expect(page.getByTestId('text-lesson-viewer')).toContainText('Released learning content');
    await page.getByTestId('mark-complete-button').click();
    await expect(page.getByTestId('mark-complete-button')).toHaveText('Completed');
    const [progress] = await db.query(
      'SELECT "completedAt" FROM "LessonProgress" WHERE "enrollmentId"=$1 AND "lessonId"=$2',
      [enrollmentId, text.id],
    );
    expect(progress.completedAt).toBeTruthy();

    const open = async (activityId: string) => {
      await page.getByTestId(`sidebar-lesson-${activityId}`).click();
      await page.getByTestId('start-assessment-button').click();
      const started = page.waitForResponse(
        (r) => r.url().endsWith('/attempts') && r.request().method() === 'POST',
      );
      await page.getByTestId('start-attempt-button').click();
      const response = await started;
      expect(response.status()).toBe(201);
      return (await response.json()).data;
    };
    const submit = async () => {
      await page.getByTestId('submit-attempt-button').click();
      await page.getByTestId('confirm-submit-button').click();
    };
    const quizAttempt = await open(quiz.activityId);
    expect(Date.parse(quizAttempt.deadlineAt)).toBeGreaterThan(Date.now());
    const savedQuiz = page.waitForResponse(
      (r) => r.url().includes('/answers/') && r.request().method() === 'PUT',
    );
    await page.getByTestId('true-option-label').click();
    expect((await savedQuiz).status()).toBe(200);
    await submit();
    await expect(page.getByTestId('assessment-result-view')).toContainText('Assessment Passed');
    await page.goto(`/learn/${enrollmentId}/lessons/${text.id}`);
    const attempt = await open(assignment.activityId);
    const savedFile = page.waitForResponse(
      (r) => r.url().includes('/answers/') && r.request().method() === 'PUT',
      { timeout: 45000 },
    );
    await page.getByTestId('file-upload-input').setInputFiles({
      name: 'journey.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Completed learner project.\n'),
    });
    expect((await savedFile).status()).toBe(200);
    await expect(page.getByText('journey.txt', { exact: true })).toBeVisible();
    await submit();
    await expect(page.getByTestId('grading-pending-view')).toBeVisible();
    expect(
      await db.query('SELECT id FROM "Certificate" WHERE "enrollmentId"=$1', [enrollmentId]),
    ).toHaveLength(0);

    const staffContext = await browser.newContext();
    try {
      const staff = await staffContext.newPage();
      await login(staff, 'instructor@example.test', 'Lms-demo-only!2026');
      await staff.goto(`/instructor/grading?courseId=${course.id}&assessmentId=${assignment.id}`);
      await staff.locator(`a[href^="/instructor/grading/${attempt.attemptId}?"]`).click();
      await staff.getByLabel('Completed work', { exact: false }).fill('10');
      await staff
        .getByLabel('Overall Evaluation Justification', { exact: false })
        .fill('Reviewed uploaded project');
      const graded = staff.waitForResponse(
        (r) =>
          r.url().endsWith(`/attempts/${attempt.attemptId}/grades`) &&
          r.request().method() === 'POST',
      );
      await staff.getByRole('button', { name: 'Submit Final Grade', exact: true }).click();
      expect((await graded).status()).toBe(200);
    } finally {
      await staffContext.close();
    }

    await expect
      .poll(
        async () => {
          const rows = await db.query(
            'SELECT "documentAssetId" FROM "Certificate" WHERE "enrollmentId"=$1',
            [enrollmentId],
          );
          return rows.map((r) => Boolean(r.documentAssetId));
        },
        { timeout: 90000 },
      )
      .toEqual([true]);
    const [certificate] = await db.query('SELECT * FROM "Certificate" WHERE "enrollmentId"=$1', [
      enrollmentId,
    ]);
    const [completion] = await db.query('SELECT "completedAt" FROM "Enrollment" WHERE id=$1', [
      enrollmentId,
    ]);
    expect(completion.completedAt).toBeTruthy();
    const events = await db.findOutboxEvents(enrollmentId);
    expect(events.filter((e) => e.type === 'course.completed.v1')).toHaveLength(1);
    await page.goto('/student/certificates');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const capability = page.waitForResponse((r) =>
      r.url().endsWith(`/certificates/${certificate.id}/download`),
    );
    await page.getByRole('button', { name: 'Download PDF', exact: true }).click();
    const signed = await capability;
    expect(signed.status()).toBe(200);
    const pdf = await request.get((await signed.json()).data.url);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    const publicContext = await browser.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.goto(`/verify/${certificate.verificationCode}`);
      await expect(
        publicPage.getByText('Verified Valid Credential', { exact: true }),
      ).toBeVisible();
      const body = await publicPage.locator('body').innerText();
      expect(body).not.toContain(email);
      expect(body).not.toContain(name);
      const verification = await request.get(
        `http://localhost:4100/api/v1/certificates/verify/${certificate.verificationCode}`,
      );
      expect(Object.keys((await verification.json()).data).sort()).toEqual([
        'courseTitle',
        'issuedAt',
        'issuerName',
        'maskedRecipientName',
        'status',
      ]);
    } finally {
      await publicContext.close();
    }
    await expect
      .poll(
        async () => {
          const response = await request.get(
            `http://localhost:58025/api/v1/search?query=${encodeURIComponent(`to:${email} subject:certificate`)}`,
          );
          expect(response.status()).toBe(200);
          return (await response.json()).messages.length;
        },
        { timeout: 60000 },
      )
      .toBe(1);
    expect(
      await db.query('SELECT id FROM "Certificate" WHERE "enrollmentId"=$1', [enrollmentId]),
    ).toHaveLength(1);
  } finally {
    await db.disconnect();
  }
});
