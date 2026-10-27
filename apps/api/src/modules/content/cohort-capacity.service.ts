import { ConflictException, Injectable, BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { required, type Scope } from './content.support';

/** Internal transaction API. All seat writers lock cohort IDs in sorted order and persist before commit. */
@Injectable()
export class CohortCapacityService {
  async lock(tx: Prisma.TransactionClient, scope: Scope, cohortId: string) {
    await tx.$queryRaw`SELECT "id" FROM "Cohort" WHERE "workspaceId"=${scope.workspaceId}::uuid AND "courseId"=${scope.courseId}::uuid AND "id"=${cohortId}::uuid FOR UPDATE`;
    return required(
      await tx.cohort.findFirst({
        where: {
          workspaceId: scope.workspaceId,
          courseId: scope.courseId,
          id: cohortId,
          deletedAt: null,
          workspace: { status: 'ACTIVE', deletedAt: null },
          course: { deletedAt: null },
        },
      }),
    );
  }
  async occupied(
    tx: Prisma.TransactionClient,
    scope: Scope,
    cohortId: string,
    at: Date,
    excludeOrderId?: string,
  ) {
    const count = await tx.$queryRaw<{ occupied: bigint }[]>`
      SELECT count(*)::bigint AS occupied FROM (
        SELECT e."id"::text FROM "Enrollment" e
        WHERE e."workspaceId"=${scope.workspaceId}::uuid AND e."courseId"=${scope.courseId}::uuid
          AND e."cohortId"=${cohortId}::uuid AND e."status" IN ('ACTIVE','SUSPENDED')
        UNION ALL
        SELECT oic."id"::text FROM "OrderItemCourse" oic
        JOIN "OrderItem" oi ON oi."id"=oic."orderItemId" AND oi."workspaceId"=oic."workspaceId"
        JOIN "Order" o ON o."id"=oi."orderId" AND o."workspaceId"=oi."workspaceId"
        WHERE oic."workspaceId"=${scope.workspaceId}::uuid AND oic."courseId"=${scope.courseId}::uuid
          AND oic."cohortId"=${cohortId}::uuid
          AND (${excludeOrderId ?? null}::uuid IS NULL OR o."id"<>${excludeOrderId ?? null}::uuid)
          AND ((o."status"='PENDING' AND o."expiresAt">${at}) OR (
            o."status" IN ('PAID','PARTIALLY_REFUNDED') AND NOT EXISTS (
              SELECT 1 FROM "Enrollment" e WHERE e."workspaceId"=o."workspaceId"
                AND e."courseId"=oic."courseId" AND e."userId"=o."userId")))
      ) seats`;
    return Number(count[0]?.occupied ?? 0n);
  }
  async assertAvailable(
    tx: Prisma.TransactionClient,
    input: Scope & {
      cohortId: string;
      at?: Date;
      seats?: number;
      excludeOrderId?: string;
      overrideWindow?: boolean;
    },
  ) {
    const at = input.at ?? new Date();
    const seats = input.seats ?? 1;
    if (!Number.isInteger(seats) || seats < 1)
      throw new BadRequestException('Invalid seat quantity');
    const c = await this.lock(tx, input, input.cohortId);
    if (
      !input.overrideWindow &&
      (!c.isPublished ||
        (c.enrollmentOpensAt && at < c.enrollmentOpensAt) ||
        (c.enrollmentClosesAt && at >= c.enrollmentClosesAt) ||
        (c.endsAt && at >= c.endsAt))
    )
      throw new ConflictException('Cohort enrollment is closed');
    const used = await this.occupied(tx, input, input.cohortId, at, input.excludeOrderId);
    if (c.capacity !== null && used + seats > c.capacity)
      throw new ConflictException('Cohort is full');
    return c;
  }
  /** Execute reservation/enrollment insertion under the retained row lock in the caller's transaction. */
  async reserve<T>(
    tx: Prisma.TransactionClient,
    input: Parameters<CohortCapacityService['assertAvailable']>[1],
    persist: (cohort: Awaited<ReturnType<CohortCapacityService['lock']>>) => Promise<T>,
  ) {
    return persist(await this.assertAvailable(tx, input));
  }
}
