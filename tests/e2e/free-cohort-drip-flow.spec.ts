import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { TestDbHelper } from '../fixtures/database';

const api = 'http://localhost:4100/api/v1';

test('free course opens the learner player without a checkout redirect', async ({
  page,
  request,
}) => {
  const response = await request.get(`${api}/catalog/courses`);
  expect(response.status()).toBe(200);
  const course = (await response.json()).data.find(
    (c: { isFree: boolean; deliveryMode: string }) => c.isFree && c.deliveryMode === 'SELF_PACED',
  );
  expect(course).toBeTruthy();
  await page.goto('/login');
  await page.getByLabel('Email address', { exact: true }).fill('other-student@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/student');
  await page.goto(`/courses/${course.id}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  const enroll = page.getByRole('button', { name: 'Enroll for free', exact: true });
  const existing = page.getByRole('link', { name: 'Go to course', exact: true });
  await expect(enroll.or(existing)).toBeVisible();
  if (await enroll.isVisible()) {
    const enrolled = page.waitForResponse(
      (r) => r.url().endsWith(`/courses/${course.id}/enroll`) && r.request().method() === 'POST',
    );
    await enroll.click();
    expect((await enrolled).status()).toBe(201);
  } else await existing.click();
  await page.waitForURL(/\/learn\/[0-9a-f-]+$/);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText('Course Unavailable', { exact: true })).toHaveCount(0);
});

test('future lesson remains locked in the learner outline and direct lesson API', async ({
  page,
}) => {
  const db = new TestDbHelper();
  const id = randomUUID();
  const title = `INT-3 future lesson ${id}`;
  try {
    const [scope] = await db.query(
      `SELECT e.id, e."workspaceId", e."courseId", s.id AS "sectionId" FROM "Enrollment" e JOIN "User" u ON u.id=e."userId" JOIN "Course" c ON c.id=e."courseId" JOIN "Section" s ON s."courseId"=c.id WHERE u.email='student@example.test' AND c."isFree"=true LIMIT 1`,
    );
    expect(scope).toBeTruthy();
    await db.query(
      `INSERT INTO "Lesson" (id,"workspaceId","courseId","sectionId",title,type,position,body,"isRequired","isPublished","releaseType","releaseAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'TEXT',999999,$6,false,true,'ABSOLUTE',now()+interval '1 day',now())`,
      [
        id,
        scope.workspaceId,
        scope.courseId,
        scope.sectionId,
        title,
        JSON.stringify({ document: { type: 'doc', content: [] } }),
      ],
    );
    await page.goto('/login');
    await page.getByLabel('Email address', { exact: true }).fill('student@example.test');
    await page.getByLabel('Password', { exact: true }).fill('Lms-demo-only!2026');
    const login = page.waitForResponse(
      (r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const result = await login;
    expect(result.status()).toBe(200);
    const token = (await result.json()).data.accessToken;
    await page.waitForURL('**/student');
    const outline = page.waitForResponse(
      (r) => r.url().endsWith(`/me/enrollments/${scope.id}/outline`) && r.status() === 200,
    );
    await page.goto(`/learn/${scope.id}`);
    const data = (await (await outline).json()).data;
    const lesson = data.sections
      .flatMap((s: { lessons: { lessonId: string }[] }) => s.lessons)
      .find((l: { lessonId: string }) => l.lessonId === id);
    expect(lesson.access.allowed).toBe(false);
    expect(lesson.access.reason).toBe('NOT_RELEASED');
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const denied = await page.request.get(`${api}/me/enrollments/${scope.id}/lessons/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(denied.status()).toBe(403);
  } finally {
    await db.query('DELETE FROM "Lesson" WHERE id=$1', [id]);
    await db.disconnect();
  }
});
