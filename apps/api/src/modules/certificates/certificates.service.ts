import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { randomBytes } from 'node:crypto';
import { Prisma, type Certificate, type CertificateTemplate } from '@prisma/client';
import {
  certificateSchema,
  certificateVerificationSchema,
  certificateTemplateSchema,
  type CertificateTemplateCreate,
  type CertificatesQuery,
  type CursorQuery,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { PolicyService, type AuthenticatedUser } from '../../common/authz';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../events/outbox.service';
import { ContentPagination } from '../content/content.support';
import { runIdempotent } from '../learning/learning.support';
import { parseSnapshot } from '../learning/progress-math';
import { AssessmentAttemptsService } from '../assessments/attempts.service';

type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
export type CertificateScope = { workspaceId: string; courseId: string };
const snapshot = (v: Prisma.JsonValue) => v as Record<string, Prisma.JsonValue>;
export function certificateDto(row: Certificate) {
  const recipient = snapshot(row.recipientSnapshot),
    course = snapshot(row.courseSnapshot),
    template = snapshot(row.templateSnapshot);
  return certificateSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    enrollmentId: row.enrollmentId,
    status: row.status,
    verificationCode: row.verificationCode,
    issuedAt: row.issuedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    courseTitle: course.title,
    recipientName: recipient.name,
    issuerName: template.issuerName,
    renderStatus: row.documentAssetId ? 'READY' : template.renderFailed ? 'FAILED' : 'PENDING',
  });
}
export function templateDto(row: CertificateTemplate) {
  const { deletedAt: _deletedAt, ...fields } = row;
  return certificateTemplateSchema.parse({
    ...fields,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export const maskName = (name: string) =>
  name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((s) => `${Array.from(s)[0] ?? ''}***`)
    .join(' ');
@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly storage: StorageService,
    private readonly pagination: ContentPagination,
    private readonly results: AssessmentAttemptsService,
    private readonly notifications: NotificationsService,
  ) {}
  async authorize(actor: Actor, scope: CertificateScope) {
    // publish capability excludes teaching assistants even when they can edit/grade.
    if (
      !(await this.policy.canManageCourse(
        actor,
        { id: scope.courseId, workspaceId: scope.workspaceId },
        'publish',
      ))
    )
      throw new NotFoundException();
  }
  async templates(actor: Actor, scope: CertificateScope, query: CursorQuery) {
    await this.authorize(actor, scope);
    const filter = { ...scope, kind: 'templates' };
    const cursor = this.pagination.decode(query, filter);
    const rows = await this.prisma.certificateTemplate.findMany({
      where: {
        ...scope,
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.value) } },
                { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = this.pagination.page(rows, query, filter, (r) => r.createdAt.toISOString());
    return { ...page, data: page.data.map(templateDto) };
  }
  async createTemplate(
    actor: Actor,
    scope: CertificateScope,
    input: CertificateTemplateCreate,
    requestId: string,
  ) {
    await this.authorize(actor, scope);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "id"=${scope.courseId}::uuid AND "workspaceId"=${scope.workspaceId}::uuid FOR UPDATE`;
      if (
        input.backgroundAssetId &&
        !(await tx.asset.findFirst({
          where: {
            id: input.backgroundAssetId,
            workspaceId: scope.workspaceId,
            status: 'READY',
            deletedAt: null,
            mimeType: { in: ['image/png', 'image/jpeg'] },
            bucket: this.storage.privateBucket,
            visibility: 'PRIVATE',
            sizeBytes: { lte: 10 * 1024 * 1024 },
          },
        }))
      )
        throw new UnprocessableEntityException('Ready tenant PNG/JPEG background required');
      const latest = await tx.certificateTemplate.aggregate({
        where: scope,
        _max: { version: true },
      });
      const row = await tx.certificateTemplate.create({
        data: { ...scope, ...input, layout: input.layout, version: (latest._max.version ?? 0) + 1 },
      });
      await this.audit.append(tx, {
        actorId: actor.id,
        workspaceId: scope.workspaceId,
        action: 'certificate.template.created',
        resourceType: 'CertificateTemplate',
        resourceId: row.id,
        requestId,
      });
      return { data: templateDto(row) };
    });
  }
  async toggle(
    actor: Actor,
    scope: CertificateScope,
    id: string,
    isActive: boolean,
    requestId: string,
  ) {
    await this.authorize(actor, scope);
    return this.prisma.$transaction(async (tx) => {
      if (
        !(
          await tx.certificateTemplate.updateMany({
            where: { ...scope, id, deletedAt: null },
            data: { isActive },
          })
        ).count
      )
        throw new NotFoundException();
      await this.audit.append(tx, {
        actorId: actor.id,
        workspaceId: scope.workspaceId,
        action: 'certificate.template.updated',
        resourceType: 'CertificateTemplate',
        resourceId: id,
        requestId,
        changes: { isActive },
      });
      return {
        data: templateDto(await tx.certificateTemplate.findUniqueOrThrow({ where: { id } })),
      };
    });
  }
  async issue(
    actor: Actor,
    scope: CertificateScope,
    enrollmentId: string,
    templateId: string,
    key: string | undefined,
    requestId: string,
  ) {
    await this.authorize(actor, scope);
    const result = await runIdempotent(
      this.prisma,
      {
        workspaceId: scope.workspaceId,
        userId: actor.id,
        route: `/courses/${scope.courseId}/enrollments/${enrollmentId}/certificate`,
        key,
        body: { templateId },
        status: 202,
      },
      async (tx) => {
        const id = await this.issueInTx(tx, scope, enrollmentId, templateId, actor.id, requestId);
        return { data: { operationId: id, status: 'PENDING' as const } };
      },
    );
    return result.body;
  }
  async issueInTx(
    tx: Prisma.TransactionClient,
    scope: CertificateScope,
    enrollmentId: string,
    templateId: string,
    actorId: string | null,
    requestId: string,
  ): Promise<string> {
    await tx.$queryRaw`SELECT "id" FROM "Enrollment" WHERE "workspaceId"=${scope.workspaceId}::uuid AND "id"=${enrollmentId}::uuid FOR UPDATE`;
    const enrollment = await tx.enrollment.findFirst({
      where: { ...scope, id: enrollmentId },
      include: { user: true, course: true },
    });
    if (!enrollment) throw new NotFoundException();
    const existing = await tx.certificate.findUnique({ where: { enrollmentId } });
    if (existing) return existing.id;
    if (!enrollment.completedAt)
      throw new UnprocessableEntityException('Server-confirmed completion required');
    const policy = parseSnapshot(enrollment.policySnapshot);
    if (!policy || !policy.requiredLessonIds.length)
      throw new UnprocessableEntityException('Completion snapshot required');
    const lessons = await tx.lesson.findMany({
      where: {
        workspaceId: scope.workspaceId,
        courseId: scope.courseId,
        id: { in: policy.requiredLessonIds },
      },
      include: { assessment: true },
    });
    for (const lessonId of policy.requiredLessonIds) {
      const lesson = lessons.find((l) => l.id === lessonId);
      if (!lesson) throw new UnprocessableEntityException('Required lesson missing');
      if (policy.criteria[lessonId]?.rule === 'ASSESSMENT_PASS') {
        if (!lesson.assessment)
          throw new UnprocessableEntityException('Required assessment missing');
        await tx.$queryRaw`SELECT "id" FROM "AssessmentAttempt" WHERE "workspaceId"=${scope.workspaceId}::uuid AND "enrollmentId"=${enrollmentId}::uuid AND "assessmentId"=${lesson.assessment.id}::uuid FOR UPDATE`;
        const result = await this.results.effectiveResult({
          workspaceId: scope.workspaceId,
          assessmentId: lesson.assessment.id,
          enrollmentId,
        });
        if (!result.finalized || !result.passed)
          throw new UnprocessableEntityException('Finalized passing assessment required');
      }
    }
    const template = await tx.certificateTemplate.findFirst({
      where: { ...scope, id: templateId, deletedAt: null, isActive: true },
    });
    if (!template) throw new UnprocessableEntityException('Active same-course template required');
    const row = await tx.certificate.create({
      data: {
        workspaceId: scope.workspaceId,
        enrollmentId,
        templateId,
        verificationCode: randomBytes(32).toString('base64url'),
        recipientSnapshot: { name: enrollment.user.name },
        courseSnapshot: { title: enrollment.course.title, courseId: scope.courseId },
        templateSnapshot: {
          name: template.name,
          issuerName: template.issuerName,
          version: template.version,
          layout: template.layout,
          backgroundAssetId: template.backgroundAssetId,
        },
      },
    });
    await this.audit.append(tx, {
      actorId,
      workspaceId: scope.workspaceId,
      action: 'certificate.issued',
      resourceType: 'Certificate',
      resourceId: row.id,
      requestId,
    });
    await this.outbox.append(tx, {
      workspaceId: scope.workspaceId,
      type: 'certificate.issued.v1',
      aggregateType: 'Certificate',
      aggregateId: row.id,
      payload: { certificateId: row.id },
    });
    return row.id;
  }
  async list(userId: string, query: CertificatesQuery) {
    const { cursor: _cursor, limit: _limit, ...filters } = query;
    const scope = { userId, ...filters };
    const cursor = this.pagination.decode(query, scope);
    const rows = await this.prisma.certificate.findMany({
      where: {
        workspaceId: query.workspaceId,
        status: query.status,
        enrollment: { userId, courseId: query.courseId },
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.value) } },
                { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = this.pagination.page(rows, query, scope, (r) => r.createdAt.toISOString());
    return { ...page, data: page.data.map(certificateDto) };
  }
  async own(userId: string, id: string) {
    const row = await this.prisma.certificate.findFirst({ where: { id, enrollment: { userId } } });
    if (!row) throw new NotFoundException();
    return row;
  }
  async download(userId: string, id: string) {
    const row = await this.own(userId, id);
    const asset = row.documentAssetId
      ? await this.prisma.asset.findFirst({
          where: {
            id: row.documentAssetId,
            workspaceId: row.workspaceId,
            status: 'READY',
            visibility: 'PRIVATE',
            deletedAt: null,
            bucket: this.storage.privateBucket,
          },
        })
      : null;
    if (!asset) throw new ConflictException('Certificate rendering is not ready');
    await this.audit.record({
      actorId: userId,
      workspaceId: row.workspaceId,
      action: 'certificate.download',
      resourceType: 'Certificate',
      resourceId: id,
      requestId: `certificate-download:${id}`,
    });
    return {
      data: {
        url: await this.storage.createDownloadUrl(asset.objectKey, 300),
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      },
    };
  }
  async verify(code: string) {
    const row = await this.prisma.certificate.findUnique({ where: { verificationCode: code } });
    if (!row) throw new NotFoundException();
    const dto = certificateDto(row);
    return {
      data: certificateVerificationSchema.parse({
        status: dto.status,
        courseTitle: dto.courseTitle,
        issuerName: dto.issuerName,
        issuedAt: dto.issuedAt,
        maskedRecipientName: maskName(dto.recipientName),
      }),
    };
  }
  /** Internal audited command for support/recovery. Reuses the certificate identity and verification
   * code. Object storage versioning (deployment requirement) retains prior generated bytes. */
  async requestRender(
    actor: Actor,
    scope: CertificateScope,
    id: string,
    key: string | undefined,
    requestId: string,
  ) {
    await this.authorize(actor, scope);
    const result = await runIdempotent(
      this.prisma,
      {
        workspaceId: scope.workspaceId,
        userId: actor.id,
        route: `/courses/${scope.courseId}/certificates/${id}/render`,
        key,
        body: {},
        status: 202,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Certificate" WHERE "workspaceId"=${scope.workspaceId}::uuid AND "id"=${id}::uuid FOR UPDATE`;
        const row = await tx.certificate.findFirst({
          where: { id, workspaceId: scope.workspaceId, enrollment: { courseId: scope.courseId } },
        });
        if (!row) throw new NotFoundException();
        const objectKey = `workspaces/${scope.workspaceId}/certificates/${id}.pdf`;
        const asset = await tx.asset.findUnique({ where: { objectKey } });
        if (
          asset?.status !== 'REJECTED' &&
          asset?.uploadExpiresAt &&
          asset.uploadExpiresAt > new Date()
        )
          throw new ConflictException('Certificate rendering is already running');
        if (asset)
          await tx.asset.update({
            where: { id: asset.id },
            data: {
              uploadExpiresAt: new Date(0),
              metadata: { attempts: 0 },
              status: 'PENDING_UPLOAD',
            },
          });
        const frozen = snapshot(row.templateSnapshot);
        const { renderFailed: _failed, ...template } = frozen;
        await tx.certificate.update({
          where: { id },
          data: { documentAssetId: null, templateSnapshot: template },
        });
        await this.audit.append(tx, {
          actorId: actor.id,
          workspaceId: scope.workspaceId,
          action: 'certificate.render.requested',
          resourceType: 'Certificate',
          resourceId: id,
          requestId,
          changes: {
            priorDocumentAssetId: row.documentAssetId,
            priorSha256: asset?.sha256 ?? null,
          },
        });
        return { data: { operationId: id, status: 'PENDING' as const } };
      },
    );
    return result.body;
  }
  async revoke(
    actor: Actor,
    scope: CertificateScope,
    id: string,
    reason: string,
    requestId: string,
  ) {
    await this.authorize(actor, scope);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.certificate.findFirst({
        where: { workspaceId: scope.workspaceId, id, enrollment: { courseId: scope.courseId } },
        include: { enrollment: true },
      });
      if (!row) throw new NotFoundException();
      const changed = await tx.certificate.updateMany({
        where: { id, status: 'VALID' },
        data: { status: 'REVOKED', revokedAt: new Date(), revocationReason: reason },
      });
      if (changed.count) {
        await this.audit.append(tx, {
          actorId: actor.id,
          workspaceId: scope.workspaceId,
          action: 'certificate.revoked',
          resourceType: 'Certificate',
          resourceId: id,
          requestId,
          changes: { reason },
        });
        // Existing contract has no revoked type; keep the notification vocabulary and a safe message.
        await this.notifications.create(tx, {
          workspaceId: scope.workspaceId,
          userId: row.enrollment.userId,
          dedupeKey: `certificate-revoked:${id}`,
          type: 'certificate.revoked',
          title: 'Certificate status changed',
          body: 'Your certificate has been revoked. Contact the issuer for details.',
          data: { certificateId: id, path: '/student/certificates' },
        });
      }
      return { data: certificateDto(await tx.certificate.findUniqueOrThrow({ where: { id } })) };
    });
  }
}
