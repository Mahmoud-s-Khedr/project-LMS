import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, type AssessmentAttempt } from '@prisma/client';
import { randomBytes, createHash } from 'node:crypto';
import {
  assessmentVersionConfigSchema,
  questionResponseSchema,
  learnerQuestionSchema,
  learnerAttemptSchema,
  releasedResultSchema,
  type AccessPolicy,
  type AssessmentResultReader,
  type AnswerSave,
  type AttemptsQuery,
  type AssessmentVersionConfig,
  type EffectiveAssessmentResult,
} from '@lms/shared';
import {
  AssessmentRepository,
  type Tx,
  type Actor,
  payload,
  versionInclude,
  configDto,
  questionVersionDto,
  pageScope,
  page,
  pageOrder,
  afterWhere,
} from './assessment.repository';
import { AssessmentAuthoringService } from './authoring.service';
import { OutboxService } from '../events/outbox.service';
import {
  ASSESSMENT_ACCESS_POLICY,
  iso,
  bad,
  conflict,
  decimal,
  deadline,
  draw,
  json,
  released,
  score,
  shuffled,
  validateResponse,
} from './assessment-domain';
const questionInclude = {
  orderBy: { position: 'asc' as const },
  include: {
    questionVersion: { include: versionInclude },
    answer: { include: { answerAttachments: true } },
  },
};
export const attemptInclude = {
  enrollment: true,
  attemptQuestions: questionInclude,
  gradeEvents: { orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }], take: 1000 },
};
export type FullAttempt = Prisma.AssessmentAttemptGetPayload<{ include: typeof attemptInclude }>;
export const frozenConfig = (a: AssessmentAttempt) =>
  assessmentVersionConfigSchema.parse(a.deliverySnapshot);
