import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { rubricSchema, type GradingInput } from '@lms/shared';
import { type Actor } from './assessment.repository';
import { AssessmentAttemptsService, frozenConfig, stateDto } from './attempts.service';
import { bad, conflict, decimal, json } from './assessment-domain';
@Injectable()
export class AssessmentGradingService {
  constructor(private readonly attempts: AssessmentAttemptsService) {}
  async grade(
    actor: Actor,
    w: string,
    c: string,
    assessmentId: string,
    id: string,
    input: GradingInput,
    regrade: boolean,
    requestId: string,
  ) {
    await this.attempts.staffAttempt(actor, w, c, assessmentId, id);
    return this.attempts.repo.prisma.$transaction(async (tx) => {
      await this.attempts.repo.lock(tx, `attempt:${id}`);
      const a = await this.attempts.staffAttempt(actor, w, c, assessmentId, id, tx);
      if (a.version !== input.version) conflict('Grading changed; reload submission');
      if (regrade ? a.status !== 'GRADED' : !['SUBMITTED', 'GRADING'].includes(a.status))
        conflict('Attempt is not eligible for this grading action', 'CONFLICT');
      const config = frozenConfig(a);
      const rubric = config.rubric ? rubricSchema.parse(config.rubric) : null;
      // Rubric criteria are assignment-wide; each criterion may be allocated once across answers.
      const seen = new Set<string>();
      for (const grade of input.answers) {
        const question = a.attemptQuestions.find(
          (q) => q.answer?.id === grade.answerId || q.id === grade.answerId,
        );
        if (!question?.answer) bad('Answer does not belong to this attempt');
        if (decimal(grade.awardedPoints).gt(question.points))
          bad('Awarded points exceed question maximum');
        if (grade.rubricScores) {
          if (!rubric) bad('This assessment has no rubric');
          let sum = decimal(0);
          for (const item of grade.rubricScores) {
            const criterion = rubric.criteria.find((r) => r.id === item.criterionId);
            if (
              !criterion ||
              seen.has(item.criterionId) ||
              decimal(item.points).gt(criterion.maxPoints)
            )
              bad('Invalid, repeated or excessive rubric criterion');
            seen.add(item.criterionId);
            sum = sum.plus(item.points);
          }
          if (!sum.eq(grade.awardedPoints)) bad('Rubric scores must equal awarded points');
        } else if (rubric && question.answer.requiresManualGrading)
          bad('Manual rubric scores are required');
        await tx.gradeEvent.create({
          data: {
            workspaceId: w,
            attemptId: id,
            // Strictly increasing revision timestamp makes latest rubric projection unambiguous,
            // including successive draft grades committed in the same millisecond.
            createdAt: new Date(
              Math.max(Date.now(), (a.gradeEvents[0]?.createdAt.getTime() ?? 0) + 1),
            ),
            answerId: question.answer.id,
            previousPoints: question.answer.awardedPoints,
            awardedPoints: grade.awardedPoints,
            rubricScores: grade.rubricScores ? json(grade.rubricScores) : Prisma.DbNull,
            feedback: grade.feedback,
            reason: input.reason,
            gradedById: actor.id,
            isAutomatic: false,
          },
        });
        await tx.attemptAnswer.update({
          where: { id: question.answer.id },
          data: {
            awardedPoints: grade.awardedPoints,
            feedback: grade.feedback,
            isCorrect: decimal(grade.awardedPoints).eq(question.points),
            version: { increment: 1 },
          },
        });
      }
      if (rubric) {
        // Validate the latest persisted rubric projection, so draft updates can be submitted incrementally.
        const events = await tx.gradeEvent.findMany({
          where: { workspaceId: w, attemptId: id, isAutomatic: false },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const byAnswer = new Map<string, (typeof events)[number]>();
        for (const event of events)
          if (event.answerId && !byAnswer.has(event.answerId)) byAnswer.set(event.answerId, event);
        const used = new Set<string>();
        for (const event of byAnswer.values())
          for (const item of (event.rubricScores ?? []) as Array<{ criterionId: string }>) {
            if (used.has(item.criterionId)) bad('Rubric criterion allocated to multiple answers');
            used.add(item.criterionId);
          }
        if (input.final && rubric.criteria.some((r) => !used.has(r.id)))
          bad('Final grade requires all rubric criteria');
      }
      const updated = await tx.assessmentAttempt.update({
        where: { id },
        data: { status: input.final ? a.status : 'GRADING', version: { increment: 1 } },
      });
      if (regrade && !input.final) bad('Regrades must finalize atomically');
      const result = input.final ? await this.attempts.finalize(tx, updated, regrade) : updated;
      await this.attempts.repo.auditChange(
        tx,
        actor,
        w,
        id,
        regrade ? 'assessment.grade.revised' : 'assessment.grade.saved',
        requestId,
      );
      return stateDto(result);
    });
  }
  async void(
    actor: Actor,
    w: string,
    c: string,
    assessmentId: string,
    id: string,
    input: { version: number; reason: string },
    requestId: string,
  ) {
    await this.attempts.repo.course(actor, w, c, 'publish');
    return this.attempts.repo.prisma.$transaction(async (tx) => {
      await this.attempts.repo.lock(tx, `attempt:${id}`);
      const a = await this.attempts.staffAttempt(actor, w, c, assessmentId, id, tx);
      if (a.version !== input.version) conflict('Attempt changed');
      if (a.status === 'VOID') return stateDto(a);
      const result = await tx.assessmentAttempt.update({
        where: { id },
        data: { status: 'VOID', version: { increment: 1 } },
      });
      // Preserve reason in append-only audit; never erase grades or evidence.
      await this.attempts.repo.audit.append(tx, {
        actorId: actor.id,
        workspaceId: w,
        action: 'assessment.attempt.voided',
        resourceType: 'AssessmentAttempt',
        resourceId: id,
        requestId,
        changes: { reason: input.reason },
      });
      await this.attempts.resultChanged(tx, a);
      return stateDto(result);
    });
  }
}
