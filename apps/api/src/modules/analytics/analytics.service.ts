import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as c from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AnalyticsReportsService } from './analytics-reports.service';
import { DAY, filterHash, parse, range, type Actor, type Scope } from './analytics.support';

@Injectable()
export class AnalyticsService {
  constructor(
    readonly prisma: PrismaService,
    readonly reports: AnalyticsReportsService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    @Inject(Symbol.for('lms.learning.AccessPolicy')) private readonly access: c.AccessPolicy,
  ) {}

  async course(actor: Actor, scope: Scope, grades = false) {
    const course = { id: scope.courseId, workspaceId: scope.workspaceId };
    const allowed = grades
      ? await this.policy.canManageCourse(actor, course, 'grade')
      : (
          await Promise.all(
            (['grade', 'manageLearners', 'publish'] as const).map((cap) =>
              this.policy.canManageCourse(actor, course, cap),
            ),
          )
        ).some(Boolean);
    if (!allowed) throw new NotFoundException();
  }
  async admin(actor: Actor, workspaceId: string) {
    if (!(await this.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])))
      throw new NotFoundException();
  }
  async readAudit(
    actor: Actor,
    workspaceId: string,
    resourceId: string,
    action: string,
    requestId: string,
  ) {
    await this.audit.record({
      actorId: actor.id,
      workspaceId,
      resourceId,
      resourceType: 'Analytics',
      action,
      requestId,
    });
  }

  async ingest(actor: Actor, workspaceId: string, input: unknown) {
    const { events } = parse(c.activityBatchSchema, input);
    const now = new Date();
    for (const event of events) {
      const occurred = new Date(event.occurredAt);
      if (
        occurred.getTime() < now.getTime() - 7 * DAY ||
        occurred.getTime() > now.getTime() + 300000
      )
        throw new BadRequestException(
          'Activity time must be within 7 days past and 5 minutes future',
        );
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { id: event.enrollmentId, workspaceId, courseId: event.courseId, userId: actor.id },
        select: { id: true, enrolledAt: true },
      });
      if (!enrollment || occurred < enrollment.enrolledAt) throw new NotFoundException();
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: event.lessonId, workspaceId, courseId: event.courseId, deletedAt: null },
        select: { id: true },
      });
      if (
        !lesson ||
        !(
          await this.access.evaluate({
            workspaceId,
            enrollmentId: enrollment.id,
            userId: actor.id,
            lessonId: event.lessonId,
            at: now.toISOString(),
          })
        ).allowed
      )
        throw new NotFoundException();
      if (event.type === 'lesson.navigation') {
        const target = await this.prisma.lesson.findFirst({
          where: {
            id: event.properties.destinationLessonId,
            workspaceId,
            courseId: event.courseId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!target) throw new NotFoundException();
      }
    }
    return this.prisma
      .$transaction(
        async (tx) => {
          // Global per-actor rate bound across workspaces and concurrent HTTP requests.
          await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
          const recent = await tx.activityEvent.count({
            where: { userId: actor.id, receivedAt: { gte: new Date(now.getTime() - 60000) } },
          });
          let accepted = 0,
            duplicates = 0;
          for (const e of events) {
            const previous = await tx.activityEvent.findUnique({
              where: { workspaceId_eventId: { workspaceId, eventId: e.eventId } },
            });
            if (previous) {
              if (
                previous.userId !== actor.id ||
                previous.courseId !== e.courseId ||
                previous.lessonId !== e.lessonId ||
                previous.enrollmentId !== e.enrollmentId ||
                previous.type !== e.type ||
                previous.occurredAt.getTime() !== new Date(e.occurredAt).getTime() ||
                filterHash(previous.properties) !== filterHash(e.properties) ||
                previous.sessionKey !== (e.sessionKey ?? null)
              )
                throw new ConflictException('Activity event ID already used');
              duplicates++;
              continue;
            }
            if (recent + accepted >= 1000) throw new HttpException('Activity rate exceeded', 429);
            await tx.activityEvent.create({
              data: {
                ...e,
                workspaceId,
                userId: actor.id,
                occurredAt: new Date(e.occurredAt),
                receivedAt: now,
                properties: e.properties,
              },
            });
            accepted++;
          }
          return { accepted, duplicates };
        },
        { timeout: 15000 },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Activity event ID already used');
        throw error;
      });
  }

  async authorizeExport(actor: Actor, workspaceId: string, input: c.ExportRequest) {
    const p = input.parameters;
    range(p);
    if (input.kind === 'REVENUE') {
      if (p.courseId || p.cohortId)
        throw new BadRequestException('Revenue reports accept product and currency filters');
      await this.admin(actor, workspaceId);
      if (
        p.productId &&
        !(await this.prisma.product.findFirst({
          where: { id: p.productId, workspaceId },
          select: { id: true },
        }))
      )
        throw new NotFoundException();
    } else {
      if (!p.courseId || p.productId || p.currency)
        throw new BadRequestException(
          'Course reports require courseId and accept only cohort/date filters',
        );
      await this.course(actor, { workspaceId, courseId: p.courseId }, input.kind === 'ASSESSMENTS');
      await this.reports.cohort({ workspaceId, courseId: p.courseId }, p.cohortId);
    }
  }

  async requestExport(
    actor: Actor,
    workspaceId: string,
    raw: unknown,
    key: string | undefined,
    requestId: string,
  ) {
    const input = parse(c.exportRequestSchema, raw);
    const window = range(input.parameters);
    const parameters = {
      ...input.parameters,
      from: window.start.toISOString(),
      to: window.end.toISOString(),
    };
    await this.authorizeExport(actor, workspaceId, input);
    if (!key || !/^[\x21-\x7e]{16,128}$/.test(key))
      throw new BadRequestException(
        'Idempotency-Key (16–128 visible ASCII characters) is required',
      );
    const idempotencyKey = key;
    const route = 'analytics.exports';
    const requestHash = filterHash(input);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id}::uuid FOR UPDATE`;
      const prior = await tx.idempotencyRecord.findUnique({
        where: {
          workspaceId_userId_route_key: {
            workspaceId,
            userId: actor.id,
            route,
            key: idempotencyKey,
          },
        },
      });
      if (prior && prior.expiresAt > new Date()) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException({
            code: 'IDEMPOTENCY_CONFLICT',
            message: 'Idempotency key used with different report',
          });
        return prior.response as { operationId: string; status: 'PENDING' };
      }
      if (prior) await tx.idempotencyRecord.delete({ where: { id: prior.id } });
      const active = await tx.reportExport.count({
        where: {
          workspaceId,
          requestedById: actor.id,
          status: { in: ['PENDING', 'PROCESSING'] },
          expiresAt: { gt: new Date() },
        },
      });
      if (active >= 5) throw new HttpException('Too many active exports', 429);
      const report = await tx.reportExport.create({
        data: {
          workspaceId,
          requestedById: actor.id,
          kind: input.kind,
          parameters: parameters as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      const response = { operationId: report.id, status: 'PENDING' as const };
      await this.outbox.append(tx, {
        workspaceId,
        type: 'analytics.export.requested.v1',
        aggregateType: 'ReportExport',
        aggregateId: report.id,
        payload: { operationId: report.id },
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        workspaceId,
        resourceType: 'ReportExport',
        resourceId: report.id,
        action: 'analytics.export.requested',
        requestId,
        changes: { kind: input.kind, parameters: input.parameters },
      });
      await tx.idempotencyRecord.create({
        data: {
          workspaceId,
          userId: actor.id,
          route,
          key: idempotencyKey,
          requestHash,
          status: 'COMPLETED',
          responseStatus: 202,
          response,
          expiresAt: new Date(Date.now() + DAY),
        },
      });
      return response;
    });
  }

  async operation(actor: Actor, workspaceId: string, id: string, requestId: string) {
    const row = await this.prisma.reportExport.findFirst({
      where: { id, workspaceId },
      include: { asset: true },
    });
    if (
      !row ||
      (row.requestedById !== actor.id &&
        !(await this.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])))
    )
      throw new NotFoundException();
    await this.authorizeExport(
      actor,
      workspaceId,
      parse(c.exportRequestSchema, { kind: row.kind, parameters: row.parameters }),
    );
    if (row.expiresAt <= new Date() || row.status === 'EXPIRED') {
      await this.prisma.reportExport.updateMany({
        where: { id, workspaceId },
        data: { status: 'EXPIRED', lockedUntil: null },
      });
      return {
        operationId: id,
        status: 'EXPIRED' as const,
        expiresAt: row.expiresAt.toISOString(),
      };
    }
    let url: string | undefined;
    if (
      row.status === 'READY' &&
      row.asset?.status === 'READY' &&
      !row.asset.deletedAt &&
      row.asset.visibility === 'PRIVATE' &&
      row.asset.bucket === this.storage.privateBucket
    ) {
      await this.readAudit(actor, workspaceId, id, 'analytics.export.download', requestId);
      const remainingSeconds = Math.floor((row.expiresAt.getTime() - Date.now()) / 1000);
      if (remainingSeconds < 1) {
        await this.prisma.reportExport.updateMany({
          where: { id, workspaceId },
          data: { status: 'EXPIRED', lockedUntil: null },
        });
        return {
          operationId: id,
          status: 'EXPIRED' as const,
          expiresAt: row.expiresAt.toISOString(),
        };
      }
      url = await this.storage.createDownloadUrl(
        row.asset.objectKey,
        Math.min(300, remainingSeconds),
      );
    }
    return c.exportOperationSchema.parse({
      operationId: id,
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
      ...(url ? { url } : {}),
    });
  }
}
