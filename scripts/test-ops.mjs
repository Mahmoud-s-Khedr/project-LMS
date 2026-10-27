import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('CI provisions integration dependencies before suites and applies migrations before status', () => {
  const validate = workflow.split('\n  e2e:')[0];
  assert.ok(validate.indexOf('prisma migrate deploy') < validate.indexOf('prisma migrate status'));
  for (const prerequisite of [
    'minio mailpit',
    'pnpm storage:bootstrap',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ]) {
    assert.ok(validate.includes(prerequisite), prerequisite);
  }
  assert.ok(
    validate.indexOf('pnpm storage:bootstrap') < validate.indexOf('node scripts/test-postgres.mjs'),
  );
  assert.equal(pkg.scripts['test:db'], 'node scripts/test-postgres.mjs');
});

test('browser CI runs against seeded services with a report and optional Stripe listener', () => {
  const e2e = workflow.split('\n  e2e:')[1];
  assert.ok(e2e);
  for (const step of [
    'prisma migrate deploy',
    'minio mailpit',
    'pnpm storage:bootstrap',
    'pnpm db:seed',
    'playwright install --with-deps chromium',
    'pnpm build',
    'pnpm test:e2e --workers=1',
    'actions/upload-artifact@v4',
    'stripe/stripe-cli',
  ]) {
    assert.ok(e2e.includes(step), step);
  }
});
