import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assessmentSchema,
  assessmentVersionConfigSchema,
  type QuestionBankCreate,
  type QuestionBankUpdate,
  type QuestionCreate,
  type QuestionUpdate,
  type QuestionsQuery,
  type QuestionBanksQuery,
  type AuthorQuestionPayload,
  type AssessmentCreate,
  type AssessmentVersionUpdate,
  type AssessmentQuestionsReplace,
  type AssessmentPoolsReplace,
  type AccommodationUpsert,
} from '@lms/shared';
import {
  AssessmentRepository,
  type Actor,
  type Tx,
  versionInclude,
  questionDto,
  questionVersionDto,
  bankDto,
  entityDto,
  assessmentVersionDto,
  configDto,
  pageScope,
  page,
  pageOrder,
  afterWhere,
} from './assessment.repository';
import {
  bad,
  conflict,
  decimal,
  draw,
  iso,
  json,
  checkAssessmentEtag,
  nextUpdate,
} from './assessment-domain';
const latest = {
  questionVersions: { orderBy: { version: 'desc' as const }, take: 1, include: versionInclude },
};
const defaultConfig = assessmentVersionConfigSchema.parse({
  instructions: { type: 'doc', content: [] },
  maxAttempts: 1,
  timeLimitSeconds: null,
  availableFrom: null,
  dueAt: null,
  availableUntil: null,
  allowLateSubmission: false,
  latePenaltyPercent: '0',
  passPercent: '60',
  gradePolicy: 'HIGHEST',
  feedbackPolicy: 'AFTER_GRADING',
  shuffleQuestions: false,
  shuffleOptions: false,
  rubric: null,
  allowedFileTypes: ['application/pdf', 'text/plain', 'image/jpeg', 'image/png'],
  maxUploadBytes: '10485760',
  maxFiles: 5,
});
function configData(c: typeof defaultConfig) {
  return {
    ...c,
    instructions: json(c.instructions),
    rubric: c.rubric ? json(c.rubric) : Prisma.DbNull,
    maxUploadBytes: BigInt(c.maxUploadBytes),
    availableFrom: c.availableFrom ? new Date(c.availableFrom) : null,
    dueAt: c.dueAt ? new Date(c.dueAt) : null,
    availableUntil: c.availableUntil ? new Date(c.availableUntil) : null,
  };
}
@Injectable()
export class AssessmentAuthoringService {
  constructor(private readonly repo: AssessmentRepository) {}
  async listBanks(a: Actor, w: string, q: QuestionBanksQuery) {
    const admin = await this.repo.policy.hasWorkspaceRole(a, w, ['ADMIN']);
    let allowed: Prisma.QuestionBankWhereInput = {};
    if (!admin) {
      const instructor = await this.repo.policy.hasWorkspaceRole(a, w, ['INSTRUCTOR']);
      const ta = await this.repo.policy.hasWorkspaceRole(a, w, ['TEACHING_ASSISTANT']);
      if (!instructor && !ta) throw new NotFoundException();
      const staff = ta
        ? await this.repo.prisma.courseStaff.findMany({
            where: {
              workspaceId: w,
              userId: a.id,
              canEditContent: true,
              course: { deletedAt: null },
            },
            select: { courseId: true },
          })
        : [];
      const refs = {
        assessment: { courseId: { in: staff.map((s) => s.courseId) }, deletedAt: null },
      };
      allowed = {
        OR: [
          ...(instructor ? [{ createdById: a.id }] : []),
          ...(ta
            ? [
                { assessmentPools: { some: { assessmentVersion: refs } } },
                {
                  questions: {
                    some: {
                      questionVersions: {
                        some: { assessmentQuestions: { some: { assessmentVersion: refs } } },
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      };
    }
    const { cursor, limit, ...filters } = q;
    const p = pageScope({ a: a.id, w, filters }, cursor);
    const rows = await this.repo.prisma.questionBank.findMany({
      where: {
        AND: [allowed, afterWhere(p.after)],
        workspaceId: w,
        deletedAt: null,
        ...(q.createdById ? { createdById: q.createdById } : {}),
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      orderBy: pageOrder,
      take: limit + 1,
    });
    return page(rows, limit, p.hash, bankDto);
  }
  async createBank(a: Actor, w: string, input: QuestionBankCreate, requestId: string) {
    if (!(await this.repo.policy.hasWorkspaceRole(a, w, ['ADMIN', 'INSTRUCTOR'])))
      throw new NotFoundException();
    return this.repo.prisma.$transaction(async (tx) => {
      const r = await tx.questionBank.create({
        data: { ...input, workspaceId: w, createdById: a.id },
      });
      await this.repo.auditChange(tx, a, w, r.id, 'assessment.bank.created', requestId);
      return bankDto(r);
    });
  }
  async updateBank(
    a: Actor,
    w: string,
    id: string,
    input: QuestionBankUpdate | null,
    requestId: string,
    ifMatch?: string,
  ) {
    await this.repo.bank(a, w, id);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `bank:${id}`);
      const current = await this.repo.bank(a, w, id, tx);
      checkAssessmentEtag(current, ifMatch);
      const r = await tx.questionBank.update({
        where: { id },
        data: { ...(input ?? { deletedAt: new Date() }), updatedAt: nextUpdate(current.updatedAt) },
      });
      await this.repo.auditChange(
        tx,
        a,
        w,
        id,
        input ? 'assessment.bank.updated' : 'assessment.bank.archived',
        requestId,
      );
      return bankDto(r);
    });
  }
  async questions(a: Actor, w: string, bankId: string, q: QuestionsQuery) {
    await this.repo.bank(a, w, bankId);
    const { cursor, limit, ...filters } = q;
    const p = pageScope({ a: a.id, w, bankId, filters }, cursor);
    const rows = await this.repo.prisma.question.findMany({
      where: {
        workspaceId: w,
        bankId,
        deletedAt: null,
        ...afterWhere(p.after),
        archivedAt: q.status === 'ARCHIVED' ? { not: null } : null,
        ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
        ...(q.tags?.length ? { tags: { hasEvery: q.tags } } : {}),
        ...(q.type ? { questionVersions: { some: { type: q.type } } } : {}),
      },
      include: latest,
      orderBy: pageOrder,
      take: limit + 1,
    });
    await this.repo.auditChange(this.repo.prisma, a, w, bankId, 'assessment.questions.read');
    return page(rows, limit, p.hash, questionDto);
  }
  async question(a: Actor, w: string, id: string) {
    const r = await this.repo.prisma.question.findFirst({
      where: { id, workspaceId: w, deletedAt: null },
      include: latest,
    });
    if (!r) throw new NotFoundException();
    await this.repo.bank(a, w, r.bankId);
    await this.repo.auditChange(this.repo.prisma, a, w, id, 'assessment.question.read');
    return r;
  }
  async createQuestion(
    a: Actor,
    w: string,
    bankId: string,
    input: QuestionCreate,
    requestId: string,
  ) {
    await this.repo.bank(a, w, bankId);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `bank:${bankId}`);
      await this.repo.bank(a, w, bankId, tx);
      const r = await tx.question.create({
        data: { workspaceId: w, bankId, createdById: a.id, title: input.title, tags: input.tags },
      });
      await this.repo.createQuestionVersion(tx, w, r.id, 1, input.payload);
      await this.repo.auditChange(tx, a, w, r.id, 'assessment.question.created', requestId);
      return questionDto(
        await tx.question.findUniqueOrThrow({ where: { id: r.id }, include: latest }),
      );
    });
  }
  async updateQuestion(
    a: Actor,
    w: string,
    id: string,
    input: QuestionUpdate | null,
    requestId: string,
    ifMatch?: string,
  ) {
    await this.question(a, w, id);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `question:${id}`);
      const current = await tx.question.findUniqueOrThrow({ where: { id } });
      checkAssessmentEtag(current, ifMatch);
      const r = await tx.question.update({
        where: { id },
        data: {
          ...(input ?? { archivedAt: new Date() }),
          updatedAt: nextUpdate(current.updatedAt),
        },
        include: latest,
      });
      await this.repo.auditChange(
        tx,
        a,
        w,
        id,
        input ? 'assessment.question.updated' : 'assessment.question.archived',
        requestId,
      );
      return questionDto(r);
    });
  }
  async appendQuestionVersion(
    a: Actor,
    w: string,
    id: string,
    input: AuthorQuestionPayload,
    requestId: string,
  ) {
    const root = await this.question(a, w, id);
    if (root.archivedAt) bad('Question is archived');
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `question:${id}`);
      const current = await tx.question.findUniqueOrThrow({ where: { id } });
      if (current.archivedAt || current.deletedAt) bad('Question is archived');
      await this.repo.bank(a, w, current.bankId, tx);
      const last = await tx.questionVersion.findFirstOrThrow({
        where: { questionId: id, workspaceId: w },
        orderBy: { version: 'desc' },
      });
      const r = await this.repo.createQuestionVersion(tx, w, id, last.version + 1, input);
      await tx.question.update({
        where: { id },
        data: { updatedAt: nextUpdate(current.updatedAt) },
      });
      await this.repo.auditChange(tx, a, w, id, 'assessment.question.versioned', requestId);
      return questionVersionDto(r);
    });
  }
  async questionVersions(a: Actor, w: string, id: string, q: { cursor?: string; limit: number }) {
    await this.question(a, w, id);
    const p = pageScope({ a: a.id, w, id }, q.cursor);
    const rows = await this.repo.prisma.questionVersion.findMany({
      where: { questionId: id, workspaceId: w, ...afterWhere(p.after) },
      include: versionInclude,
      orderBy: pageOrder,
      take: q.limit + 1,
    });
    return page(rows, q.limit, p.hash, questionVersionDto);
  }
  async assessment(
    a: Actor,
    w: string,
    c: string,
    id: string,
    capability: 'edit' | 'grade' | 'publish' = 'edit',
    tx: Tx = this.repo.prisma,
  ) {
    await this.repo.course(a, w, c, capability);
    const r = await tx.assessment.findFirst({
      where: { id, workspaceId: w, courseId: c, deletedAt: null },
    });
    if (!r) throw new NotFoundException();
    return r;
  }
  assessmentDto(r: Awaited<ReturnType<AssessmentAuthoringService['assessment']>>) {
    return assessmentSchema.parse({
      ...entityDto(r),
      kind: r.kind,
      title: r.title,
      courseId: r.courseId,
      lessonId: r.lessonId,
      currentPublishedVersion: r.currentPublishedVersion,
    });
  }
  async create(
    a: Actor,
    w: string,
    c: string,
    lessonId: string,
    input: AssessmentCreate,
    requestId: string,
  ) {
    await this.repo.course(a, w, c);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `lesson:${lessonId}`);
      const lesson = await tx.lesson.findFirst({
        where: { id: lessonId, workspaceId: w, courseId: c, deletedAt: null },
      });
      if (!lesson) throw new NotFoundException();
      if (lesson.type !== input.kind) bad('Assessment kind must match lesson');
      if (await tx.assessment.findUnique({ where: { lessonId } }))
        conflict('Lesson already has an assessment', 'CONFLICT');
      const r = await tx.assessment.create({
        data: { workspaceId: w, courseId: c, lessonId, ...input },
      });
      await tx.assessmentVersion.create({
        data: { workspaceId: w, assessmentId: r.id, version: 1, ...configData(defaultConfig) },
      });
      await this.repo.auditChange(tx, a, w, r.id, 'assessment.created', requestId);
      return this.assessmentDto(r);
    });
  }
  async detail(a: Actor, w: string, c: string, id: string) {
    let r;
    if (await this.repo.policy.canManageCourse(a, { id: c, workspaceId: w }, 'edit'))
      r = await this.assessment(a, w, c, id);
    else r = await this.assessment(a, w, c, id, 'grade');
    await this.repo.auditChange(this.repo.prisma, a, w, id, 'assessment.staff.read');
    return this.assessmentDto(r);
  }
  async versions(
    a: Actor,
    w: string,
    c: string,
    id: string,
    q: { cursor?: string; limit: number },
  ) {
    await this.assessment(a, w, c, id);
    const p = pageScope({ a: a.id, w, c, id, list: 'versions' }, q.cursor);
    const rows = await this.repo.prisma.assessmentVersion.findMany({
      where: { workspaceId: w, assessmentId: id, ...afterWhere(p.after) },
      orderBy: pageOrder,
      take: q.limit + 1,
    });
    return page(rows, q.limit, p.hash, assessmentVersionDto);
  }
  async selection(
    a: Actor,
    w: string,
    c: string,
    id: string,
    versionId: string,
    kind: 'questions' | 'pools',
  ) {
    await this.assessment(a, w, c, id);
    const v = await this.repo.prisma.assessmentVersion.findFirst({
      where: { id: versionId, workspaceId: w, assessmentId: id },
      include: {
        assessmentQuestions: { orderBy: { position: 'asc' } },
        assessmentPools: { orderBy: { position: 'asc' } },
      },
    });
    if (!v) throw new NotFoundException();
    return kind === 'questions'
      ? {
          version: v.version,
          questions: v.assessmentQuestions.map((q) => ({
            questionVersionId: q.questionVersionId,
            points: q.points.toString(),
            position: q.position,
            isRequired: q.isRequired,
          })),
        }
      : {
          version: v.version,
          pools: v.assessmentPools.map((p) => ({
            bankId: p.bankId,
            position: p.position,
            count: p.count,
            pointsEach: p.pointsEach.toString(),
            tags: p.tags,
            questionType: p.questionType,
          })),
        };
  }
  async clone(a: Actor, w: string, c: string, id: string, requestId: string) {
    await this.assessment(a, w, c, id);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `assessment:${id}`);
      const versions = await tx.assessmentVersion.findMany({
        where: { assessmentId: id, workspaceId: w },
        orderBy: { version: 'desc' },
        include: { assessmentQuestions: true, assessmentPools: true },
      });
      if (versions.some((v) => v.status === 'DRAFT'))
        conflict('An editable draft already exists', 'CONFLICT');
      const source = versions.find((v) => v.status === 'PUBLISHED') ?? versions[0];
      const next = await tx.assessmentVersion.create({
        data: {
          workspaceId: w,
          assessmentId: id,
          version: (versions[0]?.version ?? 0) + 1,
          ...configData(source ? configDto(source) : defaultConfig),
        },
      });
      for (const q of source?.assessmentQuestions ?? [])
        await tx.assessmentQuestion.create({
          data: {
            workspaceId: w,
            assessmentVersionId: next.id,
            questionVersionId: q.questionVersionId,
            points: q.points,
            position: q.position,
            isRequired: q.isRequired,
          },
        });
      for (const p of source?.assessmentPools ?? [])
        await tx.assessmentPool.create({
          data: {
            workspaceId: w,
            assessmentVersionId: next.id,
            bankId: p.bankId,
            count: p.count,
            pointsEach: p.pointsEach,
            position: p.position,
            tags: p.tags,
            questionType: p.questionType,
          },
        });
      await this.repo.auditChange(tx, a, w, id, 'assessment.version.cloned', requestId);
      return assessmentVersionDto(next);
    });
  }
  async edit(
    a: Actor,
    w: string,
    c: string,
    id: string,
    versionId: string,
    input: AssessmentVersionUpdate | AssessmentQuestionsReplace | AssessmentPoolsReplace,
    requestId: string,
  ) {
    await this.assessment(a, w, c, id);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `assessment:${id}`);
      const v = await tx.assessmentVersion.findFirst({
        where: { id: versionId, workspaceId: w, assessmentId: id },
      });
      if (!v) throw new NotFoundException();
      if (v.status !== 'DRAFT' || v.version !== input.version)
        conflict('Draft changed or is immutable');
      if ('questions' in input) {
        for (const q of input.questions) {
          if (decimal(q.points).gt('9999999.999'))
            bad('Question points exceed supported precision');
          const selected = await tx.questionVersion.findFirst({
            where: {
              id: q.questionVersionId,
              workspaceId: w,
              question: { archivedAt: null, deletedAt: null },
            },
            include: { question: true },
          });
          if (!selected) throw new NotFoundException();
          await this.repo.bank(a, w, selected.question.bankId, tx);
        }
        await tx.assessmentQuestion.deleteMany({
          where: { workspaceId: w, assessmentVersionId: versionId },
        });
        await tx.assessmentQuestion.createMany({
          data: input.questions.map((q) => ({
            ...q,
            workspaceId: w,
            assessmentVersionId: versionId,
          })),
        });
      } else if ('pools' in input) {
        for (const p of input.pools) {
          if (decimal(p.pointsEach).gt('9999999.999'))
            bad('Pool points exceed supported precision');
          await this.repo.bank(a, w, p.bankId, tx);
        }
        await tx.assessmentPool.deleteMany({
          where: { workspaceId: w, assessmentVersionId: versionId },
        });
        await tx.assessmentPool.createMany({
          data: input.pools.map((p) => ({ ...p, workspaceId: w, assessmentVersionId: versionId })),
        });
      }
      const config =
        'questions' in input || 'pools' in input
          ? configDto(v)
          : assessmentVersionConfigSchema.parse({
              ...configDto(v),
              ...Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'version')),
            });
      const r = await tx.assessmentVersion.update({
        where: { id: versionId },
        data: { ...configData(config), version: { increment: 1 } },
      });
      await this.repo.auditChange(tx, a, w, id, 'assessment.draft.updated', requestId);
      return assessmentVersionDto(r);
    });
  }
  async publish(a: Actor, w: string, c: string, id: string, versionId: string, requestId: string) {
    const root = await this.assessment(a, w, c, id);
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `assessment:${id}`);
      const v = await tx.assessmentVersion.findFirst({
        where: { id: versionId, workspaceId: w, assessmentId: id },
        include: {
          assessmentQuestions: { include: { questionVersion: { include: { question: true } } } },
          assessmentPools: { orderBy: { position: 'asc' } },
        },
      });
      if (!v) throw new NotFoundException();
      if (v.status !== 'DRAFT') conflict('Version is immutable');
      const config = configDto(v);
      if (config.feedbackPolicy === 'AFTER_DUE' && !config.dueAt) bad('AFTER_DUE requires dueAt');
      const fixed = v.assessmentQuestions.map((q) => ({
        id: q.questionVersionId,
        questionId: q.questionVersion.questionId,
      }));
      const pools = [];
      let frozenCount = 0;
      for (const q of v.assessmentQuestions) {
        await this.repo.bank(a, w, q.questionVersion.question.bankId, tx);
        if (q.questionVersion.question.archivedAt || q.questionVersion.question.deletedAt)
          bad('Archived question cannot be published');
      }
      for (const p of v.assessmentPools) {
        await this.repo.bank(a, w, p.bankId, tx);
        const roots = await tx.question.findMany({
          where: {
            workspaceId: w,
            bankId: p.bankId,
            archivedAt: null,
            deletedAt: null,
            ...(p.tags.length ? { tags: { hasEvery: p.tags } } : {}),
          },
          include: latest,
          take: 10001,
        });
        if (roots.length > 10000) bad('Pool too large; narrow its tags/type');
        const candidates = roots.flatMap((q) => {
          const latestVersion = q.questionVersions[0];
          return latestVersion && (!p.questionType || latestVersion.type === p.questionType)
            ? [{ id: latestVersion.id, questionId: q.id, type: latestVersion.type }]
            : [];
        });
        frozenCount += candidates.length;
        if (frozenCount > 10000) bad('Assessment exceeds 10000 pool candidates');
        pools.push({ id: p.id, count: p.count, candidates });
        await tx.assessmentPoolQuestion.createMany({
          data: candidates.map((q) => ({ workspaceId: w, poolId: p.id, questionVersionId: q.id })),
        });
      }
      draw(fixed, pools, 'publish-validation');
      const total = v.assessmentQuestions
        .reduce((n, q) => n.plus(q.points), decimal(0))
        .plus(v.assessmentPools.reduce((n, p) => n.plus(p.pointsEach.mul(p.count)), decimal(0)));
      if (total.gt('999999999.999')) bad('Assessment total exceeds supported precision');
      if (total.lte(0)) bad('Published assessment requires positive total points');
      if (root.kind === 'ASSIGNMENT') {
        // A required manual item must be guaranteed in every feasible draw.
        const manual =
          v.assessmentQuestions.some(
            (q) => q.questionVersion.type === 'ESSAY' || q.questionVersion.type === 'FILE_UPLOAD',
          ) ||
          pools.some((p) =>
            p.candidates.every((q) => q.type === 'ESSAY' || q.type === 'FILE_UPLOAD'),
          );
        if (!manual || !config.rubric) bad('Assignments require a manual item and rubric');
        const sum = config.rubric.criteria.reduce((n, r) => n.plus(r.maxPoints), decimal(0));
        if (!sum.eq(total)) bad('Rubric maxima must equal assessment total');
      }
      await tx.assessmentVersion.updateMany({
        where: { workspaceId: w, assessmentId: id, status: 'PUBLISHED' },
        data: { status: 'RETIRED' },
      });
      const result = await tx.assessmentVersion.update({
        where: { id: versionId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      await tx.assessment.update({
        where: { id },
        data: { currentPublishedVersion: result.version },
      });
      await this.repo.auditChange(tx, a, w, id, 'assessment.published', requestId);
      return assessmentVersionDto(result);
    });
  }
  async accommodate(
    a: Actor,
    w: string,
    c: string,
    id: string,
    enrollmentId: string,
    input: AccommodationUpsert,
    requestId: string,
  ) {
    await this.assessment(a, w, c, id, 'publish');
    return this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `attempt-scope:${id}:${enrollmentId}`);
      if (
        !(await tx.enrollment.findFirst({
          where: { id: enrollmentId, workspaceId: w, courseId: c },
        }))
      )
        throw new NotFoundException();
      const published = await tx.assessmentVersion.findFirst({
        where: { assessmentId: id, workspaceId: w, status: 'PUBLISHED' },
      });
      if (input.extraTimeSeconds > 604800 || input.extraAttempts > 1000)
        bad('Accommodation exceeds 7 extra days or 1000 extra attempts');
      if (
        input.availableUntil &&
        published &&
        [published.availableUntil, published.dueAt, published.availableFrom].some(
          (t) => t && Date.parse(input.availableUntil!) < t.getTime(),
        )
      )
        bad('Accommodation cutoff may extend the published window, never shorten it');
      const data = {
        ...input,
        availableUntil: input.availableUntil ? new Date(input.availableUntil) : null,
        grantedById: a.id,
      };
      const r = await tx.assessmentAccommodation.upsert({
        where: { assessmentId_enrollmentId: { assessmentId: id, enrollmentId } },
        create: { workspaceId: w, courseId: c, assessmentId: id, enrollmentId, ...data },
        update: data,
      });
      await this.repo.auditChange(tx, a, w, id, 'assessment.accommodation.updated', requestId);
      return {
        ...entityDto(r),
        extraTimeSeconds: r.extraTimeSeconds,
        extraAttempts: r.extraAttempts,
        availableUntil: iso(r.availableUntil),
        reason: r.reason,
        assessmentId: id,
        enrollmentId,
        grantedById: r.grantedById,
      };
    });
  }
  /** Implements the content package's frozen AssessmentPublishValidator contract. */
  async validateCourse(tx: Tx, scope: { workspaceId: string; courseId: string }): Promise<void> {
    const lessons = await tx.lesson.findMany({
      where: {
        ...scope,
        isPublished: true,
        deletedAt: null,
        type: { in: ['QUIZ', 'ASSIGNMENT', 'EXAM'] },
        section: { deletedAt: null },
      },
      select: { id: true, type: true },
    });
    for (const lesson of lessons)
      await this.assertPublishable(tx, scope.workspaceId, scope.courseId, lesson.id, lesson.type);
  }
  /** Content publish hook; callers pass their transaction to avoid a stale preflight. */
  async assertPublishable(
    tx: Tx,
    workspaceId: string,
    courseId: string,
    lessonId: string,
    kind: string,
  ): Promise<void> {
    const r = await tx.assessment.findFirst({
      where: { workspaceId, courseId, lessonId, deletedAt: null },
      include: {
        assessmentVersions: {
          where: { status: 'PUBLISHED' },
          include: {
            assessmentQuestions: { include: { questionVersion: true } },
            assessmentPools: {
              include: { assessmentPoolQuestions: { include: { questionVersion: true } } },
            },
          },
        },
      },
    });
    if (
      !r ||
      r.kind !== kind ||
      !r.assessmentVersions.some((v) => v.version === r.currentPublishedVersion)
    )
      bad('Lesson requires a kind-matched published assessment');
    const version = r!.assessmentVersions[0]!;
    const config = configDto(version);
    const fixed = version.assessmentQuestions.map((q) => ({
      id: q.questionVersionId,
      questionId: q.questionVersion.questionId,
    }));
    const pools = version.assessmentPools.map((p) => ({
      id: p.id,
      count: p.count,
      candidates: p.assessmentPoolQuestions.map((q) => ({
        id: q.questionVersionId,
        questionId: q.questionVersion.questionId,
      })),
    }));
    draw(fixed, pools, 'course-publish-validation');
    const total = version.assessmentQuestions
      .reduce((n, q) => n.plus(q.points), decimal(0))
      .plus(
        version.assessmentPools.reduce((n, p) => n.plus(p.pointsEach.mul(p.count)), decimal(0)),
      );
    if (total.lte(0)) bad('Published assessment has no positive total');
    if (config.feedbackPolicy === 'AFTER_DUE' && !config.dueAt) bad('AFTER_DUE requires dueAt');
    if (kind === 'ASSIGNMENT') {
      const manual =
        version.assessmentQuestions.some((q) =>
          ['ESSAY', 'FILE_UPLOAD'].includes(q.questionVersion.type),
        ) ||
        version.assessmentPools.some(
          (p) =>
            p.assessmentPoolQuestions.length > 0 &&
            p.assessmentPoolQuestions.every((q) =>
              ['ESSAY', 'FILE_UPLOAD'].includes(q.questionVersion.type),
            ),
        );
      if (
        !manual ||
        !config.rubric ||
        !config.rubric.criteria.reduce((n, r) => n.plus(r.maxPoints), decimal(0)).eq(total)
      )
        bad('Assignment manual items/rubric are invalid');
    }
  }
}
