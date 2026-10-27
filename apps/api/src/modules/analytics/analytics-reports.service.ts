import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as c from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { dateFilter, filterHash, range, safeMoney, type Scope } from './analytics.support';

type Db = Prisma.TransactionClient;
type CourseQuery = c.AnalyticsQuery;
@Injectable()
export class AnalyticsReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async cohort(scope: Scope, cohortId?: string) {
    if (
      cohortId &&
      !(await this.prisma.cohort.findFirst({
        where: { id: cohortId, ...scope, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Cohort does not belong to this course');
  }

  /** Single SQL snapshot; events supply engagement only. Facts supply enrollments and submissions. */
  async daily(scope: Scope, query: CourseQuery, db: Db = this.prisma) {
    const { start, end } = range(query);
    const cohort = query.cohortId
      ? Prisma.sql`AND e."cohortId"=${query.cohortId}::uuid`
      : Prisma.empty;
    const rows = await db.$queryRaw<
      Array<{
        day: Date;
        newEnrollments: number;
        activeLearners: number;
        completions: number;
        learningSeconds: bigint;
        assessmentSubmissions: number;
      }>
    >(Prisma.sql`
      WITH days AS (SELECT generate_series((${start}::timestamptz AT TIME ZONE 'UTC')::date::timestamp, ((${end}::timestamptz - interval '1 millisecond') AT TIME ZONE 'UTC')::date::timestamp, '1 day')::date AS "day"),
      enrollments AS (SELECT e.* FROM "Enrollment" e WHERE e."workspaceId"=${scope.workspaceId}::uuid AND e."courseId"=${scope.courseId}::uuid ${cohort}),
      activity AS (SELECT (a."occurredAt" AT TIME ZONE 'UTC')::date AS "day", count(DISTINCT a."userId")::int active,
        coalesce(sum(CASE WHEN a.type='lesson.playback' THEN (a.properties->>'elapsedSeconds')::int ELSE 0 END),0)::bigint seconds
        FROM "ActivityEvent" a JOIN enrollments e ON e.id=a."enrollmentId" AND e."userId"=a."userId"
        WHERE a."workspaceId"=${scope.workspaceId}::uuid AND a."courseId"=${scope.courseId}::uuid AND a."occurredAt">=${start} AND a."occurredAt"<${end} GROUP BY 1),
      submissions AS (SELECT (a."submittedAt" AT TIME ZONE 'UTC')::date AS "day", count(*)::int n FROM "AssessmentAttempt" a
        JOIN enrollments e ON e.id=a."enrollmentId" WHERE a."workspaceId"=${scope.workspaceId}::uuid AND a."courseId"=${scope.courseId}::uuid
        AND a.status <> 'VOID' AND a."submittedAt">=${start} AND a."submittedAt"<${end} GROUP BY 1)
      SELECT d.day, (SELECT count(*)::int FROM enrollments e WHERE (e."enrolledAt" AT TIME ZONE 'UTC')::date=d.day AND e."enrolledAt">=${start} AND e."enrolledAt"<${end}) "newEnrollments",
        coalesce(a.active,0)::int "activeLearners", (SELECT count(*)::int FROM enrollments e WHERE (e."completedAt" AT TIME ZONE 'UTC')::date=d.day AND e."completedAt">=${start} AND e."completedAt"<${end}) completions,
        coalesce(a.seconds,0)::bigint "learningSeconds", coalesce(s.n,0)::int "assessmentSubmissions"
        FROM days d LEFT JOIN activity a ON a.day=d.day LEFT JOIN submissions s ON s.day=d.day ORDER BY d.day`);
    return rows.map((r) =>
      c.dailyCourseMetricSchema.parse({
        ...r,
        courseId: scope.courseId,
        day: r.day.toISOString().slice(0, 10),
        learningSeconds: r.learningSeconds.toString(),
      }),
    );
  }

  async overview(scope: Scope, query: CourseQuery) {
    await this.cohort(scope, query.cohortId);
    return this.prisma.$transaction(
      async (db) => {
        const daily = await this.daily(scope, query, db);
        const r = range(query);
        const enrollments = await db.enrollment.count({
          where: {
            ...scope,
            ...(query.cohortId ? { cohortId: query.cohortId } : {}),
            enrolledAt: { gte: r.start, lt: r.end },
          },
        });
        const completions = daily.reduce((n, d) => n + d.completions, 0);
        const [activity] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT count(DISTINCT a."userId")::bigint count FROM "ActivityEvent" a
          JOIN "Enrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId" AND e."userId"=a."userId"
          WHERE a."workspaceId"=${scope.workspaceId}::uuid AND a."courseId"=${scope.courseId}::uuid
          AND a."occurredAt">=${r.start} AND a."occurredAt"<${r.end}
          ${query.cohortId ? Prisma.sql`AND e."cohortId"=${query.cohortId}::uuid` : Prisma.empty}`);
        // Rate is the completion rate of the enrollment population acquired in this window.
        const completedPopulation = await db.enrollment.count({
          where: {
            ...scope,
            ...(query.cohortId ? { cohortId: query.cohortId } : {}),
            enrolledAt: { gte: r.start, lt: r.end },
            completedAt: { lt: r.end },
          },
        });
        return c.courseAnalyticsOverviewSchema.parse({
          courseId: scope.courseId,
          enrollments: String(enrollments),
          completions: String(completions),
          activeLearners: (activity?.count ?? 0n).toString(),
          completionRate: enrollments
            ? new Prisma.Decimal(completedPopulation).mul(100).div(enrollments).toFixed(2)
            : '0',
          learningSeconds: daily.reduce((n, d) => n + BigInt(d.learningSeconds), 0n).toString(),
          daily,
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async learners(scope: Scope, query: c.LearnerAnalyticsQuery) {
    await this.cohort(scope, query.cohortId);
    const r = range(query);
    const hash = filterHash({
      scope,
      from: r.start.toISOString(),
      to: r.end.toISOString(),
      cohortId: query.cohortId ?? null,
    });
    let after: { id: string; createdAt: Date } | undefined;
    if (query.cursor) {
      try {
        const cursor = c.cursorPayloadSchema.parse(
          JSON.parse(Buffer.from(query.cursor, 'base64url').toString()),
        );
        if (cursor.filterHash !== hash || cursor.sort !== 'createdAt') throw new Error();
        after = { id: cursor.id, createdAt: new Date(c.timestampSchema.parse(cursor.value)) };
      } catch {
        throw new BadRequestException('Invalid report cursor');
      }
    }
    const rows = await this.prisma.$queryRaw<
      Array<{
        createdAt: Date;
        enrollmentId: string;
        userId: string;
        cohortId: string | null;
        completionPercent: Prisma.Decimal;
        lastActivityAt: Date | null;
        learningSeconds: bigint;
      }>
    >(Prisma.sql`
      SELECT e."createdAt", e.id "enrollmentId", e."userId", e."cohortId", e."completionPercent",
        (SELECT max(a."occurredAt") FROM "ActivityEvent" a WHERE a."workspaceId"=e."workspaceId" AND a."enrollmentId"=e.id AND a."occurredAt">=${r.start} AND a."occurredAt"<${r.end}) "lastActivityAt",
        (SELECT coalesce(sum((a.properties->>'elapsedSeconds')::int),0)::bigint FROM "ActivityEvent" a WHERE a."workspaceId"=e."workspaceId" AND a."enrollmentId"=e.id AND a.type='lesson.playback' AND a."occurredAt">=${r.start} AND a."occurredAt"<${r.end}) "learningSeconds"
      FROM "Enrollment" e WHERE e."workspaceId"=${scope.workspaceId}::uuid AND e."courseId"=${scope.courseId}::uuid AND e."enrolledAt"<${r.end}
      ${query.cohortId ? Prisma.sql`AND e."cohortId"=${query.cohortId}::uuid` : Prisma.empty}
      ${after ? Prisma.sql`AND (e."createdAt",e.id)<(${after.createdAt},${after.id}::uuid)` : Prisma.empty} ORDER BY e."createdAt" DESC,e.id DESC LIMIT ${query.limit + 1}`);
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit).map((row) =>
      c.learnerAnalyticsSchema.parse({
        enrollmentId: row.enrollmentId,
        userId: row.userId,
        cohortId: row.cohortId,
        completionPercent: row.completionPercent.toString(),
        learningSeconds: row.learningSeconds.toString(),
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
      }),
    );
    const last = data.at(-1);
    return {
      data,
      meta: {
        hasMore,
        limit: query.limit,
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  revision: 1,
                  sort: 'createdAt',
                  value: rows[query.limit - 1]!.createdAt.toISOString(),
                  id: last.enrollmentId,
                  filterHash: hash,
                }),
              ).toString('base64url')
            : null,
      },
    };
  }

  async assessments(scope: Scope, query: CourseQuery) {
    await this.cohort(scope, query.cohortId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        assessmentId: string;
        attempts: bigint;
        passed: bigint;
        awaitingManualGrading: bigint;
        averagePercent: Prisma.Decimal | null;
      }>
    >(Prisma.sql`
      SELECT a."assessmentId", count(*)::bigint attempts, count(*) FILTER (WHERE a.status='GRADED' AND a.passed=true)::bigint passed,
      count(*) FILTER (WHERE a.status IN ('SUBMITTED','GRADING'))::bigint "awaitingManualGrading",
      avg(a.percent) FILTER (WHERE a.status='GRADED') "averagePercent"
      FROM "AssessmentAttempt" a JOIN "Enrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId"
      WHERE a."workspaceId"=${scope.workspaceId}::uuid AND a."courseId"=${scope.courseId}::uuid AND a.status<>'VOID'
      AND ${dateFilter(Prisma.sql`a."startedAt"`, query)} ${query.cohortId ? Prisma.sql`AND e."cohortId"=${query.cohortId}::uuid` : Prisma.empty}
      GROUP BY a."assessmentId" ORDER BY a."assessmentId"`);
    return rows.map((r) =>
      c.assessmentAnalyticsSchema.parse({
        ...r,
        attempts: r.attempts.toString(),
        passed: r.passed.toString(),
        awaitingManualGrading: r.awaitingManualGrading.toString(),
        averagePercent: r.averagePercent?.toFixed(2) ?? null,
      }),
    );
  }

  /** Allocate order payments to products by frozen line totals, including residual cents deterministically. */
  async revenue(workspaceId: string, query: c.RevenueQuery) {
    const rows = await this.prisma.$queryRaw<
      Array<{ currency: string; paid: bigint; refunded: bigint }>
    >(Prisma.sql`
      WITH payment_lines AS (
        SELECT p.id, p.currency, p.amount, p."paidAt", i."productId", i.id line,
        floor(p.amount::numeric*i."totalAmount"/nullif(sum(i."totalAmount") OVER (PARTITION BY p.id),0))::bigint allocated,
        row_number() OVER (PARTITION BY p.id ORDER BY i.id) rank
        FROM "Payment" p JOIN "OrderItem" i ON i."orderId"=p."orderId" AND i."workspaceId"=p."workspaceId"
        WHERE p."workspaceId"=${workspaceId}::uuid AND p.status='SUCCEEDED' AND ${dateFilter(Prisma.sql`p."paidAt"`, query)} ${query.currency ? Prisma.sql`AND p.currency=${query.currency}` : Prisma.empty} ${query.productId ? Prisma.empty : Prisma.sql`AND false`}),
      allocated AS (SELECT *, coalesce(allocated,0)+CASE WHEN rank=1 THEN amount-coalesce(sum(allocated) OVER (PARTITION BY id),0) ELSE 0 END cents FROM payment_lines),
      paid AS (SELECT p.currency, sum(p.amount)::bigint amount FROM "Payment" p WHERE p."workspaceId"=${workspaceId}::uuid AND p.status='SUCCEEDED'
        AND ${dateFilter(Prisma.sql`p."paidAt"`, query)} ${query.currency ? Prisma.sql`AND p.currency=${query.currency}` : Prisma.empty}
        ${query.productId ? Prisma.sql`AND p."orderId" IS NULL AND EXISTS (SELECT 1 FROM "Subscription" s WHERE s.id=p."subscriptionId" AND s."workspaceId"=p."workspaceId" AND s."productId"=${query.productId}::uuid)` : Prisma.empty} GROUP BY p.currency),
      line_paid AS (SELECT currency,sum(cents)::bigint amount FROM allocated p WHERE ${dateFilter(Prisma.sql`p."paidAt"`, query)}
        ${query.productId ? Prisma.sql`AND p."productId"=${query.productId}::uuid` : Prisma.sql`AND false`}
        ${query.currency ? Prisma.sql`AND p.currency=${query.currency}` : Prisma.empty} GROUP BY currency),
      refunded AS (SELECT r.currency, sum(${query.productId ? Prisma.sql`coalesce((SELECT sum(ri.amount) FROM "RefundItem" ri JOIN "OrderItem" i ON i.id=ri."orderItemId" AND i."workspaceId"=ri."workspaceId" WHERE ri."refundId"=r.id AND ri."workspaceId"=r."workspaceId" AND i."productId"=${query.productId}::uuid), CASE WHEN p."orderId" IS NULL AND EXISTS (SELECT 1 FROM "Subscription" s WHERE s.id=p."subscriptionId" AND s."workspaceId"=r."workspaceId" AND s."productId"=${query.productId}::uuid) THEN r.amount ELSE 0 END)` : Prisma.sql`r.amount`})::bigint amount
        FROM "Refund" r JOIN "Payment" p ON p.id=r."paymentId" AND p."workspaceId"=r."workspaceId" WHERE r."workspaceId"=${workspaceId}::uuid AND r.status='SUCCEEDED' AND p.status='SUCCEEDED'
        AND ${dateFilter(Prisma.sql`r."completedAt"`, query)} ${query.currency ? Prisma.sql`AND r.currency=${query.currency}` : Prisma.empty} GROUP BY r.currency),
      facts AS (SELECT currency,amount paid,0::bigint refunded FROM paid UNION ALL SELECT currency,amount,0::bigint FROM line_paid UNION ALL SELECT currency,0::bigint,amount FROM refunded)
      SELECT currency,sum(paid)::bigint paid,sum(refunded)::bigint refunded FROM facts GROUP BY currency HAVING sum(paid)<>0 OR sum(refunded)<>0 ORDER BY currency`);
    return rows.map((r) => {
      const result = c.revenueMetricSchema.safeParse({
        currency: r.currency,
        paid: safeMoney(r.paid),
        refunded: safeMoney(r.refunded),
        net: safeMoney(r.paid - r.refunded),
      });
      if (!result.success)
        throw new BadRequestException(
          'Revenue exceeds the shared report total limit; narrow the date range',
        );
      return result.data;
    });
  }

  async student(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      select: { id: true, courseId: true, completionPercent: true, completedAt: true },
      take: 1001,
    });
    if (enrollments.length > 1000)
      throw new BadRequestException('Student report exceeds 1000 courses');
    const r = range({
      from: new Date(
        Date.parse(new Date().toISOString().slice(0, 10)) - 365 * 86400000,
      ).toISOString(),
    });
    const days = await this.prisma.$queryRaw<
      Array<{ day: Date; seconds: bigint }>
    >`SELECT ("occurredAt" AT TIME ZONE 'UTC')::date AS "day", coalesce(sum(CASE WHEN type='lesson.playback' THEN (properties->>'elapsedSeconds')::int ELSE 0 END),0)::bigint seconds FROM "ActivityEvent" WHERE "userId"=${userId}::uuid AND "occurredAt">=${r.start} AND "occurredAt"<${r.end} GROUP BY 1 ORDER BY 1`;
    let currentStreakDays = 0;
    const active = new Set(days.map((d) => d.day.toISOString().slice(0, 10)));
    let day = new Date(new Date().toISOString().slice(0, 10));
    if (!active.has(day.toISOString().slice(0, 10))) day = new Date(day.getTime() - 86400000);
    while (active.has(day.toISOString().slice(0, 10))) {
      currentStreakDays++;
      day = new Date(day.getTime() - 86400000);
    }
    const total = await this.prisma.lessonProgress.aggregate({
      where: { enrollment: { userId } },
      _sum: { watchedSeconds: true },
    });
    return c.studentAnalyticsSchema.parse({
      enrolledCourses: enrollments.length,
      completedCourses: enrollments.filter((e) => e.completedAt).length,
      learningSeconds: String(total._sum.watchedSeconds ?? 0),
      currentStreakDays,
      courses: enrollments.map((e) => ({
        courseId: e.courseId,
        enrollmentId: e.id,
        completionPercent: e.completionPercent.toString(),
      })),
      activity: days.map((d) => ({
        day: d.day.toISOString().slice(0, 10),
        learningSeconds: d.seconds.toString(),
      })),
    });
  }

  /** Replacements, never increments. Serializes overlapping rebuilds for a course. */
  async recompute(scope: Scope, query: CourseQuery) {
    if (query.cohortId) throw new BadRequestException('Persistent metrics are course-wide');
    const window = range(query);
    if (window.start.getTime() % 86400000 || window.end.getTime() % 86400000)
      throw new BadRequestException('Persistent metrics require full UTC days');
    return this.prisma.$transaction(
      async (db) => {
        await db.$queryRaw`SELECT id FROM "Course" WHERE id=${scope.courseId}::uuid AND "workspaceId"=${scope.workspaceId}::uuid FOR UPDATE`;
        const rows = await this.daily(scope, query, db);
        for (const row of rows) {
          const { courseId, day, learningSeconds, ...values } = row;
          await db.dailyCourseMetric.upsert({
            where: { courseId_day: { courseId, day: new Date(day) } },
            create: {
              ...scope,
              day: new Date(day),
              ...values,
              learningSeconds: BigInt(learningSeconds),
            },
            update: { ...values, learningSeconds: BigInt(learningSeconds) },
          });
        }
      },
      { timeout: 30000 },
    );
  }
}
