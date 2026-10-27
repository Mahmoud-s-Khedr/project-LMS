import { Inject, Injectable, Optional } from '@nestjs/common';
import type { AccessPolicy, EffectiveAccess } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  deny,
  evaluateEnrollmentAccess,
  evaluateLessonAccess,
  type AccessEnrollment,
  type LessonFacts,
} from './availability';
import { LEARNING_CLOCK, systemClock, type Db, type LearningClock } from './learning.support';

export const enrollmentAccessInclude = {
  user: { select: { status: true, deletedAt: true } },
  workspace: { select: { status: true, deletedAt: true } },
  course: { select: { deletedAt: true } },
  cohort: { select: { startsAt: true, endsAt: true } },
  enrollmentGrants: {
    select: { id: true, source: true, startsAt: true, expiresAt: true, revokedAt: true },
  },
} as const;

type LoadedEnrollment = NonNullable<Awaited<ReturnType<LearnerAccessPolicy['loadEnrollment']>>>;
export type AccessSubject = { workspaceId: string; enrollmentId: string; userId?: string };
export type EnrollmentRef = {
  id: string;
  workspaceId: string;
  courseId: string;
  cohortId: string | null;
  userId: string;
};

export function toAccessEnrollment(row: LoadedEnrollment): AccessEnrollment {
  return {
    status: row.status,
    enrolledAt: row.enrolledAt,
    user: row.user,
    workspace: row.workspace,
    course: row.course,
    cohort: row.cohort,
    grants: row.enrollmentGrants,
  };
}

/**
 * Concrete learner AccessPolicy bound to `Symbol.for('lms.learning.AccessPolicy')`. It is read-only and is
 * authoritative for: enrollment ownership, user/workspace/course state, grants (expiry/revocation),
 * cohort bounds, drip windows and course/lesson prerequisites. Callers (content, media, assessments) must
 * still treat `allowed:false` as a 404/403 according to their own contract.
 */