export const answerDto = (a: NonNullable<FullAttempt['attemptQuestions'][number]['answer']>) => ({
  attemptQuestionId: a.attemptQuestionId,
  version: a.version,
  response: questionResponseSchema.safeParse(a.response).success
    ? questionResponseSchema.parse(a.response)
    : null,
  attachmentIds: a.answerAttachments.map((x) => x.assetId),
  savedAt: a.savedAt.toISOString(),
});
export function deliveryDto(a: FullAttempt) {
  return learnerAttemptSchema.parse({
    attemptId: a.id,
    version: a.version,
    status: a.status,
    startedAt: a.startedAt.toISOString(),
    deadlineAt: iso(a.deadlineAt),
    submittedAt: iso(a.submittedAt),
    questions: a.attemptQuestions.map((q) =>
      learnerQuestionSchema.parse({ ...(q.questionSnapshot as object), attemptQuestionId: q.id }),
    ),
    answers: a.attemptQuestions.flatMap((q) => (q.answer ? [answerDto(q.answer)] : [])),
  });
}
export const stateDto = (a: AssessmentAttempt) => ({
  attemptId: a.id,
  version: a.version,
  status: a.status,
  submittedAt: iso(a.submittedAt),
});
export const summaryDto = (a: AssessmentAttempt) => ({
  ...stateDto(a),
  workspaceId: a.workspaceId,
  assessmentId: a.assessmentId,
  enrollmentId: a.enrollmentId,
  number: a.number,
  startedAt: a.startedAt.toISOString(),
  deadlineAt: iso(a.deadlineAt),
  gradedAt: iso(a.gradedAt),
  totalPoints: a.totalPoints.toString(),
  awardedPoints: a.awardedPoints?.toString() ?? null,
  percent: a.percent?.toString() ?? null,
  passed: a.passed,
});
@Injectable()
export class AssessmentAttemptsService implements AssessmentResultReader {
  constructor(
    readonly repo: AssessmentRepository,
    private readonly authoring: AssessmentAuthoringService,
    private readonly outbox: OutboxService,
    @Optional() @Inject(ASSESSMENT_ACCESS_POLICY) private readonly access?: AccessPolicy,
  ) {}
  async ensureAccess(
    a: FullAttempt | { workspaceId: string; enrollmentId: string; lessonId: string },
    userId: string,
    at: Date,
  ) {
    if (!this.access)
      throw new ServiceUnavailableException('Learning access evaluator is not configured');
    const lessonId =
      'lessonId' in a
        ? a.lessonId
        : (
            await this.repo.prisma.assessment.findUniqueOrThrow({
              where: { id: a.assessmentId },
              select: { lessonId: true },
            })
          ).lessonId;
    const result = await this.access.evaluate({
      workspaceId: a.workspaceId,
      enrollmentId: a.enrollmentId,
      userId,
      lessonId,
      at: at.toISOString(),
    });
    if (result.allowed && result.expiresAt && new Date() >= new Date(result.expiresAt))
      throw new ForbiddenException({
        code: 'ACCESS_EXPIRED',
        message: 'Assessment access expired',
      });
    if (!result.allowed)
      throw new ForbiddenException({
        code: result.reason,
        message: 'Assessment access is locked',
        details: { reason: result.reason, unlockAt: result.unlockAt },
      });
  }
  async owner(userId: string, attemptId: string, tx: Tx = this.repo.prisma) {
    const a = await tx.assessmentAttempt.findFirst({
      where: { id: attemptId, enrollment: { userId } },
      include: attemptInclude,
    });
    if (!a) throw new NotFoundException();
    return a;
  }
  async learnerScope(userId: string, enrollmentId: string, assessmentId: string) {
    const enrollment = await this.repo.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId },
    });
    if (!enrollment) throw new NotFoundException();
    const assessment = await this.repo.prisma.assessment.findFirst({
      where: {
        id: assessmentId,
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        deletedAt: null,
      },
    });
    if (!assessment) throw new NotFoundException();
    return { enrollment, assessment };
  }
  async instructions(userId: string, enrollmentId: string, assessmentId: string) {
    const { enrollment, assessment } = await this.learnerScope(userId, enrollmentId, assessmentId);
    const now = new Date();
    await this.ensureAccess(
      { workspaceId: enrollment.workspaceId, enrollmentId, lessonId: assessment.lessonId },
      userId,
      now,
    );
    const v = await this.repo.prisma.assessmentVersion.findFirst({
      where: {
        workspaceId: enrollment.workspaceId,
        assessmentId,
        version: assessment.currentPublishedVersion ?? -1,
        status: 'PUBLISHED',
      },
    });
    if (!v) throw new NotFoundException();
    const accommodation = await this.repo.prisma.assessmentAccommodation.findUnique({
      where: { assessmentId_enrollmentId: { assessmentId, enrollmentId } },
    });
    const used = await this.repo.prisma.assessmentAttempt.count({
      where: { assessmentId, enrollmentId, status: { not: 'VOID' } },
    });
    const c = configDto(v);
    return {
      assessmentId,
      kind: assessment.kind,
      title: assessment.title,
      version: v.version,
      instructions: c.instructions,
      remainingAttempts: Math.max(0, c.maxAttempts + (accommodation?.extraAttempts ?? 0) - used),
      timeLimitSeconds:
        c.timeLimitSeconds === null
          ? null
          : c.timeLimitSeconds + (accommodation?.extraTimeSeconds ?? 0),
      availableFrom: c.availableFrom,
      dueAt: c.dueAt,
      availableUntil: iso(accommodation?.availableUntil ?? v.availableUntil),
      passPercent: c.passPercent,
      feedbackPolicy: c.feedbackPolicy,
      allowedFileTypes: c.allowedFileTypes,
      maxUploadBytes: c.maxUploadBytes,
      maxFiles: c.maxFiles,
    };
  }
  async start(userId: string, enrollmentId: string, assessmentId: string, key: string) {
    if (!/^[\x21-\x7E]{16,128}$/.test(key))
      bad('Idempotency-Key is required (16–128 visible ASCII characters)');
    const { enrollment, assessment } = await this.learnerScope(userId, enrollmentId, assessmentId);
    const expiredOpen = await this.repo.prisma.assessmentAttempt.findFirst({
      where: { assessmentId, enrollmentId, status: 'IN_PROGRESS', deadlineAt: { lte: new Date() } },
      select: { id: true },
    });
    if (expiredOpen) await this.expire(expiredOpen.id);
    return this.repo.prisma.$transaction(
      async (tx) => {
        await this.repo.lock(tx, `assessment:${assessmentId}`);
        await this.repo.lock(tx, `attempt-scope:${assessmentId}:${enrollmentId}`);
        // Fresh canonical scope and access after locks; never deliver arbitrary draft IDs.
        const root = await tx.assessment.findUniqueOrThrow({ where: { id: assessmentId } });
        const route = `assessment.start:${assessmentId}:${enrollmentId}`;
        const requestHash = createHash('sha256').update(route).digest('hex');
        const previous = await tx.idempotencyRecord.findUnique({
          where: {
            workspaceId_userId_route_key: {
              workspaceId: enrollment.workspaceId,
              userId,
              route,
              key,
            },
          },
        });
        if (previous) {
          const response = previous.response as { attemptId?: string } | null;
          if (previous.requestHash !== requestHash || !response?.attemptId)
            conflict('Idempotency key is incompatible', 'IDEMPOTENCY_CONFLICT');
          const existing = await this.owner(userId, response.attemptId, tx);
          if (existing.status === 'IN_PROGRESS')
            await this.ensureAccess(existing, userId, new Date());
          return learnerAttemptSchema.parse(previous.response);
        }
        const now = new Date();
        await this.ensureAccess(
          { workspaceId: enrollment.workspaceId, enrollmentId, lessonId: assessment.lessonId },
          userId,
          now,
        );
        const v = await tx.assessmentVersion.findFirst({
          where: {
            workspaceId: enrollment.workspaceId,
            assessmentId,
            version: root.currentPublishedVersion ?? -1,
            status: 'PUBLISHED',
          },
          include: {
            assessmentQuestions: {
              orderBy: { position: 'asc' },
              include: { questionVersion: { include: versionInclude } },
            },
            assessmentPools: {
              orderBy: { position: 'asc' },
              include: {
                assessmentPoolQuestions: {
                  include: { questionVersion: { include: versionInclude } },
                },
              },
            },
          },
        });
        if (!v) throw new NotFoundException();
        const c = configDto(v);
        const accommodation = await tx.assessmentAccommodation.findUnique({
          where: { assessmentId_enrollmentId: { assessmentId, enrollmentId } },
        });
        const until = accommodation?.availableUntil ?? v.availableUntil;
        if (v.availableFrom && now < v.availableFrom)
          conflict('Assessment is not available yet', 'CONTENT_LOCKED');
        if (until && now >= until) conflict('Assessment availability ended', 'ATTEMPT_CLOSED');
        if (!c.allowLateSubmission && v.dueAt && now >= v.dueAt)
          conflict('Due date has passed', 'ATTEMPT_CLOSED');
        const history = await tx.assessmentAttempt.findMany({
          where: { workspaceId: enrollment.workspaceId, assessmentId, enrollmentId },
          orderBy: { number: 'desc' },
        });
        const open = history.find((a) => a.status === 'IN_PROGRESS');
        if (open) {
          // Existing open attempt is returned; deadline is enforced by every delivery/write as well as worker.
          if (open.deadlineAt && now >= open.deadlineAt) {
            await this.repo.lock(tx, `attempt:${open.id}`);
            await this.submitLocked(
              tx,
              await this.owner(userId, open.id, tx),
              open.deadlineAt,
              true,
            );
          } else conflict('An attempt is already in progress', 'OPERATION_IN_PROGRESS');
        }
        if (
          history.filter((a) => a.status !== 'VOID').length >=
          c.maxAttempts + (accommodation?.extraAttempts ?? 0)
        )
          conflict('Attempt limit reached', 'ATTEMPT_LIMIT_REACHED');
        const seed = randomBytes(32).toString('hex');
        const selections = draw(
          v.assessmentQuestions.map((q) => ({
            id: q.questionVersionId,
            questionId: q.questionVersion.questionId,
          })),
          v.assessmentPools.map((p) => ({
            id: p.id,
            count: p.count,
            candidates: p.assessmentPoolQuestions.map((q) => ({
              id: q.questionVersionId,
              questionId: q.questionVersion.questionId,
            })),
          })),
          seed,
        );
        const picked = v.assessmentQuestions.map((q) => ({
          version: q.questionVersion,
          points: q.points.toString(),
          required: q.isRequired,
          position: q.position,
        }));
        for (const p of v.assessmentPools)
          for (const id of selections.get(p.id) ?? [])
            picked.push({
              version: p.assessmentPoolQuestions.find((q) => q.questionVersionId === id)!
                .questionVersion,
              points: p.pointsEach.toString(),
              required: true,
              position: p.position,
            });
        const ordered = c.shuffleQuestions
          ? shuffled(picked, seed, 'questions', (q) => q.version.id)
          : picked.sort(
              (a, b) => a.position - b.position || a.version.id.localeCompare(b.version.id),
            );
        const totalPoints = picked.reduce((n, q) => n.plus(q.points), decimal(0));
        const frozen = { ...c, availableUntil: iso(until) };
        // When late work is forbidden dueAt is also a hard cutoff, independent of worker availability.
        const hardUntil =
          !c.allowLateSubmission && v.dueAt
            ? new Date(Math.min(until?.getTime() ?? Infinity, v.dueAt.getTime()))
            : until;
        const row = await tx.assessmentAttempt.create({
          data: {
            workspaceId: enrollment.workspaceId,
            courseId: enrollment.courseId,
            assessmentId,
            assessmentVersionId: v.id,
            enrollmentId,
            number: (history[0]?.number ?? 0) + 1,
            randomSeed: seed,
            startedAt: now,
            deadlineAt: deadline(frozen, now, accommodation?.extraTimeSeconds ?? 0, hardUntil),
            totalPoints,
            deliverySnapshot: json(frozen),
          },
        });
        await tx.attemptQuestion.createMany({
          data: ordered.map((q, position) => {
            const p = payload(q.version);
            const options = c.shuffleOptions
              ? shuffled(p.options, seed, q.version.id, (o) => o.key)
              : p.options;
            return {
              workspaceId: enrollment.workspaceId,
              attemptId: row.id,
              questionVersionId: q.version.id,
              position,
              points: q.points,
              isRequired: q.required,
              questionSnapshot: json({
                type: p.type,
                prompt: p.prompt,
                options: options.map((o, i) => ({ ...o, position: i })),
                points: q.points,
                position,
                isRequired: q.required,
              }),
              optionOrder: json(options.map((o) => o.key)),
            };
          }),
        });
        const created = await tx.assessmentAttempt.findUniqueOrThrow({
          where: { id: row.id },
          include: attemptInclude,
        });
        await tx.idempotencyRecord.create({
          data: {
            workspaceId: enrollment.workspaceId,
            userId,
            key,
            route,
            requestHash,
            status: 'COMPLETED',
            responseStatus: 201,
            response: json(deliveryDto(created)),
            expiresAt: new Date(now.getTime() + 86400000),
          },
        });
        await this.repo.auditChange(
          tx,
          { id: userId, platformRole: 'STUDENT' },
          created.workspaceId,
          created.id,
          'assessment.attempt.started',
        );
        return deliveryDto(created);
      },
      { timeout: 20000 },
    );
  }
  async get(userId: string, id: string) {
    let a = await this.owner(userId, id);
    if (a.status === 'IN_PROGRESS') {
      await this.ensureAccess(a, userId, new Date());
      if (a.deadlineAt && new Date() >= a.deadlineAt) {
        await this.expire(id);
        a = await this.owner(userId, id);
      }
    }
    return deliveryDto(a);
  }
  async attachments(tx: Tx, a: FullAttempt, ids: string[], config: AssessmentVersionConfig) {
    if (ids.length > config.maxFiles) bad('Too many attachments');
    if (!ids.length) return;
    const assets = await tx.asset.findMany({
      where: {
        id: { in: ids },
        workspaceId: a.workspaceId,
        uploadedById: a.enrollment.userId,
        deletedAt: null,
        status: 'READY',
        visibility: 'PRIVATE',
      },
    });
    if (
      assets.length !== ids.length ||
      assets.some(
        (f) =>
          !config.allowedFileTypes.includes(
            f.mimeType as (typeof config.allowedFileTypes)[number],
          ) ||
          f.sizeBytes > BigInt(config.maxUploadBytes) ||
          !f.verifiedAt ||
          (f.metadata as { purpose?: string; parentId?: string }).purpose !== 'SUBMISSION' ||
          (f.metadata as { parentId?: string }).parentId !== a.id,
      )
    )
      bad('Attachments must be owned, private, verified, ready and within file policy');
  }
  async save(userId: string, id: string, questionId: string, input: AnswerSave) {
    await this.owner(userId, id);
    const result = await this.repo.prisma.$transaction(async (tx) => {
      await this.repo.lock(tx, `attempt:${id}`);
      const a = await this.owner(userId, id, tx);
      let now = new Date();
      await this.ensureAccess(a, userId, now);
      now = new Date();
      if (a.status !== 'IN_PROGRESS') return null;
      if (a.deadlineAt && now >= a.deadlineAt) {
        await this.submitLocked(tx, a, a.deadlineAt, true);
        return null;
      }
      const q = a.attemptQuestions.find((q) => q.id === questionId);
      if (!q) throw new NotFoundException();
      validateResponse(payload(q.questionVersion), input.response);
      if (input.version !== (q.answer?.version ?? 1))
        conflict('Answer changed; reload before saving');
      const ids = input.attachmentIds ?? [];
      await this.attachments(tx, a, ids, frozenConfig(a));
      // The one-to-one answer identity equals its attempt question identity; shared grading DTOs expose this stable UUID.
      const row = await tx.attemptAnswer.upsert({
        where: { attemptQuestionId: q.id },
        create: {
          id: q.id,
          workspaceId: a.workspaceId,
          attemptId: id,
          attemptQuestionId: q.id,
          response: json(input.response),
          version: 2,
          savedAt: now,
        },
        update: { response: json(input.response), version: { increment: 1 }, savedAt: now },
      });
      await tx.answerAttachment.deleteMany({
        where: { answerId: row.id, workspaceId: a.workspaceId },
      });
      await tx.answerAttachment.createMany({
        data: ids.map((assetId) => ({ workspaceId: a.workspaceId, answerId: row.id, assetId })),
      });
      return answerDto({
        ...row,
        answerAttachments: await tx.answerAttachment.findMany({
          where: { answerId: row.id, workspaceId: a.workspaceId },
        }),
      });
    });
    if (!result) conflict('Attempt is closed', 'ATTEMPT_CLOSED');
    return result;
  }
  async submit(userId: string, id: string, key: string) {
    if (!/^[\x21-\x7E]{16,128}$/.test(key))
      bad('Idempotency-Key is required (16–128 visible ASCII characters)');
    await this.owner(userId, id);
    return this.repo.prisma.$transaction(
      async (tx) => {
        await this.repo.lock(tx, `attempt:${id}`);
        const a = await this.owner(userId, id, tx);
        const route = `assessment.submit:${id}`;
        const previous = await tx.idempotencyRecord.findUnique({
          where: {
            workspaceId_userId_route_key: { workspaceId: a.workspaceId, userId, route, key },
          },
        });
        if (previous) return previous.response as ReturnType<typeof stateDto>;
        let now = new Date();
        if (a.status === 'IN_PROGRESS') await this.ensureAccess(a, userId, now);
        now = new Date();
        const expired = !!a.deadlineAt && now >= a.deadlineAt;
        const result = stateDto(
          a.status === 'IN_PROGRESS'
            ? await this.submitLocked(
                tx,
                a,
                expired ? a.deadlineAt! : now,
                expired,
                expired ? null : { id: userId, platformRole: 'STUDENT' },
              )
            : a,
        );
        await tx.idempotencyRecord.create({
          data: {
            workspaceId: a.workspaceId,
            userId,
            route,
            key,
            requestHash: createHash('sha256').update(route).digest('hex'),
            status: 'COMPLETED',
            responseStatus: 200,
            response: json(result),
            expiresAt: new Date(now.getTime() + 86400000),
          },
        });
        return result;
      },
      { timeout: 20000 },
    );
  }
  async submitLocked(
    tx: Tx,
    a: FullAttempt,
    at: Date,
    forced: boolean,
    actor: Actor | null = null,
  ) {
    if (a.status !== 'IN_PROGRESS') return a;
    const c = frozenConfig(a);
    let manual = false;
    for (const q of a.attemptQuestions) {
      const response = questionResponseSchema.safeParse(q.answer?.response);
      const r = response.success ? response.data : null;
      const ids = q.answer?.answerAttachments.map((x) => x.assetId) ?? [];
      const missing =
        !r ||
        (r.type === 'FILE_UPLOAD' && !ids.length) ||
        (r.type === 'SHORT_ANSWER' && !r.text.trim()) ||
        (r.type === 'MULTIPLE_CHOICE' && !r.optionKeys.length) ||
        (r.type === 'MATCHING' && !r.pairs.length) ||
        (r.type === 'ORDERING' && !r.optionKeys.length) ||
        (r.type === 'ESSAY' &&
          !r.document.content.some((block) =>
            block.content.some((text) => text.text.trim().length > 0),
          ));
      if (!forced && q.isRequired && missing) bad('Required responses are missing');
      let validFiles = true;
      try {
        await this.attachments(tx, a, ids, c);
      } catch (e) {
        if (!forced) throw e;
        validFiles = false;
      }
      const calculated = score(
        payload(q.questionVersion),
        missing || !validFiles ? null : r,
        q.points.toString(),
      );
      const needsManual = calculated.points === null && !missing && validFiles;
      manual ||= needsManual;
      const awardedPoints = needsManual ? null : (calculated.points ?? '0');
      const answer = await tx.attemptAnswer.upsert({
        where: { attemptQuestionId: q.id },
        create: {
          id: q.id,
          workspaceId: a.workspaceId,
          attemptId: a.id,
          attemptQuestionId: q.id,
          response: r ? json(r) : {},
          awardedPoints,
          isCorrect: calculated.correct,
          requiresManualGrading: needsManual,
        },
        update: {
          awardedPoints,
          isCorrect: calculated.correct,
          requiresManualGrading: needsManual,
        },
      });
      if (!needsManual)
        await tx.gradeEvent.create({
          data: {
            workspaceId: a.workspaceId,
            attemptId: a.id,
            answerId: answer.id,
            awardedPoints: awardedPoints!,
            reason: 'Automatic submission scoring',
            isAutomatic: true,
          },
        });
    }
    const updated = await tx.assessmentAttempt.update({
      where: { id: a.id },
      data: {
        status: manual ? 'GRADING' : 'SUBMITTED',
        submittedAt: at,
        isLate: !!c.dueAt && at.getTime() > Date.parse(c.dueAt),
        version: { increment: 1 },
      },
    });
    await this.outbox.append(tx, {
      workspaceId: a.workspaceId,
      aggregateType: 'AssessmentAttempt',
      aggregateId: a.id,
      type: 'assessment.submitted.v1',
      payload: { attemptId: a.id },
    });
    await this.repo.auditChange(tx, actor, a.workspaceId, a.id, 'assessment.attempt.submitted');
    return manual ? updated : this.finalize(tx, updated, false);
  }
  async finalize(tx: Tx, a: AssessmentAttempt, changed: boolean) {
    const answers = await tx.attemptAnswer.findMany({
      where: { workspaceId: a.workspaceId, attemptId: a.id },
    });
    if (answers.some((q) => q.awardedPoints === null))
      bad('All answers require a grade before finalization');
    const c = frozenConfig(a);
    let points = answers.reduce((n, q) => n.plus(q.awardedPoints ?? 0), decimal(0));
    if (a.isLate) points = points.mul(decimal(100).minus(c.latePenaltyPercent)).div(100);
    points = Prisma.Decimal.min(a.totalPoints, Prisma.Decimal.max(0, points)).toDecimalPlaces(
      3,
      Prisma.Decimal.ROUND_DOWN,
    );
    const percent = points
      .mul(100)
      .div(a.totalPoints)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const result = await tx.assessmentAttempt.update({
      where: { id: a.id },
      data: {
        status: 'GRADED',
        awardedPoints: points,
        percent,
        passed: points.mul(100).div(a.totalPoints).gte(c.passPercent),
        gradedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await this.outbox.append(tx, {
      workspaceId: a.workspaceId,
      aggregateType: 'AssessmentAttempt',
      aggregateId: a.id,
      type: 'assessment.graded.v1',
      payload: { attemptId: a.id },
    });
    // Effective result can change on every finalized attempt, including a first result.
    await this.resultChanged(tx, a);
    await this.repo.auditChange(
      tx,
      null,
      a.workspaceId,
      a.id,
      changed ? 'assessment.attempt.regraded' : 'assessment.attempt.finalized',
    );
    return result;
  }
  async resultChanged(tx: Tx, a: AssessmentAttempt) {
    await this.outbox.append(tx, {
      workspaceId: a.workspaceId,
      aggregateType: 'Assessment',
      aggregateId: a.assessmentId,
      type: 'assessment.result.changed.v1',
      payload: { assessmentId: a.assessmentId, enrollmentId: a.enrollmentId },
    });
  }
  async expire(id: string): Promise<void> {
    await this.repo.prisma.$transaction(
      async (tx) => {
        await this.repo.lock(tx, `attempt:${id}`);
        const a = await tx.assessmentAttempt.findUnique({ where: { id }, include: attemptInclude });
        if (a?.status === 'IN_PROGRESS' && a.deadlineAt && new Date() >= a.deadlineAt)
          await this.submitLocked(tx, a, a.deadlineAt, true);
      },
      { timeout: 20000 },
    );
  }
  async result(userId: string, id: string) {
    const a = await this.owner(userId, id);
    if (a.status !== 'GRADED' || !released(frozenConfig(a), a.gradedAt, new Date()))
      conflict('Grade has not been released', 'GRADE_NOT_RELEASED');
    return releasedResultSchema.parse({
      attemptId: a.id,
      assessmentId: a.assessmentId,
      number: a.number,
      status: 'GRADED',
      totalPoints: a.totalPoints.toString(),
      awardedPoints: a.awardedPoints!.toString(),
      percent: a.percent!.toString(),
      passed: a.passed!,
      gradedAt: a.gradedAt!.toISOString(),
      answers: a.attemptQuestions.map((q) => ({
        attemptQuestionId: q.id,
        awardedPoints: q.answer?.awardedPoints?.toString() ?? '0',
        isCorrect: q.answer?.isCorrect ?? null,
        feedback: q.answer?.feedback ?? null,
      })),
    });
  }
  async effectiveResult(input: {
    workspaceId: string;
    enrollmentId: string;
    assessmentId: string;
  }): Promise<EffectiveAssessmentResult> {
    const root = await this.repo.prisma.assessment.findFirst({
      where: { id: input.assessmentId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    if (!root) return { finalized: false, passed: false, percent: null };
    // The learner's first nonvoid attempt freezes the aggregation policy across later publications.
    const first = await this.repo.prisma.assessmentAttempt.findFirst({
      where: { ...input, status: { not: 'VOID' } },
      orderBy: { number: 'asc' },
    });
    const policy = first ? frozenConfig(first).gradePolicy : 'HIGHEST';
    const selected = await this.repo.prisma.assessmentAttempt.findFirst({
      where: { ...input, status: 'GRADED' },
      orderBy:
        policy === 'HIGHEST'
          ? [{ percent: 'desc' }, { number: 'desc' }]
          : { number: policy === 'FIRST' ? 'asc' : 'desc' },
    });
    return selected
      ? { finalized: true, passed: selected.passed!, percent: selected.percent!.toString() }
      : { finalized: false, passed: false, percent: null };
  }
  async staffList(a: Actor, w: string, c: string, id: string, q: AttemptsQuery) {
    await this.authoring.assessment(a, w, c, id, 'grade');
    const { cursor, limit, ...filters } = q;
    const p = pageScope({ a: a.id, w, c, id, filters }, cursor);
    const rows = await this.repo.prisma.assessmentAttempt.findMany({
      where: {
        workspaceId: w,
        courseId: c,
        assessmentId: id,
        ...afterWhere(p.after),
        ...(q.status ? { status: q.status } : {}),
        ...(q.cohortId || q.userId
          ? {
              enrollment: {
                ...(q.cohortId ? { cohortId: q.cohortId } : {}),
                ...(q.userId ? { userId: q.userId } : {}),
              },
            }
          : {}),
        ...(q.from || q.to
          ? {
              startedAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: pageOrder,
      take: limit + 1,
    });
    await this.repo.auditChange(this.repo.prisma, a, w, id, 'assessment.grading.queue.read');
    return page(rows, limit, p.hash, summaryDto);
  }
  async staffAttempt(
    a: Actor,
    w: string,
    c: string,
    assessmentId: string,
    id: string,
    tx: Tx = this.repo.prisma,
  ) {
    await this.authoring.assessment(a, w, c, assessmentId, 'grade', tx);
    const r = await tx.assessmentAttempt.findFirst({
      where: { id, workspaceId: w, courseId: c, assessmentId },
      include: attemptInclude,
    });
    if (!r) throw new NotFoundException();
    return r;
  }
  async staffDetail(a: Actor, w: string, c: string, assessmentId: string, id: string) {
    const r = await this.staffAttempt(a, w, c, assessmentId, id);
    await this.repo.auditChange(this.repo.prisma, a, w, id, 'assessment.submission.read');
    return {
      ...summaryDto(r),
      rubric: frozenConfig(r).rubric,
      questions: r.attemptQuestions.map((q) => ({
        delivery: learnerQuestionSchema.parse({
          ...(q.questionSnapshot as object),
          attemptQuestionId: q.id,
        }),
        authorVersion: questionVersionDto(q.questionVersion),
        answer: q.answer ? answerDto(q.answer) : null,
      })),
      gradeEvents: [...r.gradeEvents].reverse().map((g) => ({
        ...g,
        attemptQuestionId: r.attemptQuestions.find((q) => q.answer?.id === g.answerId)?.id ?? null,
        previousPoints: g.previousPoints?.toString() ?? null,
        awardedPoints: g.awardedPoints.toString(),
        createdAt: g.createdAt.toISOString(),
      })),
    };
  }
}
