import type { EffectiveAccess } from '@lms/shared';
import { isWithinReleaseWindow, releaseWindow } from '../content/content.support';

type Denied = Extract<EffectiveAccess, { allowed: false }>;
export const deny = (reason: Denied['reason'], unlockAt: Date | null = null): Denied => ({
  allowed: false,
  reason,
  unlockAt: unlockAt ? unlockAt.toISOString() : null,
});

export interface AccessGrant {
  startsAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}
export interface AccessEnrollment {
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  enrolledAt: Date;
  user: { status: string; deletedAt: Date | null };
  workspace: { status: string; deletedAt: Date | null };
  course: { deletedAt: Date | null };
  cohort: { startsAt: Date; endsAt: Date | null } | null;
  grants: readonly AccessGrant[];
}
/** A grant authorizes at `at` when started, not expired (exclusive end), and not already revoked. */
export function grantIsValid(g: AccessGrant, at: Date): boolean {
  return (
    g.startsAt.getTime() <= at.getTime() &&
    (g.expiresAt === null || g.expiresAt.getTime() > at.getTime()) &&
    (g.revokedAt === null || g.revokedAt.getTime() > at.getTime())
  );
}

/**
 * Enrollment-level access (ARCHITECTURE "Enrollment, schedules and access"): user, workspace and course
 * state, enrollment status, then the provenance grants. Natural expiry is derived from timestamps, never a
 * cached status. The returned expiry is the earliest outer bound among grant expiry and cohort end.
 */
export function evaluateEnrollmentAccess(e: AccessEnrollment, at: Date): EffectiveAccess {
  if (e.user.status !== 'ACTIVE' || e.user.deletedAt) return deny('USER_SUSPENDED');
  if (e.workspace.status !== 'ACTIVE' || e.workspace.deletedAt) return deny('WORKSPACE_SUSPENDED');
  if (e.course.deletedAt) return deny('ENROLLMENT_REQUIRED');
  if (e.status === 'SUSPENDED') return deny('ENROLLMENT_SUSPENDED');
  if (e.status === 'REVOKED') return deny('ENROLLMENT_REQUIRED');
  const valid = e.grants.filter((g) => grantIsValid(g, at));
  if (valid.length === 0) {
    const upcoming = e.grants
      .filter((g) => g.revokedAt === null && g.startsAt.getTime() > at.getTime())
      .map((g) => g.startsAt.getTime());
    if (upcoming.length) return deny('NOT_RELEASED', new Date(Math.min(...upcoming)));
    const naturallyExpired = e.grants.some(
      (g) => g.expiresAt !== null && g.expiresAt.getTime() <= at.getTime(),
    );
    return deny(naturallyExpired ? 'ACCESS_EXPIRED' : 'ENROLLMENT_REQUIRED');
  }
  const cohortEnd = e.cohort?.endsAt ?? null;
  if (cohortEnd && cohortEnd.getTime() <= at.getTime()) return deny('ACCESS_EXPIRED');
  const unlimited = valid.some((g) => g.expiresAt === null);
  const grantExpiry = unlimited
    ? null
    : new Date(Math.max(...valid.map((g) => g.expiresAt!.getTime())));
  const bounds = [grantExpiry, cohortEnd].filter((d): d is Date => d !== null);
  const expiresAt = bounds.length ? new Date(Math.min(...bounds.map((d) => d.getTime()))) : null;
  return { allowed: true, expiresAt: expiresAt ? expiresAt.toISOString() : null };
}

export interface AccessLesson {
  isPublished: boolean;
  deletedAt: Date | null;
  sectionDeletedAt: Date | null;
  releaseType: string;
  releaseAt: Date | null;
  releaseOffsetDays: number | null;
  availableUntil: Date | null;
}
export interface LessonFacts {
  lesson: AccessLesson;
  /** Per-cohort release override (CohortLessonRelease). */
  cohortRelease: { releaseAt: Date; availableUntil: Date | null } | null;
  /** True when a course prerequisite is not satisfied (minimumPercent / completion). */
  coursePrerequisiteUnmet: boolean;
  /** Required lesson IDs that are not complete for this enrollment. */
  incompletePrerequisiteLessons: number;
}

/**
 * Lesson-level access = course access ∩ lesson publication ∩ release window ∩ prerequisites. Drip day offsets
 * use content's UTC release evaluator so authoring validation and delivery cannot disagree.
 */
export function evaluateLessonAccess(
  e: AccessEnrollment,
  facts: LessonFacts,
  at: Date,
): EffectiveAccess {
  const base = evaluateEnrollmentAccess(e, at);
  if (!base.allowed) return base;
  const { lesson } = facts;
  if (!lesson.isPublished || lesson.deletedAt || lesson.sectionDeletedAt)
    return deny('CONTENT_LOCKED');
  if (facts.coursePrerequisiteUnmet) return deny('PREREQUISITE_UNMET');
  const window = releaseWindow(
    lesson,
    e.enrolledAt,
    e.cohort?.startsAt ?? null,
    facts.cohortRelease ?? undefined,
  );
  if (!window.satisfiable) return deny('CONTENT_LOCKED');
  if (window.opensAt && at.getTime() < window.opensAt.getTime())
    return deny('NOT_RELEASED', window.opensAt);
  if (!isWithinReleaseWindow(window, at)) return deny('AVAILABLE_UNTIL_PASSED');
  if (facts.incompletePrerequisiteLessons > 0) return deny('PREREQUISITE_UNMET');
  const bounds = [
    base.expiresAt ? Date.parse(base.expiresAt) : null,
    window.closesAt ? window.closesAt.getTime() : null,
  ].filter((v): v is number => v !== null);
  return {
    allowed: true,
    expiresAt: bounds.length ? new Date(Math.min(...bounds)).toISOString() : null,
  };
}
