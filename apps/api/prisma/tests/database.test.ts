import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { config } from 'dotenv';
import { Client, DatabaseError } from 'pg';
import { fixtureId as id, fixtureTime } from '../fixtures/ids';

config({ path: ['.env', '../../.env'] });
const apiDirectory = resolve(__dirname, '../..');
const source = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) || source.port !== '55432') {
  throw new Error('Database tests require the local LMS PostgreSQL on port 55432');
}
const database = `lms_test_p1d_${process.pid}`;
const testUrl = new URL(source);
testUrl.pathname = `/${database}`;
const adminUrl = new URL(source);
adminUrl.pathname = '/postgres';
const admin = new Client({ connectionString: adminUrl.toString() });
const db = new Client({ connectionString: testUrl.toString() });
let created = false;

function prisma(...args: string[]): void {
  const result = spawnSync('pnpm', ['exec', 'prisma', ...args], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: testUrl.toString() },
  });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}

before(async () => {
  await admin.connect();
  const version = await admin.query<{ server_version_num: string }>('SHOW server_version_num');
  assert.equal(Math.floor(Number(version.rows[0]?.server_version_num) / 10000), 16);
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  prisma('migrate', 'deploy');
  prisma('migrate', 'status');
  prisma('db', 'seed');
  prisma('generate');
  await db.connect();
});

