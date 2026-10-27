import { randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { staffGrantSchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { CohortCapacityService } from '../content/cohort-capacity.service';
import {
  LEARNING_CLOCK,
  conflict,
  invalid,
  notFound,
  lockEnrollmentKey,
  required,
  semantic,
  systemClock,
  type LearningClock,
  type Tx,
} from './learning.support';

type CourseRow = NonNullable<Awaited<ReturnType<EnrollmentGrantService['loadCourse']>>>;
type GrantRow = Prisma.EnrollmentGrantGetPayload<object>;

export type CourseStatusName = 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';

export interface EnsureEnrollmentInput {
  workspaceId: string;
  courseId: string;
  userId: string;
  cohortId?: string | null;
  enrolledAt?: Date;
  /** Course states that may receive this enrollment (free/manual refuse unpublished courses). */
  allowedCourseStatuses: readonly CourseStatusName[];
  /** Skip enrollment-window/publication checks (capacity is NEVER skipped). */
  overrideWindow?: boolean;
  /** A paid order/subscription reservation already counted in capacity for this enrollment. */
  excludeOrderId?: string;
  /** A fresh commerce purchase re-opens a staff-REVOKED enrollment (never a SUSPENDED one). */
  reactivateRevoked?: boolean;
}
export interface EnsuredEnrollment {
  enrollment: Prisma.EnrollmentGetPayload<object>;
  created: boolean;
  /** Requested cohort differs from the existing placement; the placement is kept (explicit transfer only). */
  cohortMismatch: boolean;
}

export interface GrantAudit {
  /** `null` marks a trusted automated command (fulfillment); never fabricate a human actor. */
  actorId: string | null;
  requestId?: string;
}

export interface CommerceGrantInput {
  workspaceId: string;
  userId: string;
  courseId: string;
  source: 'ORDER_ITEM' | 'SUBSCRIPTION';
  orderItemId?: string;
  subscriptionId?: string;
  /** Deterministic idempotency key, e.g. `order-item:<itemId>:course:<courseId>`. */
  sourceKey: string;
  startsAt: Date;
  expiresAt: Date | null;
  /** Optional: must equal the frozen entitlement cohort when provided. */
  cohortId?: string | null;
  requestId?: string;
}
export interface CommerceGrantResult {
  enrollmentId: string;
  grantId: string;
  /** False when the same sourceKey already existed (replay): nothing was changed. */
  created: boolean;
  enrollmentCreated: boolean;
  cohortMismatch: boolean;
}

export type GrantSelector =
  | { workspaceId: string; grantId: string }
  | { workspaceId: string; orderItemId: string; courseIds?: readonly string[] }
  | { workspaceId: string; subscriptionId: string; courseIds?: readonly string[] };

const sourceKeySchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._:\-/]+$/);
const snapshotCoursesSchema = z.array(
  z.object({ courseId: z.uuid(), cohortId: z.uuid().nullable().default(null) }).passthrough(),
);

/**
 * Grant lifecycle commands. The `grantFromCommerce`, `extendGrant`, `revokeGrants` commands are the TRUSTED
 * internal API called by fulfillment (order.paid.v1, refund.succeeded.v1, subscription.entitlements.changed.v1);
 * they are not reachable from any HTTP controller. All of them are idempotent: replaying the same input
 * produces no additional rows, events, expiry movement or un-revocation. Independent sources are never
 * touched by one another: revoking an ORDER_ITEM grant leaves MANUAL/FREE/SUBSCRIPTION grants intact.
 */
