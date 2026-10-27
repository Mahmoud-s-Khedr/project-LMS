import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  rosterQuerySchema,
  type EnrollmentUpdate,
  type FreeEnrollment,
  type ManualEnrollment,
  type ManualGrant,
  type RosterQuery,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService, type AuthenticatedUser } from '../../common/authz';
import { AuditService } from '../audit/audit.service';
import { ContentPagination } from '../content/content.support';
import { enrollmentDto, type EnrollmentWithAccess } from './enrollment-dto';
import { EnrollmentGrantService, staffGrantDto } from './enrollment-grant.service';
import { enrollmentAccessInclude } from './learner-access-policy';
import {
  LEARNING_CLOCK,
  conflict,
  etagOf,
  lockEnrollmentKey,
  notFound,
  required,
  runIdempotent,
  semantic,
  systemClock,
  type LearningClock,
  type Tx,
} from './learning.support';

type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
type Scope = { workspaceId: string; courseId: string };

/** Free self-enrollment (learner) and roster management (staff with the manageLearners capability). */
@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly grants: EnrollmentGrantService,
    private readonly audit: AuditService,
    private readonly pagination: ContentPagination,
    @Optional() @Inject(LEARNING_CLOCK) private readonly clock: LearningClock = systemClock,
  ) {}

  // ---- learner: free self-enrollment ---------------------------------------------------------------

  /**
   * `POST /courses/:courseId/enroll` — only isFree, PUBLISHED, non-PRIVATE courses. Idempotent per
   * Idempotency-Key, and naturally idempotent per learner/course through the FREE sourceKey.
   */
  async enrollFree(
    actor: Actor,
    courseId: string,
    input: FreeEnrollment,
    key: string | undefined,
    requestId?: string,
  ) {
    const course = required(
      await this.prisma.course.findFirst({
        where: {
          id: courseId,
          deletedAt: null,
          status: 'PUBLISHED',
          isFree: true,
          visibility: { in: ['PUBLIC', 'UNLISTED'] },
          workspace: { status: 'ACTIVE', deletedAt: null },
        },
        select: { id: true, workspaceId: true },
      }),
    );
    return runIdempotent(
      this.prisma,
      {
        workspaceId: course.workspaceId,
        userId: actor.id,
        route: `POST /courses/${courseId}/enroll`,
        key,
        body: input,
        status: 201,
      },
      async (tx) => {
        const now = this.clock.now();
        const ensured = await this.grants.ensureEnrollment(tx, {
          workspaceId: course.workspaceId,
          courseId,
          userId: actor.id,
          cohortId: input.cohortId ?? null,
          allowedCourseStatuses: ['PUBLISHED'],
        });
        const free = await tx.enrollmentGrant.findUnique({
          where: {
            enrollmentId_sourceKey: { enrollmentId: ensured.enrollment.id, sourceKey: 'free' },
          },
        });
        // A staff revocation is deliberate; self-service must not silently undo it.
        if (ensured.enrollment.status === 'SUSPENDED')
          conflict('ENROLLMENT_SUSPENDED', 'Your enrollment in this course is suspended');
        if (free?.revokedAt || ensured.enrollment.status === 'REVOKED')
          conflict('ENROLLMENT_REVOKED', 'Your enrollment in this course was ended by staff');
        if (ensured.cohortMismatch)
          conflict('COHORT_MISMATCH', 'You are already enrolled in another cohort');
        await this.grants.createGrant(
          tx,
          {
            workspaceId: course.workspaceId,
            enrollmentId: ensured.enrollment.id,
            source: 'FREE',
            sourceKey: 'free',
            startsAt: now,
            expiresAt: null,
          },
          { actorId: actor.id, ...(requestId ? { requestId } : {}) },
        );
        return { data: enrollmentDto(await this.reload(tx, ensured.enrollment.id), now) };
      },
    );
  }

  // ---- staff ---------------------------------------------------------------------------------------

  /** Roster capability or 404 (unauthorized staff cannot distinguish a missing course). */
  private async authorize(actor: Actor, scope: Scope) {
    const course = required(
      await this.prisma.course.findFirst({
        where: { id: scope.courseId, workspaceId: scope.workspaceId, deletedAt: null },
        select: { id: true, workspaceId: true, deletedAt: true, status: true, deliveryMode: true },
      }),
    );
    if (!(await this.policy.canManageCourse(actor, course, 'manageLearners'))) notFound();
    const admin = await this.policy.hasWorkspaceRole(actor, scope.workspaceId, ['ADMIN']);
    return { course, admin };
  }

  private async reload(tx: Tx | PrismaService, id: string): Promise<EnrollmentWithAccess> {
    return tx.enrollment.findUniqueOrThrow({ where: { id }, include: enrollmentAccessInclude });
  }
  private async inCourse(tx: Tx | PrismaService, scope: Scope, enrollmentId: string) {
    return required(
      await tx.enrollment.findFirst({
        where: { id: enrollmentId, workspaceId: scope.workspaceId, courseId: scope.courseId },
        include: enrollmentAccessInclude,
      }),
    );
  }

  async roster(actor: Actor, scope: Scope, query: RosterQuery) {
    await this.authorize(actor, scope);
    const q = rosterQuerySchema.parse(query);
    const { cursor: _cursor, limit: _limit, ...filters } = q;
    const key = { ...scope, roster: true, ...filters };
    const c = this.pagination.decode(q, key);
    const rows = await this.prisma.enrollment.findMany({
      where: {
        ...scope,
        ...(q.status ? { status: q.status } : {}),
        ...(q.cohortId ? { cohortId: q.cohortId } : {}),
        ...(q.userId ? { userId: q.userId } : {}),
        ...(q.source ? { enrollmentGrants: { some: { source: q.source } } } : {}),
        ...(q.from || q.to
          ? {
              enrolledAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lt: new Date(q.to) } : {}),
              },
            }
          : {}),
        ...(c
          ? {
              AND: [
                {
                  OR: [
                    { createdAt: { lt: new Date(c.value) } },
                    { createdAt: new Date(c.value), id: { lt: c.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      include: enrollmentAccessInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const at = this.clock.now();
    const page = this.pagination.page(rows, q, key, (r) => r.createdAt.toISOString());
    return { ...page, data: page.data.map((r) => enrollmentDto(r, at)) };
  }

  async detail(actor: Actor, scope: Scope, enrollmentId: string) {
    await this.authorize(actor, scope);
    const row = await this.inCourse(this.prisma, scope, enrollmentId);
    const grants = await this.prisma.enrollmentGrant.findMany({
      where: { workspaceId: scope.workspaceId, enrollmentId },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return {
      ...enrollmentDto(row, this.clock.now()),
      grantProvenance: grants.map(staffGrantDto),
    };
  }

  /** Create/reuse the learner's enrollment and add an independent MANUAL grant (never a commerce source). */
  async manual(
    actor: Actor,
    scope: Scope,
    input: ManualEnrollment,
    key: string | undefined,
    requestId?: string,
  ) {
    const { admin } = await this.authorize(actor, scope);
    return runIdempotent(
      this.prisma,
      {
        workspaceId: scope.workspaceId,
        userId: actor.id,
        route: `POST /workspaces/${scope.workspaceId}/courses/${scope.courseId}/enrollments/manual`,
        key,
        body: input,
        status: 201,
      },
      async (tx) => {
        const now = this.clock.now();
        this.assertGrantWindow(input, now);
        const ensured = await this.grants.ensureEnrollment(tx, {
          ...scope,
          userId: input.userId,
          cohortId: input.cohortId ?? null,
          // Only a workspace admin may enroll past a closed window; capacity is never overridden.
          overrideWindow: admin,
          allowedCourseStatuses: ['PUBLISHED', 'ARCHIVED'],
        });
        if (ensured.cohortMismatch)
          conflict('COHORT_MISMATCH', 'Learner is in another cohort; move the enrollment instead');
        await this.grants.createGrant(
          tx,
          {
            workspaceId: scope.workspaceId,
            enrollmentId: ensured.enrollment.id,
            source: 'MANUAL',
            sourceKey: `manual:${randomUUID()}`,
            startsAt: new Date(input.startsAt),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            reason: input.reason,
            grantedById: actor.id,
          },
          { actorId: actor.id, ...(requestId ? { requestId } : {}) },
        );
        return { data: enrollmentDto(await this.reload(tx, ensured.enrollment.id), now) };
      },
    );
  }

  async addGrant(
    actor: Actor,
    scope: Scope,
    enrollmentId: string,
    input: ManualGrant,
    key: string | undefined,
    requestId?: string,
  ) {
    await this.authorize(actor, scope);
    return runIdempotent(
      this.prisma,
      {
        workspaceId: scope.workspaceId,
        userId: actor.id,
        route: `POST /workspaces/${scope.workspaceId}/courses/${scope.courseId}/enrollments/${enrollmentId}/grants`,
        key,
        body: input,
        status: 201,
      },
      async (tx) => {
        const enrollment = await this.inCourse(tx, scope, enrollmentId);
        await lockEnrollmentKey(tx, scope.workspaceId, scope.courseId, enrollment.userId);
        this.assertGrantWindow(input, this.clock.now());
        const { grant } = await this.grants.createGrant(
          tx,
          {
            workspaceId: scope.workspaceId,
            enrollmentId,
            source: 'MANUAL',
            sourceKey: `manual:${randomUUID()}`,
            startsAt: new Date(input.startsAt),
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            reason: input.reason,
            grantedById: actor.id,
          },
          { actorId: actor.id, ...(requestId ? { requestId } : {}) },
        );
        return { data: staffGrantDto(grant) };
      },
    );
  }

  /** Commerce-sourced grants need a workspace admin; MANUAL/FREE can be revoked by roster staff. */
  async revokeGrant(
    actor: Actor,
    scope: Scope,
    enrollmentId: string,
    grantId: string,
    reason: string,
    requestId?: string,
  ) {
    const { admin } = await this.authorize(actor, scope);
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await this.inCourse(tx, scope, enrollmentId);
      await lockEnrollmentKey(tx, scope.workspaceId, scope.courseId, enrollment.userId);
      const grant = required(
        await tx.enrollmentGrant.findFirst({
          where: { id: grantId, workspaceId: scope.workspaceId, enrollmentId },
        }),
      );
      if ((grant.source === 'ORDER_ITEM' || grant.source === 'SUBSCRIPTION') && !admin) notFound();
      await this.grants.revokeGrants(
        { workspaceId: scope.workspaceId, grantId },
        reason,
        { actorId: actor.id, ...(requestId ? { requestId } : {}) },
        this.clock.now(),
        tx,
      );
      return {
        data: staffGrantDto(await tx.enrollmentGrant.findUniqueOrThrow({ where: { id: grantId } })),
      };
    });
  }

  /** Suspend/reactivate/revoke or move cohort. Requires If-Match; progress is preserved. */
  async update(
    actor: Actor,
    scope: Scope,
    enrollmentId: string,
    input: EnrollmentUpdate,
    ifMatch: string,
    requestId?: string,
  ) {
    const { admin, course } = await this.authorize(actor, scope);
    return this.prisma.$transaction(
      async (tx) => {
        const head = await this.inCourse(tx, scope, enrollmentId);
        // Same lock order as every other writer: learner key, then cohort rows, then the enrollment row.
        await lockEnrollmentKey(tx, scope.workspaceId, scope.courseId, head.userId);
        const current = await this.inCourse(tx, scope, enrollmentId);
        if (etagOf(current.updatedAt) !== ifMatch)
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Enrollment changed; reload before editing',
          });
        const now = this.clock.now();
        const nextStatus = input.status ?? current.status;
        let nextCohort = current.cohortId;
        if (input.cohortId !== undefined) {
          if (course.deliveryMode !== 'COHORT')
            semantic('COHORT_NOT_ALLOWED', 'Self-paced courses have no cohort');
          if (input.cohortId === null)
            semantic('COHORT_REQUIRED', 'Cohort courses require a cohort');
          nextCohort = input.cohortId;
        }
        const movesCohort = nextCohort !== current.cohortId;
        const reopens = current.status === 'REVOKED' && nextStatus !== 'REVOKED';
        if ((movesCohort || reopens) && nextCohort && nextStatus !== 'REVOKED')
          await this.grants.reserveSeat(
            tx,
            {
              ...scope,
              // Moves honor the enrollment window unless an admin overrides; reopening never re-checks it.
              overrideWindow: admin || (reopens && !movesCohort),
            },
            nextCohort,
            now,
          );
        await tx.enrollment.update({
          where: { id: enrollmentId },
          data: { status: nextStatus, cohortId: nextCohort },
        });
        await this.audit.append(tx, {
          action: movesCohort
            ? 'enrollment.cohort.moved'
            : `enrollment.status.${nextStatus.toLowerCase()}`,
          resourceType: 'Enrollment',
          resourceId: enrollmentId,
          actorId: actor.id,
          workspaceId: scope.workspaceId,
          requestId: requestId ?? randomUUID(),
          changes: {
            reason: input.reason,
            from: { status: current.status, cohortId: current.cohortId },
            to: { status: nextStatus, cohortId: nextCohort },
          },
        });
        return enrollmentDto(await this.reload(tx, enrollmentId), now);
      },
      { timeout: 20000 },
    );
  }

  private assertGrantWindow(input: { startsAt: string; expiresAt: string | null }, now: Date) {
    if (input.expiresAt && new Date(input.expiresAt) <= now)
      semantic('GRANT_ALREADY_EXPIRED', 'A manual grant must expire in the future');
  }
}
