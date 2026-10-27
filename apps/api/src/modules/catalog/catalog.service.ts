import { ConfigService } from '@nestjs/config';
import type { Asset } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  courseSchema,
  courseCreateSchema,
  courseUpdateSchema,
  publicCourseSchema,
  publicCourseDetailSchema,
  type CourseCreate,
  type CourseUpdate,
  type CatalogCoursesQuery,
  type StaffCoursesQuery,
  type CursorQuery,
  type CategoryCreate,
  type CategoryUpdate,
  type CoursePrerequisites,
} from '@lms/shared';
import {
  ContentSupport,
  ContentPagination,
  required,
  json,
  entity,
  assertAcyclic,
  parseInput,
  type Actor,
  type Scope,
} from '../content/content.support';
import { ContentPublicationService } from '../content/publication.service';
import { OutboxService } from '../events/outbox.service';

const dto = (v: unknown) => {
  const record = v as Record<string, unknown>;
  const selected = Object.fromEntries(Object.keys(courseSchema.shape).map((k) => [k, record[k]]));
  return courseSchema.parse(JSON.parse(JSON.stringify(selected)));
};
@Injectable()
export class CatalogService {
  constructor(
    private readonly support: ContentSupport,
    private readonly pages: ContentPagination,
    private readonly outbox: OutboxService,
    @Optional()
    private readonly publication: ContentPublicationService = new ContentPublicationService(),
    @Optional() private readonly config?: ConfigService,
  ) {}
  async listPublic(q: CatalogCoursesQuery) {
    const { cursor: _cursor, limit: _limit, ...filters } = q;
    const key = { public: true, ...filters };
    const c = this.pages.decode(q, key, q.sort);
    const where: Prisma.CourseWhereInput = {
      deletedAt: null,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      workspace: {
        status: 'ACTIVE',
        deletedAt: null,
        ...(q.workspace ? { slug: q.workspace } : {}),
      },
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { summary: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(q.category
        ? { categoryLinks: { some: { category: { slug: q.category, deletedAt: null } } } }
        : {}),
      ...(q.language ? { language: q.language } : {}),
      ...(q.level ? { level: q.level } : {}),
      ...(q.deliveryMode ? { deliveryMode: q.deliveryMode } : {}),
    };
    if (c)
      where.AND = [
        q.sort === 'title'
          ? { OR: [{ title: { gt: c.value } }, { title: c.value, id: { gt: c.id } }] }
          : {
              OR: [
                { publishedAt: { lt: new Date(c.value) } },
                { publishedAt: new Date(c.value), id: { lt: c.id } },
              ],
            },
      ];
    const rows = await this.support.prisma.course.findMany({
      where,
      orderBy:
        q.sort === 'title'
          ? [{ title: 'asc' }, { id: 'asc' }]
          : [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: { cover: true },
    });
    const page = this.pages.page(
      rows,
      q,
      key,
      (r) => (q.sort === 'title' ? r.title : required(r.publishedAt).toISOString()),
      q.sort,
    );
    return { ...page, data: page.data.map((r) => this.publicDto(r)) };
  }
  publicDto(row: unknown) {
    const c = dto(row);
    const {
      createdById: _a,
      archivedAt: _b,
      coverId: _c,
      updatedAt: _d,
      version: _e,
      createdAt: _f,
      ...rest
    } = c;
    const cover = (row as { cover?: Asset | null }).cover;
    const origin =
      this.config?.get<string>('CONTENT_PUBLIC_ORIGIN') ?? process.env.CONTENT_PUBLIC_ORIGIN;
    const publicBucket =
      this.config?.get<string>('S3_PUBLIC_BUCKET') ?? process.env.S3_PUBLIC_BUCKET;
    const coverUrl =
      cover?.visibility === 'PUBLIC' &&
      cover.status === 'READY' &&
      cover.bucket === publicBucket &&
      origin?.startsWith('https://')
        ? new URL(
            '/' + cover.objectKey.split('/').map(encodeURIComponent).join('/'),
            origin,
          ).toString()
        : null;
    return publicCourseSchema.parse({ ...rest, coverUrl });
  }
  async publicCourseBySlug(slug: string, workspace?: string) {
    const matches = await this.support.prisma.course.findMany({
      where: {
        slug,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        deletedAt: null,
        workspace: { status: 'ACTIVE', deletedAt: null, ...(workspace ? { slug: workspace } : {}) },
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length !== 1)
      throw new NotFoundException({
        code: 'COURSE_NOT_FOUND',
        message: 'Course not found; supply its workspace for ambiguous slugs',
      });
    return this.publicCourse(matches[0]!.id);
  }
  async publicCourse(id: string) {
    const row = required(
      await this.support.prisma.course.findFirst({
        where: {
          id,
          status: 'PUBLISHED',
          visibility: { in: ['PUBLIC', 'UNLISTED'] },
          deletedAt: null,
          workspace: { status: 'ACTIVE', deletedAt: null },
        },
        include: { cover: true },
      }),
    );
    const sections = await this.support.prisma.section.findMany({
      where: { workspaceId: row.workspaceId, courseId: id, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        lessons: { where: { deletedAt: null, isPublished: true }, orderBy: { position: 'asc' } },
      },
    });
    const prices = await this.support.prisma.price.findMany({
      where: {
        workspaceId: row.workspaceId,
        isActive: true,
        product: { status: 'ACTIVE', deletedAt: null, productCourses: { some: { courseId: id } } },
      },
    });
    return publicCourseDetailSchema.parse({
      ...this.publicDto(row),
      prices: prices.map((p) => ({
        priceId: p.id,
        productId: p.productId,
        currency: p.currency,
        amount: p.amount,
        interval: p.interval,
        intervalCount: p.intervalCount,
        trialDays: p.trialDays,
      })),
      outline: sections.map((s) => ({
        sectionId: s.id,
        title: s.title,
        position: s.position,
        lessons: s.lessons.map((l) => ({
          lessonId: l.id,
          title: l.title,
          type: l.type,
          position: l.position,
          isPreview: l.isPreview,
          estimatedMinutes: l.estimatedMinutes,
        })),
      })),
    });
  }
  async publicWorkspace(slug: string) {
    const w = required(
      await this.support.prisma.workspace.findFirst({
        where: { slug, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          slug: true,
          name: true,
          kind: true,
          description: true,
          logoUrl: true,
          timezone: true,
        },
      }),
    );
    return w;
  }
  async list(actor: Actor, workspaceId: string, q: StaffCoursesQuery) {
    if (
      !(await this.support.policy.hasWorkspaceRole(actor, workspaceId, [
        'ADMIN',
        'INSTRUCTOR',
        'TEACHING_ASSISTANT',
      ]))
    )
      throw new NotFoundException();
    const admin = await this.support.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN']);
    const key = {
      workspaceId,
      actorId: actor.id,
      status: q.status,
      search: q.search,
      staffId: q.staffId,
    };
    const c = this.pages.decode(q, key);
    const where: Prisma.CourseWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
      AND: [
        ...(!admin
          ? [
              {
                staffAssignments: {
                  some: {
                    userId: actor.id,
                    OR: [
                      { role: 'INSTRUCTOR' as const },
                      { canEditContent: true },
                      { canGrade: true },
                      { canManageLearners: true },
                    ],
                  },
                },
              },
            ]
          : []),
        ...(q.staffId ? [{ staffAssignments: { some: { userId: q.staffId } } }] : []),
        ...(c
          ? [
              {
                OR: [
                  { createdAt: { lt: new Date(c.value) } },
                  { createdAt: new Date(c.value), id: { lt: c.id } },
                ],
              },
            ]
          : []),
      ],
    };
    const rows = await this.support.prisma.course.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const p = this.pages.page(rows, q, key, (r) => r.createdAt.toISOString());
    return { ...p, data: p.data.map(dto) };
  }
  async get(actor: Actor, scope: Scope) {
    return dto(await this.support.authorize(actor, scope, 'read'));
  }
  async create(actor: Actor, workspaceId: string, input: CourseCreate) {
    const v = courseCreateSchema.parse(input);
    return this.support.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${workspaceId}::uuid FOR UPDATE`;
      if (
        !(await this.support.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN', 'INSTRUCTOR']))
      )
        throw new NotFoundException();
      if (v.coverId) throw new BadRequestException('Create the draft before uploading its cover');
      const row = await tx.course.create({
        data: { ...v, description: json(v.description), workspaceId, createdById: actor.id },
      });
      // Super-admin without a tenant membership cannot receive a synthetic course staff assignment.
      const member = await tx.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId: actor.id,
          status: 'ACTIVE',
          deletedAt: null,
          role: { in: ['ADMIN', 'INSTRUCTOR'] },
        },
      });
      if (member)
        await tx.courseStaff.create({
          data: {
            workspaceId,
            courseId: row.id,
            userId: actor.id,
            role: 'INSTRUCTOR',
            canEditContent: true,
            canGrade: true,
            canManageLearners: true,
          },
        });
      await this.support.audit.append(tx, {
        action: 'course.created',
        resourceType: 'Course',
        resourceId: row.id,
        workspaceId,
        actorId: actor.id,
        requestId: this.support.requestId(),
      });
      return dto(row);
    });
  }
  async cover(tx: Prisma.TransactionClient, workspaceId: string, id: string, courseId?: string) {
    const a = required(
      await tx.asset.findFirst({ where: { id, workspaceId, status: 'READY', deletedAt: null } }),
    );
    const m = a.metadata as Record<string, unknown>;
    if (
      m.purpose !== 'COURSE_COVER' ||
      (courseId && m.parentId !== courseId) ||
      !a.mimeType.startsWith('image/')
    )
      throw new BadRequestException('Invalid cover');
  }
  async update(actor: Actor, scope: Scope, input: CourseUpdate) {
    const v = courseUpdateSchema.parse(input);
    return this.support.mutate(
      actor,
      scope,
      'course.updated',
      async (tx) => {
        const old = required(
          await tx.course.findFirst({
            where: { id: scope.courseId, workspaceId: scope.workspaceId },
          }),
        );
        if (old.version !== v.version) throw new ConflictException('Stale course version');
        const { version: _version, ...patch } = v;
        const current = courseCreateSchema.parse(
          Object.fromEntries(
            Object.keys(courseCreateSchema.shape).map((k) => [
              k,
              (dto(old) as Record<string, unknown>)[k],
            ]),
          ),
        );
        const merged = parseInput(courseCreateSchema, { ...current, ...patch });
        if (merged.coverId) await this.cover(tx, scope.workspaceId, merged.coverId, scope.courseId);
        if (
          old.deliveryMode !== merged.deliveryMode &&
          (await tx.enrollment.count({ where: scope }))
        )
          throw new BadRequestException('Delivery mode is retained by enrollments');
        const row = await tx.course.update({
          where: { id: old.id },
          data: { ...merged, description: json(merged.description), version: { increment: 1 } },
        });
        if (old.status === 'PUBLISHED') await this.validatePublish(tx, scope);
        return dto(row);
      },
      'publish',
    );
  }
  async transition(
    actor: Actor,
    scope: Scope,
    action: 'publish' | 'archive' | 'submit-review',
    version: number,
  ) {
    return this.support.mutate(
      actor,
      scope,
      `course.${action}`,
      async (tx) => {
        const c = required(
          await tx.course.findFirst({
            where: { id: scope.courseId, workspaceId: scope.workspaceId },
          }),
        );
        if (c.version !== version) throw new ConflictException('Stale course version');
        if (action === 'publish') {
          if (!['DRAFT', 'IN_REVIEW', 'PUBLISHED'].includes(c.status))
            throw new BadRequestException('Invalid course state');
          await this.validatePublish(tx, scope);
        } else if (action === 'submit-review' && c.status !== 'DRAFT')
          throw new BadRequestException('Only drafts can enter review');
        if (
          (action === 'publish' && c.status === 'PUBLISHED') ||
          (action === 'archive' && c.status === 'ARCHIVED')
        )
          return dto(c);
        const row = await tx.course.update({
          where: { id: c.id },
          data: {
            status:
              action === 'publish' ? 'PUBLISHED' : action === 'archive' ? 'ARCHIVED' : 'IN_REVIEW',
            version: { increment: 1 },
            ...(action === 'publish'
              ? { publishedAt: new Date() }
              : action === 'archive'
                ? { archivedAt: new Date() }
                : {}),
          },
        });
        if (action === 'publish')
          await this.outbox.append(tx, {
            type: 'course.published.v1',
            workspaceId: scope.workspaceId,
            aggregateType: 'Course',
            aggregateId: c.id,
            payload: { courseId: c.id },
          });
        return dto(row);
      },
      'publish',
    );
  }
  async validatePublish(tx: Prisma.TransactionClient, scope: Scope) {
    return this.publication.validatePublish(tx, scope);
  }
  async remove(actor: Actor, scope: Scope) {
    return this.support.mutate(
      actor,
      scope,
      'course.deleted',
      async (tx) => {
        const c = required(
          await tx.course.findFirst({
            where: { id: scope.courseId, workspaceId: scope.workspaceId },
          }),
        );
        if (
          c.status !== 'DRAFT' ||
          (await tx.enrollment.count({ where: scope })) ||
          (await tx.orderItemCourse.count({ where: scope })) ||
          (await tx.coursePrerequisite.count({
            where: { workspaceId: scope.workspaceId, requiredCourseId: scope.courseId },
          }))
        )
          throw new BadRequestException('Retained course must be archived');
        await tx.course.update({
          where: { id: c.id },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
      },
      'publish',
    );
  }
  async categories(actor: Actor, workspaceId: string, q: CursorQuery) {
    if (
      !(await this.support.policy.hasWorkspaceRole(actor, workspaceId, [
        'ADMIN',
        'INSTRUCTOR',
        'TEACHING_ASSISTANT',
        'STUDENT',
      ]))
    )
      throw new NotFoundException();
    const key = { workspaceId, categories: true };
    const c = this.pages.decode(q, key);
    const rows = await this.support.prisma.category.findMany({
      where: {
        workspaceId,
        deletedAt: null,
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
    return { ...p, data: p.data.map(entity) };
  }
  async category(
    actor: Actor,
    workspaceId: string,
    input: CategoryCreate | CategoryUpdate | null,
    id?: string,
  ) {
    return this.support.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${workspaceId}::uuid FOR UPDATE`;
      if (!(await this.support.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])))
        throw new NotFoundException();
      if (id)
        required(await tx.category.findFirst({ where: { workspaceId, id, deletedAt: null } }));
      const row = id
        ? await tx.category.update({ where: { id }, data: input ?? { deletedAt: new Date() } })
        : await tx.category.create({ data: { ...(input as CategoryCreate), workspaceId } });
      return entity(row);
    });
  }
  async setCategories(actor: Actor, scope: Scope, categoryIds: string[]) {
    return this.support.mutate(
      actor,
      scope,
      'course.categories.updated',
      async (tx) => {
        if (
          (await tx.category.count({
            where: { workspaceId: scope.workspaceId, id: { in: categoryIds }, deletedAt: null },
          })) !== categoryIds.length
        )
          throw new BadRequestException('Invalid category');
        await tx.courseCategory.deleteMany({ where: scope });
        await tx.courseCategory.createMany({
          data: categoryIds.map((categoryId) => ({ ...scope, categoryId })),
        });
      },
      'publish',
    );
  }
  async prerequisites(actor: Actor, scope: Scope, v: CoursePrerequisites) {
    return this.support.mutate(
      actor,
      scope,
      'course.prerequisites.updated',
      async (tx) => {
        const ids = v.prerequisites.map((p) => p.requiredCourseId);
        if (
          (await tx.course.count({
            where: { workspaceId: scope.workspaceId, id: { in: ids }, deletedAt: null },
          })) !== ids.length
        )
          throw new BadRequestException('Invalid prerequisite course');
        const current = await tx.coursePrerequisite.findMany({ where: scope });
        const normalize = (items: { requiredCourseId: string; minimumPercent: string }[]) =>
          JSON.stringify(items.map((i) => `${i.requiredCourseId}:${i.minimumPercent}`).sort());
        if (
          (await tx.enrollment.count({ where: scope })) &&
          normalize(
            current.map((i) => ({
              requiredCourseId: i.requiredCourseId,
              minimumPercent: i.minimumPercent.toString(),
            })),
          ) !==
            normalize(
              v.prerequisites.map((i) => ({
                requiredCourseId: i.requiredCourseId,
                minimumPercent: String(i.minimumPercent),
              })),
            )
        )
          throw new ConflictException('Prerequisites are retained by enrollments');
        const edges = await tx.coursePrerequisite.findMany({
          where: { workspaceId: scope.workspaceId, courseId: { not: scope.courseId } },
        });
        assertAcyclic([
          ...edges.map((e) => ({ from: e.courseId, to: e.requiredCourseId })),
          ...ids.map((to) => ({ from: scope.courseId, to })),
        ]);
        await tx.coursePrerequisite.deleteMany({ where: scope });
        await tx.coursePrerequisite.createMany({
          data: v.prerequisites.map((p) => ({ ...scope, ...p })),
        });
      },
      'publish',
    );
  }
}