@Injectable()
export class EnrollmentGrantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacity: CohortCapacityService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Optional() @Inject(LEARNING_CLOCK) private readonly clock: LearningClock = systemClock,
  ) {}

  async loadCourse(tx: Tx, workspaceId: string, courseId: string) {
    return tx.course.findFirst({
      where: {
        id: courseId,
        workspaceId,
        deletedAt: null,
        workspace: { status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        deliveryMode: true,
        isFree: true,
        visibility: true,
      },
    });
  }

  /** Locks the learner/course key and returns the (possibly new) enrollment. */
  async ensureEnrollment(tx: Tx, input: EnsureEnrollmentInput): Promise<EnsuredEnrollment> {
    const now = this.clock.now();
    await lockEnrollmentKey(tx, input.workspaceId, input.courseId, input.userId);
    const course = required(await this.loadCourse(tx, input.workspaceId, input.courseId));
    if (!input.allowedCourseStatuses.includes(course.status))
      conflict('COURSE_NOT_ENROLLABLE', 'Course is not open for enrollment');
    const user = await tx.user.findFirst({
      where: { id: input.userId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (!user) notFound();
    const existing = await tx.enrollment.findUnique({
      where: { courseId_userId: { courseId: input.courseId, userId: input.userId } },
    });
    if (existing && existing.workspaceId !== input.workspaceId) notFound();
    if (!existing) {
      const cohortId = this.cohortFor(course, input.cohortId ?? null);
      if (cohortId) await this.reserveSeat(tx, input, cohortId, now);
      const enrollment = await tx.enrollment.create({
        data: {
          workspaceId: input.workspaceId,
          courseId: input.courseId,
          userId: input.userId,
          cohortId,
          enrolledAt: input.enrolledAt && input.enrolledAt <= now ? input.enrolledAt : now,
        },
      });
      return { enrollment, created: true, cohortMismatch: false };
    }
    let enrollment = existing;
    let cohortMismatch = false;
    if (input.cohortId && input.cohortId !== existing.cohortId) {
      if (existing.cohortId === null && course.deliveryMode === 'COHORT') {
        await this.reserveSeat(tx, input, input.cohortId, now);
        enrollment = await tx.enrollment.update({
          where: { id: existing.id },
          data: { cohortId: input.cohortId },
        });
      } else cohortMismatch = true;
    }
    if (input.reactivateRevoked && enrollment.status === 'REVOKED') {
      if (enrollment.cohortId)
        await this.reserveSeat(tx, { ...input, overrideWindow: true }, enrollment.cohortId, now);
      enrollment = await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'ACTIVE' },
      });
    }
    return { enrollment, created: false, cohortMismatch };
  }

  private cohortFor(course: CourseRow, cohortId: string | null): string | null {
    if (course.deliveryMode === 'SELF_PACED') {
      if (cohortId) semantic('COHORT_NOT_ALLOWED', 'Self-paced courses have no cohort');
      return null;
    }
    if (!cohortId) semantic('COHORT_REQUIRED', 'A cohort is required for this course');
    return cohortId;
  }

  /** Seat contention is resolved under the cohort row lock inside CohortCapacityService. */
  async reserveSeat(
    tx: Tx,
    input: Pick<
      EnsureEnrollmentInput,
      'workspaceId' | 'courseId' | 'overrideWindow' | 'excludeOrderId'
    >,
    cohortId: string,
    at: Date,
  ) {
    try {
      await this.capacity.assertAvailable(tx, {
        workspaceId: input.workspaceId,
        courseId: input.courseId,
        cohortId,
        at,
        seats: 1,
        overrideWindow: input.overrideWindow ?? false,
        ...(input.excludeOrderId ? { excludeOrderId: input.excludeOrderId } : {}),
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        const message = String(
          (error.getResponse() as { message?: unknown }).message ?? error.message,
        );
        if (/full/i.test(message)) conflict('COHORT_FULL', 'This cohort is full');
        if (/closed/i.test(message)) conflict('COHORT_CLOSED', 'Cohort enrollment is closed');
      }
      throw error;
    }
  }

  /** Create an independent grant. `sourceKey` uniqueness (per enrollment) makes the insert idempotent. */
  async createGrant(
    tx: Tx,
    input: {
      workspaceId: string;
      enrollmentId: string;
      source: 'FREE' | 'MANUAL' | 'ORDER_ITEM' | 'SUBSCRIPTION';
      sourceKey: string;
      startsAt: Date;
      expiresAt: Date | null;
      reason?: string | null;
      grantedById?: string | null;
      orderItemId?: string | null;
      subscriptionId?: string | null;
    },
    audit: GrantAudit,
  ): Promise<{ grant: GrantRow; created: boolean }> {
    sourceKeySchema.parse(input.sourceKey);
    if (input.expiresAt && input.expiresAt <= input.startsAt)
      invalid('Grant must expire after it starts');
    const existing = await tx.enrollmentGrant.findUnique({
      where: {
        enrollmentId_sourceKey: { enrollmentId: input.enrollmentId, sourceKey: input.sourceKey },
      },
    });
    if (existing) return { grant: existing, created: false };
    const grant = await tx.enrollmentGrant.create({
      data: {
        workspaceId: input.workspaceId,
        enrollmentId: input.enrollmentId,
        source: input.source,
        sourceKey: input.sourceKey,
        startsAt: input.startsAt,
        expiresAt: input.expiresAt,
        reason: input.reason ?? null,
        grantedById: input.grantedById ?? null,
        orderItemId: input.orderItemId ?? null,
        subscriptionId: input.subscriptionId ?? null,
      },
    });
    await this.outbox.append(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'Enrollment',
      aggregateId: input.enrollmentId,
      type: 'enrollment.granted.v1',
      payload: { enrollmentId: input.enrollmentId, grantId: grant.id },
    });
    await this.audit.append(tx, {
      action: `enrollment.grant.${input.source.toLowerCase().replace('_', '-')}`,
      resourceType: 'EnrollmentGrant',
      resourceId: grant.id,
      actorId: audit.actorId,
      workspaceId: input.workspaceId,
      requestId: audit.requestId ?? randomUUID(),
      changes: {
        enrollmentId: input.enrollmentId,
        source: input.source,
        startsAt: input.startsAt.toISOString(),
        expiresAt: input.expiresAt?.toISOString() ?? null,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    return { grant, created: true };
  }

  // ---- trusted commerce commands ------------------------------------------------------------------

  /**
   * Idempotently create (or reuse) the learner's enrollment and the commerce-sourced grant. Validates the
   * order item/subscription belongs to this learner and workspace and actually entitles this course, so a
   * buggy or malicious caller cannot fabricate provenance. Replays return `created:false` without writing.
   */
  async grantFromCommerce(input: CommerceGrantInput, tx?: Tx): Promise<CommerceGrantResult> {
    const run = async (t: Tx): Promise<CommerceGrantResult> => {
      sourceKeySchema.parse(input.sourceKey);
      const sourceCohort = await this.verifyCommerceSource(t, input);
      if (input.cohortId && sourceCohort !== undefined && input.cohortId !== sourceCohort)
        conflict('COHORT_MISMATCH', 'Cohort does not match the purchased entitlement');
      const cohortId = sourceCohort ?? input.cohortId ?? null;
      const excludeOrderId = await this.reservationOrderId(t, input);
      const ensured = await this.ensureEnrollment(t, {
        workspaceId: input.workspaceId,
        courseId: input.courseId,
        userId: input.userId,
        cohortId,
        enrolledAt: input.startsAt,
        // Paid access already holds a cohort reservation; the window may have closed since checkout.
        overrideWindow: true,
        ...(excludeOrderId ? { excludeOrderId } : {}),
        allowedCourseStatuses: ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'],
        reactivateRevoked: true,
      });
      const { grant, created } = await this.createGrant(
        t,
        {
          workspaceId: input.workspaceId,
          enrollmentId: ensured.enrollment.id,
          source: input.source,
          sourceKey: input.sourceKey,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          orderItemId: input.source === 'ORDER_ITEM' ? input.orderItemId! : null,
          subscriptionId: input.source === 'SUBSCRIPTION' ? input.subscriptionId! : null,
        },
        { actorId: null, ...(input.requestId ? { requestId: input.requestId } : {}) },
      );
      return {
        enrollmentId: ensured.enrollment.id,
        grantId: grant.id,
        created,
        enrollmentCreated: ensured.created,
        cohortMismatch: ensured.cohortMismatch,
      };
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 20000 });
  }

  /**
   * Several courses (bundles) in one transaction. Deadlock-free lock order for every concurrent caller:
   * learner/course keys by courseId, then cohort rows by cohortId, then the per-course writes.
   */
  async grantManyFromCommerce(
    inputs: readonly CommerceGrantInput[],
    tx?: Tx,
  ): Promise<CommerceGrantResult[]> {
    const run = async (t: Tx) => {
      const byCourse = [...inputs].sort((a, b) => a.courseId.localeCompare(b.courseId));
      for (const i of byCourse) await lockEnrollmentKey(t, i.workspaceId, i.courseId, i.userId);
      const cohorts = new Map<string, CommerceGrantInput>();
      for (const i of inputs) if (i.cohortId) cohorts.set(i.cohortId, i);
      for (const [cohortId, i] of [...cohorts].sort(([a], [b]) => a.localeCompare(b)))
        await this.capacity.lock(t, { workspaceId: i.workspaceId, courseId: i.courseId }, cohortId);
      const out: CommerceGrantResult[] = [];
      for (const input of inputs) out.push(await this.grantFromCommerce(input, t));
      return out;
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 30000 });
  }

  private async verifyCommerceSource(
    tx: Tx,
    input: CommerceGrantInput,
  ): Promise<string | null | undefined> {
    if (input.source === 'ORDER_ITEM') {
      if (!input.orderItemId || input.subscriptionId)
        invalid('ORDER_ITEM grant requires orderItemId only');
      const item = await tx.orderItem.findFirst({
        where: { id: input.orderItemId, workspaceId: input.workspaceId },
        include: { order: true, orderItemCourses: { where: { courseId: input.courseId } } },
      });
      if (!item || item.order.userId !== input.userId) return notFound();
      if (
        !item.order.paidAt ||
        !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(item.order.status)
      )
        conflict('ORDER_NOT_FULFILLABLE', 'Order is not paid');
      // Refunded orders stay fulfillable only for items whose refunds preserved access; a late
      // order.paid event must never restore access that a succeeded refund revoked.
      const revokingRefund = await tx.refundItem.findFirst({
        where: {
          workspaceId: input.workspaceId,
          orderItemId: item.id,
          revokeAccess: true,
          refund: { status: 'SUCCEEDED' },
        },
        select: { id: true },
      });
      if (revokingRefund) conflict('ORDER_NOT_FULFILLABLE', 'Order item access was refunded');
      const line = item.orderItemCourses[0];
      if (!line) conflict('COURSE_NOT_ENTITLED', 'Order item does not entitle this course');
      return line.cohortId;
    }
    if (!input.subscriptionId || input.orderItemId)
      invalid('SUBSCRIPTION grant requires subscriptionId only');
    if (!input.expiresAt) invalid('Subscription grants require a finite expiry');
    const sub = await tx.subscription.findFirst({
      where: { id: input.subscriptionId, workspaceId: input.workspaceId, userId: input.userId },
    });
    if (!sub) return notFound();
    const snapshot = sub.entitlementSnapshot as { courses?: unknown } | null;
    const courses = snapshotCoursesSchema.safeParse(snapshot?.courses ?? []);
    const line = courses.success
      ? courses.data.find((c) => c.courseId === input.courseId)
      : undefined;
    if (!line) conflict('COURSE_NOT_ENTITLED', 'Subscription does not entitle this course');
    return line.cohortId;
  }

  private async reservationOrderId(tx: Tx, input: CommerceGrantInput): Promise<string | undefined> {
    if (input.source === 'ORDER_ITEM') {
      const item = await tx.orderItem.findFirst({
        where: { id: input.orderItemId!, workspaceId: input.workspaceId },
        select: { orderId: true },
      });
      return item?.orderId;
    }
    const sub = await tx.subscription.findFirst({
      where: { id: input.subscriptionId!, workspaceId: input.workspaceId },
      select: { initialOrderId: true },
    });
    return sub?.initialOrderId ?? undefined;
  }

  private async select(tx: Tx, selector: GrantSelector): Promise<GrantRow[]> {
    if ('grantId' in selector)
      return tx.enrollmentGrant.findMany({
        where: { id: selector.grantId, workspaceId: selector.workspaceId },
      });
    const courseFilter = selector.courseIds
      ? { enrollment: { courseId: { in: [...selector.courseIds] } } }
      : {};
    return tx.enrollmentGrant.findMany({
      where: {
        workspaceId: selector.workspaceId,
        ...('orderItemId' in selector
          ? { source: 'ORDER_ITEM' as const, orderItemId: selector.orderItemId }
          : { source: 'SUBSCRIPTION' as const, subscriptionId: selector.subscriptionId }),
        ...courseFilter,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Monotonic expiry extension for renewals. Never shortens, never touches a revoked grant, never makes a
   * finite grant unlimited. Returns the grants whose expiry actually changed.
   */
  async extendGrant(
    selector: GrantSelector,
    expiresAt: Date,
    audit: GrantAudit = { actorId: null },
    tx?: Tx,
  ): Promise<{ changed: string[]; unchanged: string[] }> {
    const run = async (t: Tx) => {
      const changed: string[] = [];
      const unchanged: string[] = [];
      for (const g of await this.select(t, selector)) {
        // Compare-and-set on the observed expiry so concurrent renewals cannot move expiry backwards.
        const eligible =
          g.revokedAt === null &&
          g.expiresAt !== null &&
          expiresAt.getTime() > g.expiresAt.getTime();
        const updated = eligible
          ? await t.enrollmentGrant.updateMany({
              where: { id: g.id, revokedAt: null, expiresAt: { lt: expiresAt } },
              data: { expiresAt },
            })
          : { count: 0 };
        if (updated.count === 1) {
          changed.push(g.id);
          await this.audit.append(t, {
            action: 'enrollment.grant.extended',
            resourceType: 'EnrollmentGrant',
            resourceId: g.id,
            actorId: audit.actorId,
            workspaceId: g.workspaceId,
            requestId: audit.requestId ?? randomUUID(),
            changes: { from: g.expiresAt?.toISOString() ?? null, to: expiresAt.toISOString() },
          });
        } else unchanged.push(g.id);
      }
      return { changed, unchanged };
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 15000 });
  }

  /**
   * Idempotently revoke the selected source grant(s) (refund, cancellation, termination). `at` may be in the
   * future (revoke at period end); the grant stays valid until then. A grant that is already revoked is left
   * exactly as it was. Other sources on the same enrollment keep authorizing access.
   */
  async revokeGrants(
    selector: GrantSelector,
    reason: string,
    audit: GrantAudit = { actorId: null },
    at?: Date,
    tx?: Tx,
  ): Promise<{ revoked: string[]; unchanged: string[] }> {
    const run = async (t: Tx) => {
      const when = at ?? this.clock.now();
      const revoked: string[] = [];
      const unchanged: string[] = [];
      for (const g of await this.select(t, selector)) {
        const res = await t.enrollmentGrant.updateMany({
          where: { id: g.id, revokedAt: null },
          data: { revokedAt: when },
        });
        if (res.count === 1) {
          revoked.push(g.id);
          await this.audit.append(t, {
            action: 'enrollment.grant.revoked',
            resourceType: 'EnrollmentGrant',
            resourceId: g.id,
            actorId: audit.actorId,
            workspaceId: g.workspaceId,
            requestId: audit.requestId ?? randomUUID(),
            changes: {
              source: g.source,
              enrollmentId: g.enrollmentId,
              reason,
              revokedAt: when.toISOString(),
            },
          });
        } else unchanged.push(g.id);
      }
      return { revoked, unchanged };
    };
    return tx ? run(tx) : this.prisma.$transaction(run, { timeout: 15000 });
  }
}

export function staffGrantDto(g: GrantRow) {
  return staffGrantSchema.parse({
    id: g.id,
    source: g.source,
    startsAt: g.startsAt.toISOString(),
    expiresAt: g.expiresAt?.toISOString() ?? null,
    revokedAt: g.revokedAt?.toISOString() ?? null,
    workspaceId: g.workspaceId,
    enrollmentId: g.enrollmentId,
    reason: g.reason,
    grantedById: g.grantedById,
    orderItemId: g.orderItemId,
    subscriptionId: g.subscriptionId,
  });
}
