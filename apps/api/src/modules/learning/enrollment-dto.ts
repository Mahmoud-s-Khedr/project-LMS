import type { Prisma } from '@prisma/client';
import { enrollmentSchema, type Enrollment } from '@lms/shared';
import { evaluateEnrollmentAccess } from './availability';
import { toAccessEnrollment, type enrollmentAccessInclude } from './learner-access-policy';

export type EnrollmentWithAccess = Prisma.EnrollmentGetPayload<{
  include: typeof enrollmentAccessInclude;
}>;

/** Contract-validated enrollment projection; `access` is derived from grants at `at`, never cached. */
export function enrollmentDto(row: EnrollmentWithAccess, at: Date): Enrollment {
  return enrollmentSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    courseId: row.courseId,
    userId: row.userId,
    cohortId: row.cohortId,
    status: row.status,
    enrolledAt: row.enrolledAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
    completionPercent: row.completionPercent.toString(),
    access: evaluateEnrollmentAccess(toAccessEnrollment(row), at),
    grants: [...row.enrollmentGrants]
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
      .map((g) => ({
        id: g.id,
        source: g.source,
        startsAt: g.startsAt.toISOString(),
        expiresAt: g.expiresAt?.toISOString() ?? null,
        revokedAt: g.revokedAt?.toISOString() ?? null,
      })),
  });
}