@Injectable()
export class LearnerAccessPolicy implements AccessPolicy {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(LEARNING_CLOCK) private readonly clock: LearningClock = systemClock,
  ) {}

  async evaluate(
    input: Parameters<AccessPolicy['evaluate']>[0],
    db: Db = this.prisma,
  ): Promise<EffectiveAccess> {
    const at = new Date(input.at);
    if (Number.isNaN(at.getTime())) throw new TypeError('Invalid access evaluation time');
    const enrollment = await this.loadEnrollment(db, input);
    if (!enrollment) return deny('ENROLLMENT_REQUIRED');
    const access = toAccessEnrollment(enrollment);
    if (!input.lessonId) return evaluateEnrollmentAccess(access, at);
    const facts = await this.lessonFacts(db, enrollment, [input.lessonId]);
    const lessonFacts = facts.get(input.lessonId);
    if (!lessonFacts) {
      const base = evaluateEnrollmentAccess(access, at);
      return base.allowed ? deny('CONTENT_LOCKED') : base;
    }
    return evaluateLessonAccess(access, lessonFacts, at);
  }

  /** Evaluate at the policy's clock; convenience for internal callers. */
  evaluateNow(input: Omit<Parameters<AccessPolicy['evaluate']>[0], 'at'>, db: Db = this.prisma) {
    return this.evaluate({ ...input, at: this.clock.now().toISOString() }, db);
  }

  async loadEnrollment(db: Db, input: AccessSubject) {
    return db.enrollment.findFirst({
      where: {
        id: input.enrollmentId,
        workspaceId: input.workspaceId,
        ...(input.userId ? { userId: input.userId } : {}),
      },
      include: enrollmentAccessInclude,
    });
  }

  /** Whether any course prerequisite of the enrollment's course is unmet by this learner. */
  async coursePrerequisitesUnmet(
    db: Db,
    enrollment: { workspaceId: string; courseId: string; userId: string },
  ): Promise<boolean> {
    const edges = await db.coursePrerequisite.findMany({
      where: { workspaceId: enrollment.workspaceId, courseId: enrollment.courseId },
      select: { requiredCourseId: true, minimumPercent: true },
    });
    if (edges.length === 0) return false;
    const done = await db.enrollment.findMany({
      where: {
        workspaceId: enrollment.workspaceId,
        userId: enrollment.userId,
        courseId: { in: edges.map((e) => e.requiredCourseId) },
      },
      select: { courseId: true, completionPercent: true, completedAt: true },
    });
    const byCourse = new Map(done.map((d) => [d.courseId, d]));
    return edges.some((edge) => {
      const e = byCourse.get(edge.requiredCourseId);
      return !e || !(e.completedAt || e.completionPercent.gte(edge.minimumPercent));
    });
  }

  /**
   * Per-lesson facts for pure evaluation. Loads lessons, cohort overrides, prerequisite edges and the
   * learner's completed lessons in a fixed number of queries regardless of lesson count.
   */
  async lessonFacts(
    db: Db,
    enrollment: EnrollmentRef,
    lessonIds: readonly string[] | 'ALL',
  ): Promise<Map<string, LessonFacts>> {
    const { workspaceId, courseId } = enrollment;
    const enrollmentId = enrollment.id;
    const lessons = await db.lesson.findMany({
      where: {
        workspaceId,
        courseId,
        ...(lessonIds === 'ALL' ? {} : { id: { in: [...lessonIds] } }),
      },
      select: {
        id: true,
        isPublished: true,
        deletedAt: true,
        releaseType: true,
        releaseAt: true,
        releaseOffsetDays: true,
        availableUntil: true,
        section: { select: { deletedAt: true } },
      },
    });
    const ids = lessons.map((l) => l.id);
    const [edges, releases, courseUnmet] = await Promise.all([
      db.lessonPrerequisite.findMany({
        where: { workspaceId, courseId, lessonId: { in: ids } },
        select: {
          lessonId: true,
          requiredLessonId: true,
          requiredLesson: { select: { deletedAt: true } },
        },
      }),
      enrollment.cohortId
        ? db.cohortLessonRelease.findMany({
            where: { workspaceId, courseId, cohortId: enrollment.cohortId, lessonId: { in: ids } },
            select: { lessonId: true, releaseAt: true, availableUntil: true },
          })
        : Promise.resolve([]),
      this.coursePrerequisitesUnmet(db, enrollment),
    ]);
    const required = [...new Set(edges.map((e) => e.requiredLessonId))];
    const completed = required.length
      ? new Set(
          (
            await db.lessonProgress.findMany({
              where: {
                workspaceId,
                enrollmentId,
                lessonId: { in: required },
                completedAt: { not: null },
              },
              select: { lessonId: true },
            })
          ).map((p) => p.lessonId),
        )
      : new Set<string>();
    const releaseByLesson = new Map(releases.map((r) => [r.lessonId, r]));
    const result = new Map<string, LessonFacts>();
    for (const l of lessons) {
      const own = edges.filter((e) => e.lessonId === l.id && !e.requiredLesson.deletedAt);
      const release = releaseByLesson.get(l.id);
      result.set(l.id, {
        lesson: {
          isPublished: l.isPublished,
          deletedAt: l.deletedAt,
          sectionDeletedAt: l.section.deletedAt,
          releaseType: l.releaseType,
          releaseAt: l.releaseAt,
          releaseOffsetDays: l.releaseOffsetDays,
          availableUntil: l.availableUntil,
        },
        cohortRelease: release
          ? { releaseAt: release.releaseAt, availableUntil: release.availableUntil }
          : null,
        coursePrerequisiteUnmet: courseUnmet,
        incompletePrerequisiteLessons: own.filter((e) => !completed.has(e.requiredLessonId)).length,
      });
    }
    return result;
  }
}
