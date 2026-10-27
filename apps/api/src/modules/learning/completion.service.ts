import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AssessmentResultReader } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import {
  LEARNING_ASSESSMENT_RESULTS,
  LEARNING_CLOCK,
  json,
  lockEnrollmentRow,
  systemClock,
  type LearningClock,
  type Tx,
} from './learning.support';
import { floorPercent, parseSnapshot, type CompletionSnapshot } from './progress-math';

type EnrollmentCore = {
  id: string;
  workspaceId: string;
  courseId: string;
  startedAt: Date | null;
  completedAt: Date | null;
  policySnapshot: Prisma.JsonValue;
};

/**
 * Owns the server-derived completion projection: freezing the required-lesson snapshot, stamping lesson
 * completion once, recomputing enrollment completion and emitting `course.completed.v1` exactly once.
 * Nothing here is reachable with client-provided grades, pass flags or certificates.
 */
@Injectable()
export class LearningCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Optional()
    @Inject(LEARNING_ASSESSMENT_RESULTS)
    private readonly results?: AssessmentResultReader,
    @Optional() @Inject(LEARNING_CLOCK) private readonly clock: LearningClock = systemClock,
  ) {}

  /** Freeze the completion criteria the first time learning is observed (CAS on startedAt). */
  async ensureStarted(tx: Tx, enrollment: EnrollmentCore, now: Date): Promise<CompletionSnapshot> {
    const existing = enrollment.startedAt ? parseSnapshot(enrollment.policySnapshot) : null;
    if (existing) return existing;
    const lessons = await tx.lesson.findMany({
      where: {
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        deletedAt: null,
        isPublished: true,
        isRequired: true,
        section: { deletedAt: null },
      },
      select: { id: true, completionRule: true, requiredWatchPercent: true },
      orderBy: { id: 'asc' },
    });
    const snapshot: CompletionSnapshot = {
      version: 1,
      frozenAt: now.toISOString(),
      requiredLessonIds: lessons.map((l) => l.id),
      criteria: Object.fromEntries(
        lessons.map((l) => [
          l.id,
          { rule: l.completionRule, requiredWatchPercent: l.requiredWatchPercent },
        ]),
      ),
    };
    const updated = await tx.enrollment.updateMany({
      where: { id: enrollment.id, startedAt: null },
      data: { startedAt: now, policySnapshot: json(snapshot) },
    });
    if (updated.count === 1) return snapshot;
    // Lost a race with another starter: the stored snapshot is authoritative.
    const stored = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } });
    return parseSnapshot(stored.policySnapshot) ?? snapshot;
  }

  /** Stamp lesson completion once; emits `lesson.completed.v1` only on the null→set transition. */
  async completeLesson(
    tx: Tx,
    enrollment: Pick<EnrollmentCore, 'id' | 'workspaceId' | 'courseId'>,
    lessonId: string,
    now: Date,
  ): Promise<boolean> {
    await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: {
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        enrollmentId: enrollment.id,
        lessonId,
        lastViewedAt: now,
      },
      update: {},
    });
    const cas = await tx.lessonProgress.updateMany({
      where: { enrollmentId: enrollment.id, lessonId, completedAt: null },
      data: { completedAt: now, completionPercent: new Prisma.Decimal(100) },
    });
    if (cas.count !== 1) return false;
    await this.outbox.append(tx, {
      workspaceId: enrollment.workspaceId,
      aggregateType: 'Enrollment',
      aggregateId: enrollment.id,
      type: 'lesson.completed.v1',
      payload: { enrollmentId: enrollment.id, lessonId },
    });
    return true;
  }

  /**
   * Recompute enrollment completion from the frozen snapshot. completedAt is stamped once (compare-and-set)
   * and never cleared, so regrades or later authoring changes cannot silently revoke completion.
   */
  async recompute(
    tx: Tx,
    enrollment: EnrollmentCore,
    now: Date,
  ): Promise<{ completedNow: boolean }> {
    const snapshot = parseSnapshot(enrollment.policySnapshot);
    if (!snapshot) return { completedNow: false };
    const live = await tx.lesson.findMany({
      where: {
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        id: { in: snapshot.requiredLessonIds },
        deletedAt: null,
        section: { deletedAt: null },
      },
      select: { id: true },
    });
    const total = live.length;
    const done = total
      ? await tx.lessonProgress.count({
          where: {
            enrollmentId: enrollment.id,
            lessonId: { in: live.map((l) => l.id) },
            completedAt: { not: null },
          },
        })
      : 0;
    const percent = floorPercent(done, total);
    const finished = total > 0 && done === total;
    if (finished && !enrollment.completedAt) {
      const cas = await tx.enrollment.updateMany({
        where: { id: enrollment.id, completedAt: null },
        data: { completedAt: now, completionPercent: new Prisma.Decimal(100) },
      });
      if (cas.count === 1) {
        await this.outbox.append(tx, {
          workspaceId: enrollment.workspaceId,
          aggregateType: 'Enrollment',
          aggregateId: enrollment.id,
          type: 'course.completed.v1',
          payload: { enrollmentId: enrollment.id },
        });
        await this.audit.append(tx, {
          action: 'enrollment.completed',
          resourceType: 'Enrollment',
          resourceId: enrollment.id,
          actorId: null,
          workspaceId: enrollment.workspaceId,
          requestId: randomUUID(),
        });
        return { completedNow: true };
      }
      return { completedNow: false };
    }
    if (!enrollment.completedAt) {
      await tx.enrollment.updateMany({
        where: { id: enrollment.id, completedAt: null },
        data: { completionPercent: new Prisma.Decimal(percent) },
      });
    }
    return { completedNow: false };
  }

  /**
   * Derive completion for lessons the learner cannot self-report (assessment pass, live attendance) from
   * authoritative sources. Idempotent; safe to call from event consumers, reads and the backstop task.
   */
  async reconcile(
    enrollmentId: string,
  ): Promise<{ lessonsCompleted: number; courseCompleted: boolean }> {
    return this.prisma.$transaction((tx) => this.reconcileInTx(tx, enrollmentId), {
      timeout: 20000,
    });
  }

  async reconcileInTx(
    tx: Tx,
    enrollmentId: string,
  ): Promise<{ lessonsCompleted: number; courseCompleted: boolean }> {
    const head = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { workspaceId: true },
    });
    if (!head) return { lessonsCompleted: 0, courseCompleted: false };
    await lockEnrollmentRow(tx, head.workspaceId, enrollmentId);
    const now = this.clock.now();
    let enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    if (enrollment.status === 'REVOKED') return { lessonsCompleted: 0, courseCompleted: false };
    const auto = await tx.lesson.findMany({
      where: {
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        deletedAt: null,
        isPublished: true,
        section: { deletedAt: null },
        completionRule: { in: ['ASSESSMENT_PASS', 'ATTENDANCE'] },
      },
      select: { id: true, body: true, completionRule: true },
    });
    const completedIds = new Set(
      (
        await tx.lessonProgress.findMany({
          where: { enrollmentId, completedAt: { not: null } },
          select: { lessonId: true },
        })
      ).map((p) => p.lessonId),
    );
    const pending = auto.filter((l) => !completedIds.has(l.id));
    if (pending.length === 0) return { lessonsCompleted: 0, courseCompleted: false };
    const snapshot = await this.ensureStarted(tx, enrollment, now);
    enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    let lessonsCompleted = 0;
    for (const lesson of pending) {
      const rule = snapshot.criteria[lesson.id]?.rule ?? lesson.completionRule;
      if (await this.satisfied(tx, enrollment, lesson, rule)) {
        if (await this.completeLesson(tx, enrollment, lesson.id, now)) lessonsCompleted += 1;
      }
    }
    let courseCompleted = false;
    if (lessonsCompleted > 0) {
      await tx.enrollment.update({ where: { id: enrollmentId }, data: { lastActivityAt: now } });
      courseCompleted = (await this.recompute(tx, enrollment, now)).completedNow;
    }
    return { lessonsCompleted, courseCompleted };
  }

  private async satisfied(
    tx: Tx,
    enrollment: { id: string; workspaceId: string },
    lesson: { id: string; body: Prisma.JsonValue },
    rule: string,
  ): Promise<boolean> {
    if (rule === 'ASSESSMENT_PASS') {
      const assessment = await tx.assessment.findFirst({
        where: { lessonId: lesson.id, workspaceId: enrollment.workspaceId, deletedAt: null },
        select: { id: true },
      });
      if (!assessment || !this.results) return false;
      const result = await this.results.effectiveResult({
        workspaceId: enrollment.workspaceId,
        enrollmentId: enrollment.id,
        assessmentId: assessment.id,
      });
      return result.finalized && result.passed;
    }
    if (rule === 'ATTENDANCE') {
      const body = lesson.body as { qualifyingSessionId?: string | null } | null;
      const qualifying = body?.qualifyingSessionId ?? null;
      const attended = await tx.attendance.count({
        where: {
          workspaceId: enrollment.workspaceId,
          enrollmentId: enrollment.id,
          status: 'ATTENDED',
          session: { lessonId: lesson.id, deletedAt: null },
          ...(qualifying ? { sessionId: qualifying } : {}),
        },
      });
      return attended > 0;
    }
    return false;
  }
}
