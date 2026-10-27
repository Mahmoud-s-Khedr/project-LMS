import { ContentRequestContext } from './content-request-context';
import type { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
  Optional,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Lesson } from '@prisma/client';
import {
  lessonCreateSchema,
  lessonPayloadSchema,
  lessonReleaseSchema,
  lessonSchema,
  cursorPayloadSchema,
  type CursorQuery,
  type LessonCreate,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService, type AuthenticatedUser, type CourseCapability } from '../../common/authz';
import { AuditService } from '../audit/audit.service';

export type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
export type Scope = { workspaceId: string; courseId: string };
export const CONTENT_PUBLICATION_VALIDATOR = Symbol.for('lms.content.PublicationValidator');
export interface PublicationValidator {
  validatePublish(tx: Prisma.TransactionClient, scope: Scope): Promise<void>;
}
export const ACCESS_POLICY = Symbol.for('lms.learning.AccessPolicy');
export const ASSESSMENT_PUBLISH_VALIDATOR = Symbol.for('lms.assessments.PublishValidator');
export interface AssessmentPublishValidator {
  validateCourse(tx: Prisma.TransactionClient, scope: Scope): Promise<void>;
}
export function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return new ZodValidationPipe(schema).transform(value);
}
export function conflict(message: string): never {
  throw new ConflictException(message);
}
export function required<T>(value: T | null | undefined): T {
  if (!value) throw new NotFoundException();
  return value;
}
export function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export function entity<T extends object>(row: T) {
  const { deletedAt: _deletedAt, ...rest } = row as T & { deletedAt?: Date | null };
  return JSON.parse(JSON.stringify(rest)) as Omit<T, 'deletedAt'>;
}
export function lessonDto(row: Lesson) {
  const release = lessonReleaseSchema.parse({
    releaseType: row.releaseType,
    ...(row.releaseType === 'ABSOLUTE' ? { releaseAt: row.releaseAt?.toISOString() } : {}),
    ...(['COHORT_OFFSET', 'ENROLLMENT_OFFSET'].includes(row.releaseType)
      ? { releaseOffsetDays: row.releaseOffsetDays }
      : {}),
    availableUntil: row.availableUntil?.toISOString() ?? null,
  });
  return lessonSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    courseId: row.courseId,
    sectionId: row.sectionId,
    title: row.title,
    position: row.position,
    isRequired: row.isRequired,
    isPreview: row.isPreview,
    isPublished: row.isPublished,
    estimatedMinutes: row.estimatedMinutes,
    completionRule: row.completionRule,
    requiredWatchPercent: row.requiredWatchPercent,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    release,
    payload: lessonPayloadSchema.parse({ type: row.type, body: row.body }),
  });
}
export function lessonData(input: LessonCreate) {
  const v = parseInput(lessonCreateSchema, input);
  if (v.payload.type === 'INTERACTIVE') {
    const origin = new URL(v.payload.body.embedUrl).origin;
    const allowed = (
      process.env.CONTENT_EMBED_ORIGINS ??
      'https://www.youtube-nocookie.com,https://player.vimeo.com,https://www.h5p.com'
    ).split(',');
    if (!allowed.includes(origin)) throw new BadRequestException('Embed origin is not approved');
    if (v.payload.body.sandbox.includes('allow-same-origin'))
      throw new BadRequestException('Same-origin embed permission is forbidden');
  }
  if (
    ['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(v.payload.type) &&
    v.completionRule !== 'ASSESSMENT_PASS'
  )
    throw new BadRequestException('Assessments require passing-grade completion');
  const { payload, release, ...common } = v;
  return {
    ...common,
    type: payload.type,
    body: json(payload.body),
    embedUrl: payload.type === 'INTERACTIVE' ? payload.body.embedUrl : null,
    releaseType: release.releaseType,
    releaseAt: release.releaseType === 'ABSOLUTE' ? new Date(release.releaseAt) : null,
    releaseOffsetDays: 'releaseOffsetDays' in release ? release.releaseOffsetDays : null,
    availableUntil: release.availableUntil ? new Date(release.availableUntil) : null,
  };
}
export function assertAcyclic(edges: readonly { from: string; to: string }[]): void {
  const graph = new Map<string, string[]>();
  for (const e of edges) graph.set(e.from, [...(graph.get(e.from) ?? []), e.to]);
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) conflict('Prerequisite cycle');
    if (done.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of graph.keys()) visit(id);
}
/** UTC calendar-day offsets; close boundaries are exclusive. Learning may reuse this evaluator. */
export function releaseWindow(
  input: {
    releaseType: string;
    releaseAt: Date | null;
    releaseOffsetDays: number | null;
    availableUntil: Date | null;
  },
  enrolledAt: Date,
  cohortStartsAt: Date | null,
  override?: { releaseAt: Date; availableUntil: Date | null },
) {
  const base = input.releaseType === 'COHORT_OFFSET' ? cohortStartsAt : enrolledAt;
  const opensAt =
    override?.releaseAt ??
    (input.releaseType === 'ABSOLUTE'
      ? input.releaseAt
      : input.releaseType === 'IMMEDIATE'
        ? null
        : base
          ? new Date(base.getTime() + (input.releaseOffsetDays ?? 0) * 86400000)
          : null);
  return {
    opensAt,
    closesAt: override ? override.availableUntil : input.availableUntil,
    satisfiable: input.releaseType !== 'COHORT_OFFSET' || cohortStartsAt !== null || !!override,
  };
}
export function isWithinReleaseWindow(window: ReturnType<typeof releaseWindow>, at: Date): boolean {
  return (
    window.satisfiable &&
    (!window.opensAt || at >= window.opensAt) &&
    (!window.closesAt || at < window.closesAt)
  );
}
@Injectable()
export class ContentSupport {
  constructor(
    readonly prisma: PrismaService,
    readonly policy: PolicyService,
    readonly audit: AuditService,
    @Optional()
    @Inject(CONTENT_PUBLICATION_VALIDATOR)
    private readonly publication?: PublicationValidator,
    @Optional() private readonly context?: ContentRequestContext,
  ) {}
  async authorize(actor: Actor, scope: Scope, capability: CourseCapability | 'read' = 'edit') {
    const course = required(
      await this.prisma.course.findFirst({
        where: { id: scope.courseId, workspaceId: scope.workspaceId, deletedAt: null },
      }),
    );
    const allowed =
      capability === 'read'
        ? (
            await Promise.all(
              (['edit', 'grade', 'manageLearners'] as const).map((c) =>
                this.policy.canManageCourse(actor, course, c),
              ),
            )
          ).some(Boolean)
        : await this.policy.canManageCourse(actor, course, capability);
    if (!allowed) throw new NotFoundException();
    return course;
  }
  async mutate<T>(
    actor: Actor,
    scope: Scope,
    action: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    capability: CourseCapability = 'edit',
    requestId?: string,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${scope.workspaceId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "workspaceId"=${scope.workspaceId}::uuid AND "id"=${scope.courseId}::uuid FOR UPDATE`;
        const canonical = await this.authorize(actor, scope, capability);
        const result = await fn(tx);
        if (
          ['PUBLISHED', 'ARCHIVED'].includes(canonical.status) &&
          /^(lesson\.|section\.|outline\.|cohort\.|live_session\.|course\.prerequisites)/.test(
            action,
          )
        ) {
          if (!this.publication)
            throw new ServiceUnavailableException('Content publication validator is not bound');
          await this.publication.validatePublish(tx, scope);
        }
        await this.audit.append(tx, {
          action,
          resourceType: 'Course',
          resourceId: scope.courseId,
          workspaceId: scope.workspaceId,
          actorId: actor.id,
          requestId: this.requestId(requestId),
        });
        return result;
      },
      { timeout: 15000 },
    );
  }
  requestId(explicit?: string) {
    return explicit ?? this.context?.id() ?? randomUUID();
  }
  async lesson(tx: Prisma.TransactionClient, scope: Scope, id: string) {
    return required(
      await tx.lesson.findFirst({
        where: { ...scope, id, deletedAt: null, section: { deletedAt: null } },
      }),
    );
  }
}
/** Authenticated opaque keyset cursors bind the normalized filter and tenant scope. */
@Injectable()
export class ContentPagination {
  private readonly key: string;
  constructor(config: ConfigService) {
    this.key = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
  hash(scope: unknown) {
    return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  }
  decode(
    query: CursorQuery,
    scope: unknown,
    sort: 'createdAt' | 'title' | 'publishedAt' = 'createdAt',
  ) {
    if (!query.cursor) return null;
    try {
      const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString()) as {
        body: string;
        mac: string;
      };
      const expected = createHmac('sha256', this.key).update(decoded.body).digest();
      const actual = Buffer.from(decoded.mac, 'hex');
      if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
        throw new Error();
      const v = cursorPayloadSchema.parse(JSON.parse(decoded.body));
      if (v.filterHash !== this.hash(scope) || v.sort !== sort) throw new Error();
      return v;
    } catch {
      throw new BadRequestException('Invalid or mismatched cursor');
    }
  }
  page<T extends { id: string }>(
    rows: T[],
    query: CursorQuery,
    scope: unknown,
    value: (v: T) => string,
    sort: 'createdAt' | 'title' | 'publishedAt' = 'createdAt',
  ) {
    const data = rows.slice(0, query.limit);
    const last = data.at(-1);
    const more = rows.length > query.limit;
    let nextCursor: string | null = null;
    if (more && last) {
      const body = JSON.stringify({
        revision: 1,
        sort,
        value: value(last),
        id: last.id,
        filterHash: this.hash(scope),
      });
      nextCursor = Buffer.from(
        JSON.stringify({ body, mac: createHmac('sha256', this.key).update(body).digest('hex') }),
      ).toString('base64url');
    }
    return { data, meta: { nextCursor, hasMore: more, limit: query.limit } };
  }
}
