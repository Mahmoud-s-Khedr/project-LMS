import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { JWT_ISSUER, JWT_AUDIENCE } from '../../common/authz/auth.types';
import { AssessmentsModule } from './assessments.module';
import { ASSESSMENT_ACCESS_POLICY } from './assessment-domain';
import 'reflect-metadata';
import { PrismaClient, type LessonType, type Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type RichText,
  cursorResponseSchema,
  assessmentVersionSchema,
  assessmentQuestionsReplaceSchema,
  questionBankResponseSchema,
  attemptStartResponseSchema,
  authorQuestionPayloadSchema,
  learnerAttemptSchema,
  staffAttemptSchema,
  type AccessPolicy,
  type AssessmentVersionUpdate,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz/policy.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';
import { AssessmentRepository, type Actor } from './assessment.repository';
import { AssessmentAuthoringService } from './authoring.service';
import { AssessmentAttemptsService } from './attempts.service';
import { AssessmentGradingService } from './grading.service';
import { AssessmentDeadlineTask } from './deadline.task';
import { assessmentEtag } from './assessment-domain';
const run = process.env.ASSESSMENTS_TEST_DATABASE_URL ? describe : describe.skip;
const doc: RichText = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Explain your reasoning' }] }],
};
const objective = authorQuestionPayloadSchema.parse({
  type: 'TRUE_FALSE',
  prompt: doc,
  options: [],
  answerKey: { value: true },
  gradingConfig: {},
  defaultPoints: '10',
  explanation: null,
});
run('Assessments isolated PostgreSQL security and concurrency', () => {
  const schema = `assessments_test_${randomUUID().replaceAll('-', '')}`;
  let pool: Pool;
  let db: PrismaClient;
  let repo: AssessmentRepository;
  let author: AssessmentAuthoringService;
  let attempts: AssessmentAttemptsService;
  let grading: AssessmentGradingService;
  let owner: Actor;
  let learner: Actor;
  let outsider: Actor;
  let access: AccessPolicy;
  async function user(): Promise<Actor> {
    const r = await db.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        name: 'Assessment test',
        passwordHash: 'test-only-not-a-login-hash',
      },
    });
    return { id: r.id, platformRole: 'STUDENT' };
  }
  beforeAll(async () => {
    const connectionString = process.env.ASSESSMENTS_TEST_DATABASE_URL!;
    pool = new Pool({ connectionString, max: 1 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(`SET search_path TO "${schema}"`);
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261026000000_initial/migration.sql'),
      'utf8',
    ).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
    await pool.query(sql);
    db = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString, options: `-c search_path=${schema}`, max: 12 },
        { schema },
      ),
    });
    await db.$connect();
    const prisma = db as PrismaService;
    repo = new AssessmentRepository(prisma, new PolicyService(prisma), new AuditService(prisma));
    author = new AssessmentAuthoringService(repo);
    // Contract test evaluator uses real grants; production binds P3-B-LEARNING's evaluator.
    access = {
      evaluate: async (i) => {
        const r = await db.enrollment.findFirst({
          where: {
            id: i.enrollmentId,
            workspaceId: i.workspaceId,
            userId: i.userId,
            status: 'ACTIVE',
            user: { status: 'ACTIVE' },
            workspace: { status: 'ACTIVE' },
            enrollmentGrants: {
              some: {
                revokedAt: null,
                startsAt: { lte: new Date(i.at) },
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(i.at) } }],
              },
            },
          },
        });
        return r
          ? { allowed: true, expiresAt: null }
          : { allowed: false, reason: 'ACCESS_EXPIRED', unlockAt: null };
      },
    };
    attempts = new AssessmentAttemptsService(
      repo,
      author,
      new OutboxService(new SharedEventContracts()),
      access,
    );
    grading = new AssessmentGradingService(attempts);
    owner = await user();
    learner = await user();
    outsider = await user();
  }, 30000);
  afterAll(async () => {
    await db?.$disconnect();
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  }, 30000);
  async function fixture(kind: 'QUIZ' | 'ASSIGNMENT' | 'EXAM' = 'QUIZ', publish = true) {
    const w = await db.workspace.create({
      data: {
        ownerId: owner.id,
        kind: 'ACADEMY',
        name: 'Assessment workspace',
        slug: `w-${randomUUID()}`,
      },
    });
    await db.workspaceMember.create({
      data: { workspaceId: w.id, userId: owner.id, role: 'ADMIN' },
    });
    const c = await db.course.create({
      data: {
        workspaceId: w.id,
        createdById: owner.id,
        slug: `c-${randomUUID()}`,
        title: 'Course',
        summary: 'Test',
        status: 'PUBLISHED',
      },
    });
    const s = await db.section.create({
      data: { workspaceId: w.id, courseId: c.id, title: 'Section', position: 0 },
    });
    const l = await db.lesson.create({
      data: {
        workspaceId: w.id,
        courseId: c.id,
        sectionId: s.id,
        type: kind as LessonType,
        title: 'Assessment',
        position: 0,
      },
    });
    const e = await db.enrollment.create({
      data: { workspaceId: w.id, courseId: c.id, userId: learner.id },
    });
    await db.enrollmentGrant.create({
      data: { workspaceId: w.id, enrollmentId: e.id, source: 'FREE', sourceKey: 'free' },
    });
    const bank = await author.createBank(owner, w.id, { name: 'Question bank' }, randomUUID());
    const q = await author.createQuestion(
      owner,
      w.id,
      bank.id,
      {
        title: 'Question',
        tags: ['test'],
        payload:
          kind === 'ASSIGNMENT'
            ? authorQuestionPayloadSchema.parse({ ...objective, type: 'ESSAY', answerKey: {} })
            : objective,
      },
      randomUUID(),
    );
    const a = await author.create(
      owner,
      w.id,
      c.id,
      l.id,
      { kind, title: 'Test assessment' },
      randomUUID(),
    );
    let v = await db.assessmentVersion.findFirstOrThrow({ where: { assessmentId: a.id } });
    const dto = await author.edit(
      owner,
      w.id,
      c.id,
      a.id,
      v.id,
      {
        version: v.version,
        questions: [
          { questionVersionId: q.latestVersion.id, points: '10', position: 0, isRequired: true },
        ],
      },
      randomUUID(),
    );
    if (kind === 'ASSIGNMENT')
      await author.edit(
        owner,
        w.id,
        c.id,
        a.id,
        v.id,
        {
          version: dto.version,
          rubric: { criteria: [{ id: 'reason', label: 'Reasoning', maxPoints: '10' }] },
        },
        randomUUID(),
      );
    if (publish) {
      await author.publish(owner, w.id, c.id, a.id, v.id, randomUUID());
      v = await db.assessmentVersion.findUniqueOrThrow({ where: { id: v.id } });
    }
    return { w, c, l, e, bank, q, a, v };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  async function start(f: Fixture, key = randomUUID()) {
    return attempts.start(learner.id, f.e.id, f.a.id, key);
  }
  async function saveTrue(id: string, questionId: string) {
    return attempts.save(learner.id, id, questionId, {
      version: 1,
      response: { type: 'TRUE_FALSE', value: true },
    });
  }
  async function submitTrue(f: Fixture) {
    const a = await start(f);
    await saveTrue(a.attemptId, a.questions[0]!.attemptQuestionId);
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    return a;
  }
  async function backdate(id: string) {
    await db.assessmentAttempt.update({
      where: { id },
      data: { startedAt: new Date(Date.now() - 20000), deadlineAt: new Date(Date.now() - 10000) },
    });
  }

  it('serializes concurrent starts and replays the exact frozen response', async () => {
    const f = await fixture();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => start(f, key)));
    expect(new Set(results.map((r) => r.attemptId)).size).toBe(1);
    expect(await db.assessmentAttempt.count({ where: { assessmentId: f.a.id } })).toBe(1);
    const a = results[0]!;
    await saveTrue(a.attemptId, a.questions[0]!.attemptQuestionId);
    expect(await start(f, key)).toEqual(a);
    await expect(start(f)).rejects.toThrow('already in progress');
  });
  it('commits one submission/automatic grade under simultaneous requests', async () => {
    const f = await fixture();
    const a = await start(f);
    await saveTrue(a.attemptId, a.questions[0]!.attemptQuestionId);
    const key = randomUUID();
    const states = await Promise.all(
      Array.from({ length: 4 }, () => attempts.submit(learner.id, a.attemptId, key)),
    );
    expect(states.every((s) => s.status === 'GRADED')).toBe(true);
    expect(
      await db.outboxEvent.count({
        where: { aggregateId: a.attemptId, type: 'assessment.submitted.v1' },
      }),
    ).toBe(1);
    expect(await db.gradeEvent.count({ where: { attemptId: a.attemptId } })).toBe(1);
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('100');
  });
  it('rejects stale autosaves and cross-question or cross-owner writes', async () => {
    const f = await fixture();
    const a = await start(f);
    const q = a.questions[0]!.attemptQuestionId;
    await saveTrue(a.attemptId, q);
    await expect(saveTrue(a.attemptId, q)).rejects.toThrow('Answer changed');
    await expect(
      attempts.save(learner.id, a.attemptId, randomUUID(), {
        version: 1,
        response: { type: 'TRUE_FALSE', value: false },
      }),
    ).rejects.toThrow();
    await expect(attempts.get(outsider.id, a.attemptId)).rejects.toThrow();
    await expect(attempts.submit(outsider.id, a.attemptId, randomUUID())).rejects.toThrow();
  });
  it('closes saved answers on the server without a running deadline worker', async () => {
    const f = await fixture();
    const a = await start(f);
    const q = a.questions[0]!.attemptQuestionId;
    await saveTrue(a.attemptId, q);
    await backdate(a.attemptId);
    await expect(
      attempts.save(learner.id, a.attemptId, q, {
        version: 2,
        response: { type: 'TRUE_FALSE', value: false },
      }),
    ).rejects.toThrow('closed');
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('100');
    expect(
      (await db.assessmentAttempt.findUniqueOrThrow({ where: { id: a.attemptId } })).status,
    ).toBe('GRADED');
  });
  it('worker backstop closes unanswered attempts and remains idempotent', async () => {
    const f = await fixture();
    const a = await start(f);
    await backdate(a.attemptId);
    const worker = new AssessmentDeadlineTask(attempts);
    await worker.handle();
    await worker.handle();
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('0');
    expect(await db.gradeEvent.count({ where: { attemptId: a.attemptId } })).toBe(1);
  });
  it('does not leak private keys/pools/seeds, and refuses unpublished versions', async () => {
    const f = await fixture('QUIZ', false);
    await expect(start(f)).rejects.toThrow();
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    const a = await start(f);
    learnerAttemptSchema.parse(a);
    const serialized = JSON.stringify(a);
    for (const field of [
      'answerKey',
      'gradingConfig',
      'randomSeed',
      'assessmentPool',
      'explanation',
      'awardedPoints',
      'isCorrect',
    ])
      expect(serialized).not.toContain(field);
    await expect(author.detail(learner, f.w.id, f.c.id, f.a.id)).rejects.toThrow();
  });
  it('freezes old question/assessment history and counts limits across publications', async () => {
    const f = await fixture();
    const a = await submitTrue(f);
    await author.appendQuestionVersion(
      owner,
      f.w.id,
      f.q.id,
      authorQuestionPayloadSchema.parse({ ...objective, answerKey: { value: false } }),
      randomUUID(),
    );
    const next = await author.clone(owner, f.w.id, f.c.id, f.a.id, randomUUID());
    await author.publish(owner, f.w.id, f.c.id, f.a.id, next.id, randomUUID());
    await expect(
      author.edit(
        owner,
        f.w.id,
        f.c.id,
        f.a.id,
        f.v.id,
        { version: f.v.version, title: 'bad' } as unknown as AssessmentVersionUpdate,
        randomUUID(),
      ),
    ).rejects.toThrow('immutable');
    await expect(start(f)).rejects.toThrow('limit');
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('100');
    expect((await attempts.get(learner.id, a.attemptId)).questions[0]!.prompt).toEqual(doc);
  });
  it('enforces real grant revocation, and preserves released historical results', async () => {
    const f = await fixture();
    const a = await submitTrue(f);
    await db.enrollmentGrant.updateMany({
      where: { enrollmentId: f.e.id },
      data: { revokedAt: new Date() },
    });
    await expect(attempts.instructions(learner.id, f.e.id, f.a.id)).rejects.toThrow('locked');
    expect((await attempts.result(learner.id, a.attemptId)).passed).toBe(true);
  });
  it('enforces workspace/course ownership and TA grade/edit capabilities', async () => {
    const f = await fixture();
    const other = await fixture();
    const a = await submitTrue(f);
    await expect(author.detail(owner, other.w.id, other.c.id, f.a.id)).rejects.toThrow();
    await expect(
      attempts.staffDetail(outsider, f.w.id, f.c.id, f.a.id, a.attemptId),
    ).rejects.toThrow();
    await db.workspaceMember.create({
      data: { workspaceId: f.w.id, userId: outsider.id, role: 'TEACHING_ASSISTANT' as Role },
    });
    await db.courseStaff.create({
      data: {
        workspaceId: f.w.id,
        courseId: f.c.id,
        userId: outsider.id,
        role: 'TEACHING_ASSISTANT',
        canGrade: true,
        canEditContent: false,
      },
    });
    staffAttemptSchema.parse(
      await attempts.staffDetail(outsider, f.w.id, f.c.id, f.a.id, a.attemptId),
    );
    await expect(author.clone(outsider, f.w.id, f.c.id, f.a.id, randomUUID())).rejects.toThrow();
    await expect(
      grading.void(
        outsider,
        f.w.id,
        f.c.id,
        f.a.id,
        a.attemptId,
        { version: 3, reason: 'Unauthorized void' },
        randomUUID(),
      ),
    ).rejects.toThrow();
    await db.workspaceMember.updateMany({
      where: { workspaceId: f.w.id, userId: outsider.id },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      attempts.staffDetail(outsider, f.w.id, f.c.id, f.a.id, a.attemptId),
    ).rejects.toThrow();
  });
  it('grades assignment rubrics atomically, appends regrades and voids without erasing history', async () => {
    const f = await fixture('ASSIGNMENT');
    const a = await start(f);
    const q = a.questions[0]!.attemptQuestionId;
    await attempts.save(learner.id, a.attemptId, q, {
      version: 1,
      response: { type: 'ESSAY', document: doc },
    });
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    let r = await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId);
    expect(r.status).toBe('GRADING');
    expect(r.rubric).toEqual({ criteria: [{ id: 'reason', label: 'Reasoning', maxPoints: '10' }] });
    await expect(attempts.result(learner.id, a.attemptId)).rejects.toThrow('released');
    const input = {
      version: r.version,
      reason: 'Rubric review',
      final: true,
      answers: [
        {
          answerId: q,
          awardedPoints: '8',
          rubricScores: [{ criterionId: 'reason', points: '8' }],
          feedback: 'Clear reasoning',
        },
      ],
    };
    await grading.grade(owner, f.w.id, f.c.id, f.a.id, a.attemptId, input, false, randomUUID());
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('80');
    await expect(
      grading.grade(owner, f.w.id, f.c.id, f.a.id, a.attemptId, input, false, randomUUID()),
    ).rejects.toThrow('changed');
    r = await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId);
    await grading.grade(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      a.attemptId,
      {
        ...input,
        version: r.version,
        answers: [
          {
            ...input.answers[0]!,
            awardedPoints: '4',
            rubricScores: [{ criterionId: 'reason', points: '4' }],
          },
        ],
      },
      true,
      randomUUID(),
    );
    expect(
      await attempts.effectiveResult({
        workspaceId: f.w.id,
        enrollmentId: f.e.id,
        assessmentId: f.a.id,
      }),
    ).toEqual({ finalized: true, passed: false, percent: '40' });
    r = await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId);
    await grading.void(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      a.attemptId,
      { version: r.version, reason: 'Invalid assessment administration' },
      randomUUID(),
    );
    expect(await db.gradeEvent.count({ where: { attemptId: a.attemptId } })).toBe(2);
    expect(
      await attempts.effectiveResult({
        workspaceId: f.w.id,
        enrollmentId: f.e.id,
        assessmentId: f.a.id,
      }),
    ).toEqual({ finalized: false, passed: false, percent: null });
    expect((await start(f)).attemptId).not.toBe(a.attemptId);
  });
  it('freezes overlapping pool memberships and rejects infeasible publication', async () => {
    const f = await fixture('QUIZ', false);
    const dto = await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      { version: 2, questions: [] },
      randomUUID(),
    );
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: dto.version,
        pools: [
          {
            bankId: f.bank.id,
            position: 0,
            count: 2,
            pointsEach: '5',
            tags: ['test'],
            questionType: null,
          },
        ],
      },
      randomUUID(),
    );
    await expect(
      author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID()),
    ).rejects.toThrow('unique');
    expect(
      await db.assessmentPoolQuestion.count({ where: { pool: { assessmentVersionId: f.v.id } } }),
    ).toBe(0);
    await author.createQuestion(
      owner,
      f.w.id,
      f.bank.id,
      { title: 'Second question', tags: ['test'], payload: objective },
      randomUUID(),
    );
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    const count = await db.assessmentPoolQuestion.count({
      where: { pool: { assessmentVersionId: f.v.id } },
    });
    expect(count).toBe(2);
    await author.createQuestion(
      owner,
      f.w.id,
      f.bank.id,
      { title: 'Later question', tags: ['test'], payload: objective },
      randomUUID(),
    );
    const a = await start(f);
    expect(a.questions).toHaveLength(2);
    expect(
      await db.assessmentPoolQuestion.count({ where: { pool: { assessmentVersionId: f.v.id } } }),
    ).toBe(count);
  });
  it('enforces availability, late penalties and frozen accommodation deadlines', async () => {
    const f = await fixture('EXAM', false);
    const due = new Date(Date.now() - 10000).toISOString();
    const until = new Date(Date.now() + 600000).toISOString();
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: 2,
        dueAt: due,
        availableUntil: until,
        allowLateSubmission: true,
        latePenaltyPercent: '20',
        timeLimitSeconds: 60,
        maxAttempts: 2,
        feedbackPolicy: 'AFTER_DUE',
      },
      randomUUID(),
    );
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    await author.accommodate(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.e.id,
      {
        extraTimeSeconds: 120,
        extraAttempts: 1,
        availableUntil: until,
        reason: 'Approved extended exam time',
      },
      randomUUID(),
    );
    const a = await start(f);
    expect(Date.parse(a.deadlineAt!) - Date.parse(a.startedAt)).toBe(180000);
    await author.accommodate(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.e.id,
      {
        extraTimeSeconds: 0,
        extraAttempts: 0,
        availableUntil: null,
        reason: 'New accommodation for future attempts',
      },
      randomUUID(),
    );
    expect((await attempts.get(learner.id, a.attemptId)).deadlineAt).toBe(a.deadlineAt);
    await saveTrue(a.attemptId, a.questions[0]!.attemptQuestionId);
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('80');
  });
  it('rejects cross-enrollment accommodations and stale bank metadata edits', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      author.accommodate(
        owner,
        f.w.id,
        f.c.id,
        f.a.id,
        other.e.id,
        { extraTimeSeconds: 1, extraAttempts: 0, availableUntil: null, reason: 'Wrong course' },
        randomUUID(),
      ),
    ).rejects.toThrow();
    const tag = assessmentEtag(f.bank);
    await author.updateBank(owner, f.w.id, f.bank.id, { name: 'Renamed' }, randomUUID(), tag);
    await expect(
      author.updateBank(owner, f.w.id, f.bank.id, { name: 'Stale overwrite' }, randomUUID(), tag),
    ).rejects.toThrow('changed');
    await expect(
      author.updateBank(owner, f.w.id, f.bank.id, { name: 'No precondition' }, randomUUID()),
    ).rejects.toThrow('If-Match');
  });
  it('fails closed when the learning evaluator is missing', async () => {
    const f = await fixture();
    const without = new AssessmentAttemptsService(
      repo,
      author,
      new OutboxService(new SharedEventContracts()),
    );
    await expect(without.start(learner.id, f.e.id, f.a.id, randomUUID())).rejects.toThrow(
      'not configured',
    );
    expect(await db.assessmentAttempt.count({ where: { assessmentId: f.a.id } })).toBe(0);
  });
  it('requires authentication and validates actual HTTP routes, DTOs and module registration', async () => {
    const f = await fixture();
    const secret = 'assessment-test-jwt-secret-over-32-characters';
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: secret })],
        }),
        AssessmentsModule.withAccess([], { provide: ASSESSMENT_ACCESS_POLICY, useValue: access }),
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    const app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    try {
      const url = await app.getUrl();
      async function token(actor: Actor) {
        const session = await db.refreshSession.create({
          data: {
            userId: actor.id,
            familyId: randomUUID(),
            tokenHash: randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        return new JwtService().sign(
          { sub: actor.id, sid: session.id, fid: session.familyId, jti: randomUUID() },
          { secret, issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 600 },
        );
      }
      const ownerToken = await token(owner);
      const studentToken = await token(learner);
      const path = `${url}/api/v1/workspaces/${f.w.id}/courses/${f.c.id}/assessments/${f.a.id}`;
      expect((await fetch(path)).status).toBe(401);
      expect(
        (await fetch(path, { headers: { authorization: `Bearer ${studentToken}` } })).status,
      ).toBe(404);
      const versions = await fetch(`${path}/versions`, {
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const listed = cursorResponseSchema(assessmentVersionSchema).parse(await versions.json());
      expect(listed.data[0]?.id).toBe(f.v.id);
      const selected = await fetch(`${path}/versions/${f.v.id}/questions`, {
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      const selection = (await selected.json()) as { data: unknown };
      assessmentQuestionsReplaceSchema.parse(selection.data);
      const banks = `${url}/api/v1/workspaces/${f.w.id}/question-banks`;
      const invalid = await fetch(banks, {
        method: 'POST',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bank', workspaceId: randomUUID() }),
      });
      expect(invalid.status).toBe(400);
      const created = await fetch(banks, {
        method: 'POST',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'HTTP bank' }),
      });
      expect(created.status).toBe(201);
      expect(created.headers.get('etag')).toBeTruthy();
      questionBankResponseSchema.parse(await created.json());
      const startPath = `${url}/api/v1/me/enrollments/${f.e.id}/assessments/${f.a.id}/attempts`;
      const headers = { authorization: `Bearer ${studentToken}`, 'idempotency-key': randomUUID() };
      const started = await fetch(startPath, { method: 'POST', headers });
      expect(started.status).toBe(201);
      expect(started.headers.get('cache-control')).toBe('private, no-store');
      attemptStartResponseSchema.parse(await started.json());
      const swagger = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Assessment test').setVersion('1').build(),
      );
      expect(
        swagger.paths['/api/v1/me/attempts/{attemptId}/answers/{attemptQuestionId}'],
      ).toHaveProperty('put');
      expect(
        swagger.paths[
          '/api/v1/workspaces/{workspaceId}/courses/{courseId}/assessments/{assessmentId}/attempts/{attemptId}/regrade'
        ],
      ).toHaveProperty('post');
    } finally {
      await app.close();
    }
  });
  it('roundtrips immutable options and deterministic shuffled delivery', async () => {
    const f = await fixture('QUIZ', false);
    const payload = authorQuestionPayloadSchema.parse({
      ...objective,
      type: 'SINGLE_CHOICE',
      options: ['a', 'b', 'c'].map((key, position) => ({ key, position, content: doc })),
      answerKey: { correctOptionKeys: ['b'] },
    });
    const q = await author.createQuestion(
      owner,
      f.w.id,
      f.bank.id,
      { title: 'Choices', tags: [], payload },
      randomUUID(),
    );
    expect(q.latestVersion.payload).toEqual(payload);
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: 2,
        questions: [
          { questionVersionId: q.latestVersion.id, points: '10', position: 0, isRequired: true },
        ],
      },
      randomUUID(),
    );
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      { version: 3, shuffleQuestions: true, shuffleOptions: true },
      randomUUID(),
    );
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    const key = randomUUID();
    const a = await start(f, key);
    expect(await start(f, key)).toEqual(a);
    expect(a.questions[0]?.options.map((o) => o.key).sort()).toEqual(['a', 'b', 'c']);
    await attempts.save(learner.id, a.attemptId, a.questions[0]!.attemptQuestionId, {
      version: 1,
      response: { type: 'SINGLE_CHOICE', optionKey: 'b' },
    });
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    expect((await attempts.result(learner.id, a.attemptId)).passed).toBe(true);
  });
  it('checks submission file ownership, purpose, scan, MIME and size, then freezes normalized attachments', async () => {
    const f = await fixture('ASSIGNMENT', false);
    const q = await author.appendQuestionVersion(
      owner,
      f.w.id,
      f.q.id,
      authorQuestionPayloadSchema.parse({ ...objective, type: 'FILE_UPLOAD', answerKey: {} }),
      randomUUID(),
    );
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: 3,
        questions: [{ questionVersionId: q.id, points: '10', position: 0, isRequired: true }],
      },
      randomUUID(),
    );
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    const a = await start(f);
    const question = a.questions[0]!.attemptQuestionId;
    async function asset(
      overrides: Partial<{
        uploadedById: string;
        mimeType: string;
        sizeBytes: bigint;
        status: 'READY' | 'SCANNING';
        metadata: object;
      }> = {},
    ) {
      return db.asset.create({
        data: {
          workspaceId: f.w.id,
          uploadedById: learner.id,
          objectKey: randomUUID(),
          bucket: 'lms-private',
          filename: 'work.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100n,
          status: 'READY',
          verifiedAt: new Date(),
          metadata: { purpose: 'SUBMISSION', parentId: a.attemptId },
          ...overrides,
        },
      });
    }
    const files = await Promise.all([
      asset({ uploadedById: outsider.id }),
      asset({ mimeType: 'text/html' }),
      asset({ sizeBytes: 10485761n }),
      asset({ status: 'SCANNING' }),
      asset({ metadata: { purpose: 'SUBMISSION', parentId: randomUUID() } }),
    ]);
    for (const file of files)
      await expect(
        attempts.save(learner.id, a.attemptId, question, {
          version: 1,
          response: { type: 'FILE_UPLOAD', note: 'Work' },
          attachmentIds: [file.id],
        }),
      ).rejects.toThrow('Attachments');
    const good = await asset();
    await attempts.save(learner.id, a.attemptId, question, {
      version: 1,
      response: { type: 'FILE_UPLOAD', note: 'Work' },
      attachmentIds: [good.id],
    });
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    expect((await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId)).status).toBe(
      'GRADING',
    );
    expect(await db.answerAttachment.count({ where: { assetId: good.id } })).toBe(1);
    await expect(
      attempts.save(learner.id, a.attemptId, question, {
        version: 2,
        response: { type: 'FILE_UPLOAD', note: 'Changed' },
      }),
    ).rejects.toThrow('closed');
  });
  it.each(['NEVER', 'AFTER_DUE'] as const)(
    'suppresses released feedback under %s',
    async (feedbackPolicy) => {
      const f = await fixture('QUIZ', false);
      await author.edit(
        owner,
        f.w.id,
        f.c.id,
        f.a.id,
        f.v.id,
        { version: 2, feedbackPolicy, dueAt: new Date(Date.now() + 600000).toISOString() },
        randomUUID(),
      );
      await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
      const a = await submitTrue(f);
      await expect(attempts.result(learner.id, a.attemptId)).rejects.toThrow('released');
      expect(
        await attempts.effectiveResult({
          workspaceId: f.w.id,
          enrollmentId: f.e.id,
          assessmentId: f.a.id,
        }),
      ).toEqual({ finalized: true, passed: true, percent: '100' });
      const publicDto = await attempts.get(learner.id, a.attemptId);
      expect(JSON.stringify(publicDto)).not.toContain('awardedPoints');
    },
  );
  it.each(['FIRST', 'LATEST', 'HIGHEST'] as const)(
    'selects finalized effective results using %s',
    async (gradePolicy) => {
      const f = await fixture('QUIZ', false);
      await author.edit(
        owner,
        f.w.id,
        f.c.id,
        f.a.id,
        f.v.id,
        { version: 2, maxAttempts: 3, gradePolicy },
        randomUUID(),
      );
      await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
      await submitTrue(f);
      const second = await start(f);
      await attempts.save(learner.id, second.attemptId, second.questions[0]!.attemptQuestionId, {
        version: 1,
        response: { type: 'TRUE_FALSE', value: false },
      });
      await attempts.submit(learner.id, second.attemptId, randomUUID());
      expect(
        (
          await attempts.effectiveResult({
            workspaceId: f.w.id,
            enrollmentId: f.e.id,
            assessmentId: f.a.id,
          })
        ).percent,
      ).toBe(gradePolicy === 'LATEST' ? '0' : '100');
    },
  );
  it('supplies the course publish validator against the caller transaction', async () => {
    const f = await fixture();
    await db.lesson.update({ where: { id: f.l.id }, data: { isPublished: true } });
    await db.$transaction((tx) =>
      author.validateCourse(tx, { workspaceId: f.w.id, courseId: f.c.id }),
    );
    await db.lesson.create({
      data: {
        workspaceId: f.w.id,
        courseId: f.c.id,
        sectionId: f.l.sectionId,
        title: 'Unconfigured quiz',
        type: 'QUIZ',
        position: 1,
        isPublished: true,
      },
    });
    await expect(
      db.$transaction((tx) => author.validateCourse(tx, { workspaceId: f.w.id, courseId: f.c.id })),
    ).rejects.toThrow('published assessment');
  });
  it('rolls back invalid rubrics and permits one concurrent grading revision', async () => {
    const f = await fixture('ASSIGNMENT');
    const a = await start(f);
    const q = a.questions[0]!.attemptQuestionId;
    await attempts.save(learner.id, a.attemptId, q, {
      version: 1,
      response: { type: 'ESSAY', document: doc },
    });
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    const detail = await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId);
    const input = {
      version: detail.version,
      final: true,
      reason: 'Careful rubric review',
      answers: [
        {
          answerId: q,
          awardedPoints: '8',
          rubricScores: [{ criterionId: 'reason', points: '7' }],
          feedback: null,
        },
      ],
    };
    await expect(
      grading.grade(owner, f.w.id, f.c.id, f.a.id, a.attemptId, input, false, randomUUID()),
    ).rejects.toThrow('equal');
    expect(await db.gradeEvent.count({ where: { attemptId: a.attemptId } })).toBe(0);
    input.answers[0]!.rubricScores[0]!.points = '8';
    const races = await Promise.allSettled([
      grading.grade(owner, f.w.id, f.c.id, f.a.id, a.attemptId, input, false, randomUUID()),
      grading.grade(owner, f.w.id, f.c.id, f.a.id, a.attemptId, input, false, randomUUID()),
    ]);
    expect(races.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.gradeEvent.count({ where: { attemptId: a.attemptId } })).toBe(1);
  });
  it('does not round a failing raw percentage into a passing grade', async () => {
    const f = await fixture('ASSIGNMENT', false);
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: 3,
        questions: [
          { questionVersionId: f.q.latestVersion.id, points: '100', position: 0, isRequired: true },
        ],
      },
      randomUUID(),
    );
    await author.edit(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      f.v.id,
      {
        version: 4,
        rubric: { criteria: [{ id: 'reason', label: 'Reasoning', maxPoints: '100' }] },
      },
      randomUUID(),
    );
    await author.publish(owner, f.w.id, f.c.id, f.a.id, f.v.id, randomUUID());
    const a = await start(f);
    const q = a.questions[0]!.attemptQuestionId;
    await attempts.save(learner.id, a.attemptId, q, {
      version: 1,
      response: { type: 'ESSAY', document: doc },
    });
    await attempts.submit(learner.id, a.attemptId, randomUUID());
    const detail = await attempts.staffDetail(owner, f.w.id, f.c.id, f.a.id, a.attemptId);
    await grading.grade(
      owner,
      f.w.id,
      f.c.id,
      f.a.id,
      a.attemptId,
      {
        version: detail.version,
        final: true,
        reason: 'Threshold boundary review',
        answers: [
          {
            answerId: q,
            awardedPoints: '59.999',
            rubricScores: [{ criterionId: 'reason', points: '59.999' }],
            feedback: null,
          },
        ],
      },
      false,
      randomUUID(),
    );
    expect((await attempts.result(learner.id, a.attemptId)).percent).toBe('60');
    expect((await attempts.result(learner.id, a.attemptId)).passed).toBe(false);
  });
});