after(async () => {
  await db.end();
  try {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

async function reject(
  sql: string,
  params: unknown[],
  code: string,
  constraint: string,
): Promise<void> {
  await db.query('BEGIN');
  try {
    await assert.rejects(db.query(sql, params), (error: unknown) => {
      assert.ok(error instanceof DatabaseError);
      assert.equal(error.code, code);
      assert.equal(error.constraint, constraint);
      return true;
    });
  } finally {
    await db.query('ROLLBACK');
  }
}

// Tests execute real PostgreSQL writes, then roll back; no ORM validation masks DB behavior.
const invalidUpdates: [string, string, unknown, string][] = [
  ['User', 'email', ' Student@example.test ', 'User_email_normalized'],
  [
    'WorkspaceInvitation',
    'email',
    ' INVITEE@example.test ',
    'WorkspaceInvitation_email_normalized',
  ],
  ['User', 'platformRole', 'ADMIN', 'user_platform_role'],
  ['WorkspaceMember', 'role', 'SUPER_ADMIN', 'WorkspaceMember_tenant_role'],
  ['WorkspaceInvitation', 'role', 'SUPER_ADMIN', 'WorkspaceInvitation_tenant_role'],
  ['Workspace', 'slug', ' Demo-Academy ', 'Workspace_slug_normalized'],
  ['Course', 'slug', 'MixedCase', 'Course_slug_normalized'],
  ['Product', 'slug', 'DEMO', 'Product_slug_normalized'],
  ['Coupon', 'code', ' demo20 ', 'coupon_code_normalized'],
  ['Coupon', 'percentOff', '101', 'Coupon_percentOff_range'],
  ['Coupon', 'amountOff', 100, 'coupon_discount_shape'],
  ['Coupon', 'validUntil', new Date('2025-01-01'), 'Coupon_validFrom_validUntil_ordered'],
  ['Price', 'amount', -1, 'Price_amount_range'],
  ['Price', 'currency', 'USD', 'Price_currency_format'],
  ['Price', 'intervalCount', 0, 'Price_intervalCount_range'],
  ['Order', 'grandTotal', 4901, 'order_money_equation'],
  ['Order', 'taxTotal', -1, 'Order_taxTotal_range'],
  ['OrderItem', 'quantity', 2, 'order_item_money_equation'],
  ['OrderItem', 'totalAmount', 0, 'order_item_money_equation'],
  ['Payment', 'amount', -1, 'Payment_amount_range'],
  ['Payment', 'orderId', null, 'payment_source_present'],
  ['AssessmentVersion', 'maxAttempts', 0, 'AssessmentVersion_maxAttempts_range'],
  ['AssessmentVersion', 'timeLimitSeconds', 0, 'AssessmentVersion_timeLimitSeconds_range'],
  ['AssessmentVersion', 'passPercent', -1, 'AssessmentVersion_passPercent_range'],
  ['AssessmentPool', 'count', 0, 'AssessmentPool_count_range'],
  ['AssessmentQuestion', 'points', '-0.001', 'AssessmentQuestion_points_range'],
  ['AssessmentAttempt', 'awardedPoints', '11', 'attempt_award_bounded'],
  ['AssessmentAttempt', 'percent', '101', 'AssessmentAttempt_percent_range'],
  ['AttemptAnswer', 'awardedPoints', '-1', 'AttemptAnswer_awardedPoints_range'],
  ['QuestionVersion', 'defaultPoints', 'NaN', 'QuestionVersion_defaultPoints_range'],
  ['Enrollment', 'completionPercent', '100.01', 'Enrollment_completionPercent_range'],
  ['EnrollmentGrant', 'expiresAt', fixtureTime, 'EnrollmentGrant_startsAt_expiresAt_ordered'],
  ['Cohort', 'capacity', 0, 'Cohort_capacity_range'],
  ['Cohort', 'endsAt', fixtureTime, 'Cohort_startsAt_endsAt_ordered'],
  ['Lesson', 'releaseType', 'ABSOLUTE', 'lesson_release_shape'],
  ['EnrollmentGrant', 'orderItemId', id('order-item'), 'grant_source_shape'],
  ['EnrollmentGrant', 'source', 'MANUAL', 'grant_source_shape'],
  ['Refund', 'amount', 0, 'Refund_amount_range'],
  ['RefundItem', 'amount', 0, 'RefundItem_amount_range'],
  ['Asset', 'sizeBytes', '0', 'Asset_sizeBytes_range'],
  [
    'AssessmentAccommodation',
    'extraTimeSeconds',
    -1,
    'AssessmentAccommodation_extraTimeSeconds_range',
  ],
];

before(async () => {
  // Auxiliary valid rows needed for negative tests, distinct from seed fixtures.
  await db.query(
    `INSERT INTO "WorkspaceInvitation" (id,"workspaceId",email,role,"tokenHash","expiresAt","invitedById","updatedAt")
    VALUES ($1,$2,'invited@example.test','INSTRUCTOR',$3,'2030-01-01',$4,now())`,
    [id('test:invite'), id('academy'), 'a'.repeat(64), id('owner')],
  );
  await db.query(
    `INSERT INTO "AssessmentPool" (id,"workspaceId",position,count,"pointsEach","assessmentVersionId","bankId")
    VALUES ($1,$2,10,1,10,$3,$4)`,
    [id('test:pool'), id('academy'), id('av:QUIZ:2'), id('bank')],
  );
  await db.query(
    `INSERT INTO "Refund" (id,"workspaceId",amount,currency,reason,"paymentId","requestedById","updatedAt")
    VALUES ($1,$2,100,'usd','Test allocation',$3,$4,now())`,
    [id('test:refund'), id('academy'), id('payment'), id('owner')],
  );
  await db.query(
    `INSERT INTO "RefundItem" (id,"workspaceId",amount,"refundId","orderItemId")
    VALUES ($1,$2,100,$3,$4)`,
    [id('test:refund-item'), id('academy'), id('test:refund'), id('order-item')],
  );
  await db.query(
    `INSERT INTO "Asset" (id,"workspaceId","objectKey",bucket,filename,"mimeType","sizeBytes","uploadedById","updatedAt")
    VALUES ($1,$2,'test-only:asset','lms-private','test.txt','text/plain',1,$3,now())`,
    [id('test:asset'), id('academy'), id('instructor')],
  );
  await db.query(
    `INSERT INTO "AssessmentAccommodation" (id,"workspaceId","courseId","assessmentId","enrollmentId",reason,"grantedById","updatedAt")
    VALUES ($1,$2,$3,$4,$5,'Test timing',$6,now())`,
    [
      id('test:accommodation'),
      id('academy'),
      id('paid'),
      id('assessment:QUIZ'),
      id('enrollment:paid'),
      id('owner'),
    ],
  );
});

for (const [table, column, value, constraint] of invalidUpdates) {
  test(`rejects ${table}.${column}: ${constraint}`, async () => {
    let where = '';
    // Target a FREE grant for shape tests; historical assignment for award bounds.
    if (table === 'EnrollmentGrant') where = ` WHERE id = '${id('grant:free')}'`;
    if (table === 'Price' && column === 'intervalCount')
      where = ` WHERE id = '${id('price:plan')}'`;
    await reject(`UPDATE "${table}" SET "${column}" = $1${where}`, [value], '23514', constraint);
  });
}

test('composite tenant FK rejects a valid course ID in another workspace', async () => {
  await reject(
    'UPDATE "Section" SET "workspaceId"=$1 WHERE id=$2',
    [id('academy'), id('section:free')],
    '23503',
    'Section_workspaceId_courseId_fkey',
  );
});

test('same-course FK rejects a valid section belonging to another course', async () => {
  await reject(
    'UPDATE "Lesson" SET "sectionId"=$1, position=50 WHERE id=$2',
    [id('section:cohort'), id('intro:paid')],
    '23503',
    'Lesson_workspaceId_courseId_sectionId_fkey',
  );
});

test('at most one published assessment version, drafts and retired history remain valid', async () => {
  await reject(
    `UPDATE "AssessmentVersion" SET status='PUBLISHED' WHERE id=$1`,
    [id('av:QUIZ:1')],
    '23505',
    'one_published_assessment_version',
  );
});

test('concurrent attempt starts allow one open attempt across assessment versions', async () => {
  const sql = `INSERT INTO "AssessmentAttempt" (id,"workspaceId",number,"randomSeed","deliverySnapshot","totalPoints","courseId","assessmentId","assessmentVersionId","enrollmentId","updatedAt")
    VALUES ($1,$2,$3,'test-only','{}',10,$4,$5,$6,$7,now())`;
  const params = (number: number): unknown[] => [
    randomUUID(),
    id('academy'),
    number,
    id('paid'),
    id('assessment:QUIZ'),
    id(`av:QUIZ:${number}`),
    id('enrollment:paid'),
  ];
  const peer = new Client({ connectionString: testUrl.toString() });
  await peer.connect();
  try {
    const results = await Promise.allSettled([
      db.query(sql, params(1)),
      peer.query(sql, params(2)),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const failure = results.find((result) => result.status === 'rejected');
    assert.ok(failure?.status === 'rejected');
    assert.equal((failure.reason as DatabaseError).code, '23505');
    assert.equal(
      (failure.reason as DatabaseError).constraint,
      'one_open_attempt_per_assessment_enrollment',
    );
    await db.query(`UPDATE "AssessmentAttempt" SET status='SUBMITTED' WHERE "assessmentId"=$1`, [
      id('assessment:QUIZ'),
    ]);
    // Closing the open attempt permits a later start without erasing history.
    await db.query(sql, [
      randomUUID(),
      id('academy'),
      3,
      id('paid'),
      id('assessment:QUIZ'),
      id('av:QUIZ:2'),
      id('enrollment:paid'),
    ]);
  } finally {
    await peer.end();
  }
});

test('global preferences dedupe NULL workspace while tenant preferences are independent', async () => {
  const sql = `INSERT INTO "NotificationPreference" (id,"userId",type,channel,"workspaceId","updatedAt") VALUES ($1,$2,'course.release','EMAIL',$3,now())`;
  await db.query(sql, [randomUUID(), id('student'), null]);
  await reject(
    sql,
    [randomUUID(), id('student'), null],
    '23505',
    'global_notification_preference_unique',
  );
  await db.query(sql, [randomUUID(), id('student'), id('academy')]);
  await db.query(sql, [randomUUID(), id('student'), id('personal')]);
});

test('manual grant requires both grantor and nonblank reason', async () => {
  for (const [column, value] of [
    ['grantedById', null],
    ['reason', '   '],
  ] as const)
    await reject(
      `UPDATE "EnrollmentGrant" SET "${column}"=$1 WHERE id=$2`,
      [value, id('grant:manual:paid')],
      '23514',
      'grant_source_shape',
    );
});

test('subscription grant requires a finite expiry', async () => {
  await reject(
    'UPDATE "EnrollmentGrant" SET "expiresAt"=NULL WHERE id=$1',
    [id('grant:SUBSCRIPTION')],
    '23514',
    'grant_source_shape',
  );
});

test('fixed coupon requires currency and cannot retain percent fields', async () => {
  await reject(
    `UPDATE "Coupon" SET kind='FIXED',"percentOff"=NULL,"amountOff"=100,currency=NULL`,
    [],
    '23514',
    'coupon_discount_shape',
  );
  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE "Coupon" SET kind='FIXED',"percentOff"=NULL,"amountOff"=100,currency='usd'`,
    );
  } finally {
    await db.query('ROLLBACK');
  }
});

test('history cannot be cascade-deleted', async () => {
  await reject(
    'DELETE FROM "Order" WHERE id=$1',
    [id('order')],
    '23503',
    'OrderItem_workspaceId_orderId_fkey',
  );
  const cascades = await db.query<{ count: string }>(
    `SELECT count(*) FROM pg_constraint WHERE contype='f' AND confdeltype='c' AND connamespace='public'::regnamespace`,
  );
  assert.equal(cascades.rows[0]?.count, '0');
});

test('self prerequisites and invalid release shapes fail', async () => {
  await reject(
    `INSERT INTO "CoursePrerequisite" (id,"workspaceId","courseId","requiredCourseId","updatedAt") VALUES ($1,$2,$3,$3,now())`,
    [randomUUID(), id('academy'), id('paid')],
    '23514',
    'CoursePrerequisite_no_self_link',
  );
  await reject(
    `UPDATE "Lesson" SET "releaseType"='ENROLLMENT_OFFSET',"releaseOffsetDays"=-1 WHERE id=$1`,
    [id('intro:paid')],
    '23514',
    'Lesson_releaseOffsetDays_range',
  );
});

test('temporary negative outline positions support the transactional reorder protocol', async () => {
  await db.query('BEGIN');
  try {
    await db.query('UPDATE "Lesson" SET position=-position-1 WHERE "sectionId"=$1', [
      id('section:paid'),
    ]);
    await db.query('UPDATE "Lesson" SET position=-position-1 WHERE "sectionId"=$1', [
      id('section:paid'),
    ]);
    const count = await db.query<{ count: string }>(
      'SELECT count(*) FROM "Lesson" WHERE position<0',
    );
    assert.equal(count.rows[0]?.count, '0');
  } finally {
    await db.query('ROLLBACK');
  }
});

test('pending lookup indexes have partial predicates', async () => {
  const indexes = await db.query<{ indexdef: string }>(
    `SELECT indexdef FROM pg_indexes WHERE indexname IN ('pending_outbox_available','pending_stripe_webhook')`,
  );
  assert.equal(indexes.rowCount, 2);
  for (const index of indexes.rows) assert.match(index.indexdef, /WHERE/);
});

test('seed reruns preserve every row, IDs, timestamps, passwords and manual edits', async () => {
  await db.query(`UPDATE "User" SET name='Preserved user edit' WHERE id=$1`, [id('student')]);
  const snapshot = async (): Promise<string[]> => {
    const tables = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
    );
    const rows: string[] = [];
    for (const { tablename } of tables.rows) {
      const result = await db.query<{ value: string }>(
        `SELECT row_to_json(t)::text AS value FROM "${tablename}" t ORDER BY id`,
      );
      rows.push(tablename, ...result.rows.map((row) => row.value));
    }
    return rows;
  };
  const before = await snapshot();
  prisma('db', 'seed');
  assert.deepEqual(await snapshot(), before);
  const grants = await db.query<{ source: string }>(
    'SELECT source FROM "EnrollmentGrant" WHERE "enrollmentId"=$1 ORDER BY source',
    [id('enrollment:paid')],
  );
  assert.deepEqual(
    grants.rows.map((row) => row.source),
    ['MANUAL', 'ORDER_ITEM', 'SUBSCRIPTION'],
  );
});

test('subscription grant rejects PostgreSQL infinity as a finite expiry', async () => {
  await reject(
    `UPDATE "EnrollmentGrant" SET "expiresAt"='infinity' WHERE id=$1`,
    [id('grant:SUBSCRIPTION')],
    '23514',
    'grant_source_shape',
  );
});

test('fixture grades, published pointers and all question types are consistent', async () => {
  const types = await db.query<{ count: string }>(
    'SELECT count(DISTINCT type) FROM "QuestionVersion"',
  );
  assert.equal(types.rows[0]?.count, '9');
  const broken = await db.query<{ count: string }>(`SELECT count(*) FROM "Assessment" a
    LEFT JOIN "AssessmentVersion" v ON v."assessmentId"=a.id AND v.version=a."currentPublishedVersion" AND v.status='PUBLISHED'
    WHERE v.id IS NULL`);
  assert.equal(broken.rows[0]?.count, '0');
  const grade = await db.query<{ awarded: string; answers: string }>(
    `SELECT a."awardedPoints"::text AS awarded,
    (SELECT sum(x."awardedPoints")::text FROM "AttemptAnswer" x WHERE x."attemptId"=a.id) AS answers
    FROM "AssessmentAttempt" a WHERE a.id=$1`,
    [id('attempt:historical')],
  );
  assert.equal(grade.rows[0]?.awarded, grade.rows[0]?.answers);
  const config = await db.query<{ gradingConfig: unknown }>(
    'SELECT "gradingConfig" FROM "QuestionVersion" WHERE id=$1',
    [id('qv:SHORT_ANSWER')],
  );
  assert.deepEqual(config.rows[0]?.gradingConfig, {
    caseSensitive: false,
    trim: true,
    collapseWhitespace: true,
  });
});
