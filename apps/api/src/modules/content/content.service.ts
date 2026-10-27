import { eventPayloadSchemas } from '@lms/shared';
import { OutboxService } from '../events/outbox.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  lessonCreateSchema,
  cohortCreateSchema,
  liveSessionCreateSchema,
  liveSessionSchema,
  attendanceSchema,
  type LessonCreate,
  type LessonUpdate,
  type SectionCreate,
  type SectionUpdate,
  type CohortCreate,
  type CohortUpdate,
  type CohortReleaseUpsert,
  type LiveSessionCreate,
  type LiveSessionUpdate,
  type AttendanceUpdate,
  type LessonAssetAttach,
} from '@lms/shared';
import { createCipheriv, randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  ContentSupport,
  ContentPagination,
  ACCESS_POLICY,
  required,
  parseInput,
  entity,
  lessonData,
  lessonDto,
  assertAcyclic,
  type Actor,
  type Scope,
} from './content.support';
import { CohortCapacityService } from './cohort-capacity.service';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ContentService {
  constructor(
    private readonly support: ContentSupport,
    private readonly capacity: CohortCapacityService,
    private readonly config: ConfigService,
    private readonly pages: ContentPagination,
    @Optional() @Inject(ACCESS_POLICY) private readonly access?: import('@lms/shared').AccessPolicy,
    @Optional() private readonly outbox?: OutboxService,
  ) {}
  async listCohorts(actor: Actor, scope: Scope, q: import('@lms/shared').CursorQuery) {
    await this.support.authorize(actor, scope, 'read');
    return this.cohortPage(scope, q, false);
  }
  async publicCohorts(courseId: string, q: import('@lms/shared').CursorQuery) {
    const course = required(
      await this.support.prisma.course.findFirst({
        where: {
          id: courseId,
          status: 'PUBLISHED',
          visibility: { in: ['PUBLIC', 'UNLISTED'] },
          deletedAt: null,
          workspace: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    );
    return this.cohortPage({ workspaceId: course.workspaceId, courseId }, q, true);
  }
  async cohortPage(scope: Scope, q: import('@lms/shared').CursorQuery, publicOnly: boolean) {
    const key = { ...scope, publicOnly };
    const c = this.pages.decode(q, key);
    const rows = await this.support.prisma.cohort.findMany({
      where: {
        ...scope,
        deletedAt: null,
        ...(publicOnly ? { isPublished: true } : {}),
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.value) } },
                { createdAt: new Date(c.value), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const p = this.pages.page(rows, q, key, (r) => r.createdAt.toISOString());
    const data = await Promise.all(
      p.data.map(async (r) => {
        if (!publicOnly) return entity(r);
        const { createdAt: _c, updatedAt: _u, ...rest } = entity(r);
        const used = await this.capacity.occupied(this.support.prisma, scope, r.id, new Date());
        return {
          ...rest,
          seatsAvailable: r.capacity === null ? null : Math.max(0, r.capacity - used),
        };
      }),
    );
    return { ...p, data };
  }
  async listAttendance(
    actor: Actor,
    scope: Scope,
    sessionId: string,
    q: import('@lms/shared').CursorQuery,
  ) {
    await this.support
      .authorize(actor, scope, 'manageLearners')
      .catch(() => this.support.authorize(actor, scope, 'grade'));
    required(
      await this.support.prisma.liveSession.findFirst({
        where: { ...scope, id: sessionId, deletedAt: null },
      }),
    );
    const key = { ...scope, sessionId };
    const c = this.pages.decode(q, key);
    const rows = await this.support.prisma.attendance.findMany({
      where: {
        ...scope,
        sessionId,
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.value) } },
                { createdAt: new Date(c.value), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const p = this.pages.page(rows, q, key, (r) => r.createdAt.toISOString());
    return { ...p, data: p.data.map((r) => project(attendanceSchema, r)) };
  }
  async roster(actor: Actor, scope: Scope, cohortId: string, q: import('@lms/shared').CursorQuery) {
    await this.support.authorize(actor, scope, 'manageLearners');
    required(
      await this.support.prisma.cohort.findFirst({
        where: { ...scope, id: cohortId, deletedAt: null },
      }),
    );
    if (!this.access) throw new ServiceUnavailableException('Learning AccessPolicy is not bound');
    const key = { ...scope, cohortId, roster: true };
    const c = this.pages.decode(q, key);
    const rows = await this.support.prisma.enrollment.findMany({
      where: {
        ...scope,
        cohortId,
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.value) } },
                { createdAt: new Date(c.value), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: { enrollmentGrants: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const p = this.pages.page(rows, q, key, (r) => r.createdAt.toISOString());
    const data = await Promise.all(
      p.data.map(async (r) => {
        const { enrollmentGrants: grants, policySnapshot: _policy, ...rest } = r;
        return {
          ...JSON.parse(JSON.stringify(rest)),
          completionPercent: r.completionPercent.toString(),
          access: await this.access!.evaluate({
            workspaceId: scope.workspaceId,
            userId: r.userId,
            enrollmentId: r.id,
            at: new Date().toISOString(),
          }),
          grants: grants.map((g) => ({
            id: g.id,
            source: g.source,
            startsAt: g.startsAt.toISOString(),
            expiresAt: g.expiresAt?.toISOString() ?? null,
            revokedAt: g.revokedAt?.toISOString() ?? null,
          })),
        };
      }),
    );
    return { ...p, data };
  }
  async outline(actor: Actor, scope: Scope) {
    await this.support.authorize(actor, scope, 'read');
    const rows = await this.support.prisma.section.findMany({
      where: { ...scope, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    return rows.map(entity);
  }
  async section(
    actor: Actor,
    scope: Scope,
    input: SectionCreate | SectionUpdate | null,
    id?: string,
  ) {
    return this.support.mutate(actor, scope, 'section.updated', async (tx) => {
      if (id) required(await tx.section.findFirst({ where: { ...scope, id, deletedAt: null } }));
      if (input === null && id) {
        const lessons = await tx.lesson.findMany({
          where: { ...scope, sectionId: id, deletedAt: null },
        });
        for (const l of lessons) await this.unusedLesson(tx, scope, l.id);
        await tx.lesson.updateMany({
          where: { ...scope, sectionId: id },
          data: { deletedAt: new Date(), isPublished: false },
        });
        await tx.section.update({ where: { id }, data: { deletedAt: new Date() } });
        return;
      }
      const row = id
        ? await tx.section.update({ where: { id }, data: input as SectionUpdate })
        : await tx.section.create({ data: { ...scope, ...(input as SectionCreate) } });
      return entity(row);
    });
  }
  async reorder(actor: Actor, scope: Scope, ids: string[], sectionId?: string) {
    return this.support.mutate(actor, scope, 'outline.reordered', async (tx) => {
      if (sectionId)
        required(
          await tx.section.findFirst({ where: { ...scope, id: sectionId, deletedAt: null } }),
        );
      const rows = sectionId
        ? await tx.lesson.findMany({ where: { ...scope, sectionId } })
        : await tx.section.findMany({ where: scope });
      const active = rows.filter((r) => !r.deletedAt);
      if (active.length !== ids.length || ids.some((id) => !active.some((r) => r.id === id)))
        throw new BadRequestException('Reorder must contain every active sibling once');
      // Include tombstones: uniqueness covers them too. Two passes never collide with occupied slots.
      const ordered = [...ids, ...rows.filter((r) => r.deletedAt).map((r) => r.id)];
      const floor = Math.min(0, ...rows.map((r) => r.position)) - ordered.length - 1;
      for (const [i, id] of ordered.entries()) {
        if (sectionId) await tx.lesson.update({ where: { id }, data: { position: floor - i } });
        else await tx.section.update({ where: { id }, data: { position: floor - i } });
      }
      for (const [i, id] of ordered.entries()) {
        if (sectionId) await tx.lesson.update({ where: { id }, data: { position: i } });
        else await tx.section.update({ where: { id }, data: { position: i } });
      }
    });
  }
  async lesson(actor: Actor, scope: Scope, id: string, preview = false) {
    await this.support.authorize(actor, scope, 'read');
    const row = await this.support.lesson(this.support.prisma, scope, id);
    if (preview)
      await this.support.audit.record({
        action: 'lesson.staff_preview',
        resourceType: 'Lesson',
        resourceId: id,
        workspaceId: scope.workspaceId,
        actorId: actor.id,
        requestId: this.support.requestId(),
      });
    return lessonDto(row);
  }
  async createLesson(actor: Actor, scope: Scope, sectionId: string, input: LessonCreate) {
    return this.support.mutate(actor, scope, 'lesson.created', async (tx) => {
      required(await tx.section.findFirst({ where: { ...scope, id: sectionId, deletedAt: null } }));
      const data = lessonData(input);
      const course = required(await tx.course.findUnique({ where: { id: scope.courseId } }));
      if (course.deliveryMode === 'SELF_PACED' && data.releaseType === 'COHORT_OFFSET')
        throw new BadRequestException('Cohort release requires cohort');
      return lessonDto(await tx.lesson.create({ data: { ...scope, sectionId, ...data } }));
    });
  }
  async updateLesson(actor: Actor, scope: Scope, id: string, input: LessonUpdate) {
    return this.support.mutate(actor, scope, 'lesson.updated', async (tx) => {
      const old = await this.support.lesson(tx, scope, id);
      if (input.version !== old.version) throw new ConflictException('Stale lesson version');
      const previous = lessonDto(old);
      const fields = Object.fromEntries(
        Object.keys(lessonCreateSchema.shape).map((k) => [
          k,
          (previous as Record<string, unknown>)[k],
        ]),
      );
      const { version: _version, ...patch } = input;
      const data = lessonData(parseInput(lessonCreateSchema, { ...fields, ...patch }));
      if (old.type !== data.type) {
        await this.unusedLesson(tx, scope, id);
        if (await tx.lessonAsset.count({ where: { workspaceId: scope.workspaceId, lessonId: id } }))
          throw new ConflictException('Detach existing assets before changing lesson type');
      }
      const course = required(await tx.course.findUnique({ where: { id: scope.courseId } }));
      if (course.deliveryMode === 'SELF_PACED' && data.releaseType === 'COHORT_OFFSET')
        throw new BadRequestException('Cohort release requires cohort');
      const policyChanged =
        old.isRequired !== data.isRequired ||
        old.isPublished !== data.isPublished ||
        old.completionRule !== data.completionRule ||
        old.requiredWatchPercent !== data.requiredWatchPercent ||
        old.releaseType !== data.releaseType ||
        old.releaseAt?.getTime() !== data.releaseAt?.getTime() ||
        old.releaseOffsetDays !== data.releaseOffsetDays ||
        old.availableUntil?.getTime() !== data.availableUntil?.getTime();
      if (old.isRequired && policyChanged && (await tx.enrollment.count({ where: scope })))
        throw new ConflictException(
          'Delivered required lesson policy is retained; a reviewed migration is required',
        );
      return lessonDto(
        await tx.lesson.update({ where: { id }, data: { ...data, version: { increment: 1 } } }),
      );
    });
  }
  async unusedLesson(tx: Prisma.TransactionClient, scope: Scope, id: string) {
    if (
      (await tx.lessonProgress.count({ where: { ...scope, lessonId: id } })) ||
      (await tx.assessment.count({ where: { ...scope, lessonId: id } })) ||
      (await tx.liveSession.count({ where: { ...scope, lessonId: id } })) ||
      (await tx.lessonPrerequisite.count({ where: { ...scope, requiredLessonId: id } })) ||
      (await tx.enrollment.count({ where: scope }))
    )
      throw new ConflictException('Lesson has retained references');
  }
  async removeLesson(actor: Actor, scope: Scope, id: string) {
    return this.support.mutate(actor, scope, 'lesson.deleted', async (tx) => {
      await this.support.lesson(tx, scope, id);
      await this.unusedLesson(tx, scope, id);
      await tx.lesson.update({
        where: { id },
        data: { deletedAt: new Date(), isPublished: false, version: { increment: 1 } },
      });
    });
  }
  async prerequisites(actor: Actor, scope: Scope, id: string, ids: string[]) {
    return this.support.mutate(actor, scope, 'lesson.prerequisites.updated', async (tx) => {
      await this.support.lesson(tx, scope, id);
      if (
        (await tx.lesson.count({ where: { ...scope, id: { in: ids }, deletedAt: null } })) !==
        ids.length
      )
        throw new BadRequestException('Prerequisite must be in the same course');
      const edges = await tx.lessonPrerequisite.findMany({
        where: { ...scope, lessonId: { not: id } },
      });
      assertAcyclic([
        ...edges.map((e) => ({ from: e.lessonId, to: e.requiredLessonId })),
        ...ids.map((to) => ({ from: id, to })),
      ]);
      await tx.lessonPrerequisite.deleteMany({ where: { ...scope, lessonId: id } });
      await tx.lessonPrerequisite.createMany({
        data: ids.map((requiredLessonId) => ({ ...scope, lessonId: id, requiredLessonId })),
      });
    });
  }
  async attach(actor: Actor, scope: Scope, id: string, input: LessonAssetAttach) {
    return this.support.mutate(actor, scope, 'lesson.asset.attached', async (tx) => {
      const l = await this.support.lesson(tx, scope, id);
      const a = required(
        await tx.asset.findFirst({
          where: {
            workspaceId: scope.workspaceId,
            id: input.assetId,
            deletedAt: null,
            status: 'READY',
          },
        }),
      );
      const meta = a.metadata as Record<string, unknown>;
      if (meta.parentId !== id || meta.purpose !== input.purpose)
        throw new BadRequestException('Upload purpose/parent mismatch');
      if (
        (input.purpose === 'PRIMARY_VIDEO' && (l.type !== 'VIDEO' || a.mimeType !== 'video/mp4')) ||
        (input.purpose === 'PRIMARY_DOCUMENT' &&
          (l.type !== 'DOCUMENT' || a.mimeType !== 'application/pdf')) ||
        (input.purpose === 'CAPTIONS' && a.mimeType !== 'text/vtt') ||
        (input.purpose === 'RECORDING' && l.type !== 'LIVE_SESSION')
      )
        throw new BadRequestException('Asset purpose does not match lesson');
      if (
        ['PRIMARY_VIDEO', 'PRIMARY_DOCUMENT'].includes(input.purpose) &&
        (await tx.lessonAsset.count({
          where: { workspaceId: scope.workspaceId, lessonId: id, purpose: input.purpose },
        }))
      )
        throw new ConflictException('Primary asset already exists');
      const row = await tx.lessonAsset.create({
        data: { workspaceId: scope.workspaceId, lessonId: id, ...input },
      });
      return { id: row.id, workspaceId: row.workspaceId, lessonId: id, ...input };
    });
  }
  async detach(actor: Actor, scope: Scope, id: string, assetId: string) {
    return this.support.mutate(actor, scope, 'lesson.asset.detached', async (tx) => {
      await this.support.lesson(tx, scope, id);
      const course = required(await tx.course.findUnique({ where: { id: scope.courseId } }));
      if (course.status === 'PUBLISHED')
        throw new ConflictException('Published assets must be retained');
      await tx.lessonAsset.deleteMany({
        where: { workspaceId: scope.workspaceId, lessonId: id, assetId },
      });
    });
  }
  async cohorts(actor: Actor, scope: Scope) {
    await this.support.authorize(actor, scope, 'read');
    return (
      await this.support.prisma.cohort.findMany({
        where: { ...scope, deletedAt: null },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
    ).map(entity);
  }
  async cohort(actor: Actor, scope: Scope, input: CohortCreate | CohortUpdate | null, id?: string) {
    return this.support.mutate(
      actor,
      scope,
      'cohort.updated',
      async (tx) => {
        const c = required(await tx.course.findUnique({ where: { id: scope.courseId } }));
        if (c.deliveryMode !== 'COHORT') throw new BadRequestException('Course is self-paced');
        const old = id
          ? required(await tx.cohort.findFirst({ where: { ...scope, id, deletedAt: null } }))
          : null;
        if (id) await this.capacity.lock(tx, scope, id);
        if (input === null && id) {
          const occupied = await this.capacity.occupied(tx, scope, id, new Date());
          const row = await tx.cohort.update({
            where: { id },
            data: occupied ? { isPublished: false } : { deletedAt: new Date(), isPublished: false },
          });
          return entity(row);
        }
        const base = old
          ? Object.fromEntries(
              Object.keys(cohortCreateSchema.shape).map((k) => [
                k,
                (JSON.parse(JSON.stringify(old)) as Record<string, unknown>)[k],
              ]),
            )
          : {};
        const v = parseInput(cohortCreateSchema, { ...base, ...input });
        if (
          id &&
          v.capacity !== null &&
          v.capacity < (await this.capacity.occupied(tx, scope, id, new Date()))
        )
          throw new ConflictException('Capacity below occupied seats');
        return entity(
          id
            ? await tx.cohort.update({ where: { id }, data: v })
            : await tx.cohort.create({ data: { ...scope, ...v } }),
        );
      },
      'publish',
    );
  }
  async release(
    actor: Actor,
    scope: Scope,
    cohortId: string,
    lessonId: string,
    input: CohortReleaseUpsert | null,
  ) {
    return this.support.mutate(actor, scope, 'cohort.release.updated', async (tx) => {
      required(await tx.cohort.findFirst({ where: { ...scope, id: cohortId, deletedAt: null } }));
      await this.support.lesson(tx, scope, lessonId);
      if (!input) {
        await tx.cohortLessonRelease.deleteMany({ where: { ...scope, cohortId, lessonId } });
        return;
      }
      return entity(
        await tx.cohortLessonRelease.upsert({
          where: { cohortId_lessonId: { cohortId, lessonId } },
          create: { ...scope, cohortId, lessonId, ...input },
          update: input,
        }),
      );
    });
  }
  encryptHost(url: string) {
    const key = this.config.get<string>('CONTENT_HOST_KEY') ?? process.env.CONTENT_HOST_KEY;
    if (!key || !/^[a-f0-9]{64}$/.test(key))
      throw new BadRequestException('Host URL encryption key is not configured');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    const data = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
    return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
  }
  async session(
    actor: Actor,
    scope: Scope,
    input: LiveSessionCreate | LiveSessionUpdate,
    lessonId?: string,
    id?: string,
  ) {
    return this.support.mutate(actor, scope, 'live_session.updated', async (tx) => {
      const old = id
        ? required(await tx.liveSession.findFirst({ where: { ...scope, id, deletedAt: null } }))
        : null;
      const l = await this.support.lesson(tx, scope, old?.lessonId ?? required(lessonId));
      if (l.type !== 'LIVE_SESSION') throw new BadRequestException('Expected live lesson');
      const base = old
        ? {
            title: old.title,
            provider: old.provider,
            joinUrl: old.joinUrl,
            startsAt: old.startsAt.toISOString(),
            endsAt: old.endsAt.toISOString(),
            cohortId: old.cohortId,
          }
        : {};
      const { status, ...rest } = input as LiveSessionUpdate;
      const v = parseInput(liveSessionCreateSchema, { ...base, ...rest });
      if (v.cohortId)
        required(
          await tx.cohort.findFirst({ where: { ...scope, id: v.cohortId, deletedAt: null } }),
        );
      const { hostUrl, ...data } = v;
      const encrypted =
        hostUrl === undefined
          ? {}
          : { hostUrlEncrypted: hostUrl ? this.encryptHost(hostUrl) : null };
      const row = id
        ? await tx.liveSession.update({
            where: { id },
            data: { ...data, ...encrypted, ...(status ? { status } : {}) },
          })
        : await tx.liveSession.create({
            data: { ...scope, lessonId: l.id, ...data, ...encrypted },
          });
      const eventType = 'content.live-session.changed.v1';
      if (!this.outbox || !(eventType in eventPayloadSchemas))
        throw new ServiceUnavailableException(
          'Live-session notification event contract is not integrated',
        );
      await this.outbox.append(tx, {
        type: eventType,
        workspaceId: scope.workspaceId,
        aggregateType: 'LiveSession',
        aggregateId: row.id,
        payload: { courseId: scope.courseId, sessionId: row.id },
      });
      return project(liveSessionSchema, row);
    });
  }
  async attendance(
    actor: Actor,
    scope: Scope,
    sessionId: string,
    enrollmentId?: string,
    input?: AttendanceUpdate,
  ) {
    if (!input) {
      await this.support
        .authorize(actor, scope, 'manageLearners')
        .catch(() => this.support.authorize(actor, scope, 'grade'));
      required(
        await this.support.prisma.liveSession.findFirst({
          where: { ...scope, id: sessionId, deletedAt: null },
        }),
      );
      return (
        await this.support.prisma.attendance.findMany({
          where: { ...scope, sessionId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        })
      ).map((r) => project(attendanceSchema, r));
    }
    return this.support.mutate(
      actor,
      scope,
      'live_session.attendance.corrected',
      async (tx) => {
        const session = required(
          await tx.liveSession.findFirst({ where: { ...scope, id: sessionId, deletedAt: null } }),
        );
        const enrollment = required(
          await tx.enrollment.findFirst({ where: { ...scope, id: enrollmentId } }),
        );
        if (session.cohortId && session.cohortId !== enrollment.cohortId)
          throw new BadRequestException('Enrollment outside session cohort');
        if (input.attendedSeconds > (session.endsAt.getTime() - session.startsAt.getTime()) / 1000)
          throw new BadRequestException('Attendance exceeds session duration');
        const row = await tx.attendance.upsert({
          where: { sessionId_enrollmentId: { sessionId, enrollmentId: enrollment.id } },
          create: {
            ...scope,
            sessionId,
            enrollmentId: enrollment.id,
            status: input.status,
            durationSeconds: input.attendedSeconds,
          },
          update: { status: input.status, durationSeconds: input.attendedSeconds },
        });
        await this.support.audit.append(tx, {
          action: 'attendance.corrected',
          resourceType: 'Attendance',
          resourceId: row.id,
          actorId: actor.id,
          workspaceId: scope.workspaceId,
          requestId: this.support.requestId(),
          changes: { reason: input.reason },
        });
        return project(attendanceSchema, row);
      },
      'manageLearners',
    );
  }
}

function project<T extends import('zod').z.ZodObject>(
  schema: T,
  row: unknown,
): import('zod').z.output<T> {
  const v = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  return schema.parse(Object.fromEntries(Object.keys(schema.shape).map((k) => [k, v[k]])));
}
