import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  assetSchema,
  assetUploadSchema,
  effectiveAccessSchema,
  type AccessPolicy,
  type AssetUpload,
} from '@lms/shared';
import { randomUUID } from 'node:crypto';
import { type Asset } from '@prisma/client';
import {
  ContentSupport,
  required,
  ACCESS_POLICY,
  lessonDto,
  json,
  type Actor,
  type Scope,
} from '../content/content.support';
import { MediaStorageService } from './media-storage.service';
import type { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { signJoin, verifyJoin } from './signed-join';
import type { multipartPartsSchema } from './media.contracts';

export const assetMetadata = (a: Asset): Record<string, unknown> =>
  typeof a.metadata === 'object' && a.metadata !== null && !Array.isArray(a.metadata)
    ? (a.metadata as Record<string, unknown>)
    : {};
export const assetDto = (a: Asset) =>
  assetSchema.parse({
    id: a.id,
    workspaceId: a.workspaceId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes.toString(),
    status: a.status,
    visibility: a.visibility,
    rejectionCode: assetMetadata(a).rejectionCode ?? null,
  });
@Injectable()
export class MediaService {
  constructor(
    private readonly support: ContentSupport,
    private readonly objects: MediaStorageService,
    private readonly config: ConfigService,
    @Optional() @Inject(ACCESS_POLICY) private readonly access?: AccessPolicy,
  ) {}
  async authorizeUpload(
    actor: Actor,
    workspaceId: string,
    input: Pick<AssetUpload, 'purpose' | 'parentId'>,
  ) {
    if (input.purpose === 'SUBMISSION') {
      const attempt = required(
        await this.support.prisma.assessmentAttempt.findFirst({
          where: { id: input.parentId, workspaceId, enrollment: { userId: actor.id } },
        }),
      );
      if (
        attempt.status !== 'IN_PROGRESS' ||
        (attempt.deadlineAt && attempt.deadlineAt <= new Date())
      )
        throw new ConflictException('Attempt is closed');
      const assessment = required(
        await this.support.prisma.assessment.findFirst({
          where: { id: attempt.assessmentId, workspaceId },
        }),
      );
      await this.evaluate(actor, workspaceId, attempt.enrollmentId, assessment.lessonId);
      return;
    }
    if (['COURSE_COVER', 'CERTIFICATE_BACKGROUND'].includes(input.purpose)) {
      await this.support.authorize(actor, { workspaceId, courseId: input.parentId }, 'edit');
      return;
    }
    const lesson = required(
      await this.support.prisma.lesson.findFirst({
        where: { workspaceId, id: input.parentId, deletedAt: null },
      }),
    );
    await this.support.authorize(actor, { workspaceId, courseId: lesson.courseId }, 'edit');
    if (
      (input.purpose === 'PRIMARY_VIDEO' && lesson.type !== 'VIDEO') ||
      (input.purpose === 'PRIMARY_DOCUMENT' && lesson.type !== 'DOCUMENT') ||
      (input.purpose === 'RECORDING' && lesson.type !== 'LIVE_SESSION')
    )
      throw new BadRequestException('Invalid upload purpose');
  }
  async upload(actor: Actor, workspaceId: string, input: AssetUpload, multipart = false) {
    const v = assetUploadSchema.parse(input);
    await this.authorizeUpload(actor, workspaceId, v);
    if (
      (v.purpose === 'PRIMARY_VIDEO' && v.mimeType !== 'video/mp4') ||
      (v.purpose === 'PRIMARY_DOCUMENT' && v.mimeType !== 'application/pdf') ||
      (v.purpose === 'CAPTIONS' && v.mimeType !== 'text/vtt') ||
      (['COURSE_COVER', 'CERTIFICATE_BACKGROUND'].includes(v.purpose) &&
        !v.mimeType.startsWith('image/'))
    )
      throw new BadRequestException('MIME does not match purpose');
    if (multipart && v.mimeType !== 'video/mp4')
      throw new BadRequestException('Multipart is restricted to video');
    const id = randomUUID();
    const key = `quarantine/${workspaceId}/${id}/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + (multipart ? 24 * 3600 * 1000 : 300000));
    const uploadId = multipart ? await this.objects.initiate(key, v.mimeType) : null;
    try {
      const row = await this.support.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${workspaceId}::uuid FOR UPDATE`;
        await this.authorizeUpload(actor, workspaceId, v);
        const pending = await tx.asset.aggregate({
          where: {
            workspaceId,
            deletedAt: null,
            status: { in: ['PENDING_UPLOAD', 'SCANNING', 'READY'] },
          },
          _sum: { sizeBytes: true },
        });
        const quota = BigInt(process.env.CONTENT_WORKSPACE_QUOTA_BYTES ?? '107374182400');
        if ((pending._sum.sizeBytes ?? 0n) + BigInt(v.sizeBytes) > quota)
          throw new ConflictException('Workspace storage quota exceeded');
        return tx.asset.create({
          data: {
            id,
            workspaceId,
            objectKey: key,
            bucket: this.objects.storage.privateBucket,
            uploadedById: actor.id,
            filename: v.filename,
            mimeType: v.mimeType,
            sizeBytes: BigInt(v.sizeBytes),
            sha256: v.sha256,
            uploadExpiresAt: expiresAt,
            metadata: json({
              purpose: v.purpose,
              parentId: v.parentId,
              uploadId,
              uploadMode: multipart ? 'MULTIPART' : 'SINGLE',
            }),
          },
        });
      });
      if (multipart)
        return {
          assetId: row.id,
          uploadId,
          partSizeBytes: 16777216,
          expiresAt: expiresAt.toISOString(),
        };
      return {
        assetId: row.id,
        url: await this.objects.storage.createUploadUrl(key, v.mimeType, 300),
        method: 'PUT' as const,
        headers: { 'Content-Type': v.mimeType },
        expiresAt: expiresAt.toISOString(),
      };
    } catch (e) {
      if (uploadId) await this.objects.abort(key, uploadId).catch(() => undefined);
      throw e;
    }
  }
  async owned(actor: Actor, workspaceId: string, id: string) {
    const a = required(
      await this.support.prisma.asset.findFirst({ where: { workspaceId, id, deletedAt: null } }),
    );
    const m = assetMetadata(a);
    await this.authorizeUpload(actor, workspaceId, {
      purpose: m.purpose as AssetUpload['purpose'],
      parentId: String(m.parentId),
    });
    if (a.uploadedById !== actor.id && m.purpose === 'SUBMISSION') throw new NotFoundException();
    return a;
  }
  async poll(actor: Actor, workspaceId: string, id: string) {
    return assetDto(await this.owned(actor, workspaceId, id));
  }
  async part(actor: Actor, workspaceId: string, id: string, partNumber: number) {
    const a = await this.owned(actor, workspaceId, id);
    this.pendingOwner(actor, a);
    const m = assetMetadata(a);
    if (typeof m.uploadId !== 'string') throw new BadRequestException('Not a multipart upload');
    const max = Math.ceil(Number(a.sizeBytes) / 16777216);
    if (partNumber > max) throw new BadRequestException('Part outside declared size');
    return {
      url: await this.objects.part(a.objectKey, m.uploadId, partNumber),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
  }
  pendingOwner(actor: Actor, a: Asset) {
    if (a.uploadedById !== actor.id) throw new NotFoundException();
    if (a.status !== 'PENDING_UPLOAD' || !a.uploadExpiresAt || a.uploadExpiresAt <= new Date())
      throw new ConflictException('Upload is closed or expired');
  }
  async complete(
    actor: Actor,
    workspaceId: string,
    id: string,
    parts?: z.infer<typeof multipartPartsSchema>,
  ) {
    const a = await this.owned(actor, workspaceId, id);
    if (a.uploadedById !== actor.id) throw new NotFoundException();
    if (['SCANNING', 'READY'].includes(a.status))
      return { operationId: id, status: 'SCANNING' as const };
    this.pendingOwner(actor, a);
    const m = assetMetadata(a);
    if (typeof m.uploadId === 'string') {
      if (!parts) throw new BadRequestException('Multipart parts required');
      if (parts.parts.length !== Math.ceil(Number(a.sizeBytes) / 16777216))
        throw new BadRequestException('Incorrect part count');
      try {
        await this.objects.complete(
          a.objectKey,
          m.uploadId,
          parts.parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        );
      } catch (error) {
        // A retry after successful S3 completion still proceeds to verification; other storage errors are retried by clients.
        if (!(error instanceof Error) || error.name !== 'NoSuchUpload') throw error;
      }
    } else if (parts) throw new BadRequestException('Unexpected multipart parts');
    await this.support.prisma.asset.updateMany({
      where: { id, workspaceId, status: 'PENDING_UPLOAD' },
      data: { status: 'SCANNING' },
    });
    return { operationId: id, status: 'SCANNING' as const };
  }
  async remove(actor: Actor, workspaceId: string, id: string) {
    const a = await this.owned(actor, workspaceId, id);
    return this.support.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Asset" WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${id}::uuid FOR UPDATE`;
      const used = await tx.asset.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              lessonAssets: true,
              coveredCourses: true,
              recordedSessions: true,
              answerAttachments: true,
              backgroundTemplates: true,
              renderedCertificates: true,
              reportExports: true,
            },
          },
        },
      });
      if (used && Object.values(used._count).some((n) => n > 0))
        throw new ConflictException('Referenced assets must be retained');
      await tx.asset.update({ where: { id }, data: { deletedAt: new Date(), status: 'DELETED' } });
      await this.support.audit.append(tx, {
        action: 'asset.deleted',
        resourceType: 'Asset',
        resourceId: id,
        workspaceId,
        actorId: actor.id,
        requestId: this.support.requestId(),
      });
      return assetDto({ ...a, status: 'DELETED' });
    });
  }
  async evaluate(actor: Actor, workspaceId: string, enrollmentId: string, lessonId: string) {
    required(
      await this.support.prisma.enrollment.findFirst({
        where: {
          id: enrollmentId,
          workspaceId,
          userId: actor.id,
          user: { status: 'ACTIVE', deletedAt: null },
          course: { deletedAt: null, workspace: { status: 'ACTIVE', deletedAt: null } },
        },
      }),
    );
    if (!this.access) throw new ServiceUnavailableException('Learning AccessPolicy is not bound');
    const result = effectiveAccessSchema.parse(
      await this.access.evaluate({
        workspaceId,
        userId: actor.id,
        enrollmentId,
        lessonId,
        at: new Date().toISOString(),
      }),
    );
    if (!result.allowed) throw new NotFoundException();
  }
  async ready(workspaceId: string, id: string) {
    return required(
      await this.support.prisma.asset.findFirst({
        where: {
          id,
          workspaceId,
          status: 'READY',
          deletedAt: null,
          verifiedAt: { not: null },
          workspace: { status: 'ACTIVE', deletedAt: null },
        },
      }),
    );
  }
  async capability(a: Asset) {
    return {
      url: await this.objects.download(a.objectKey, a.filename, a.mimeType),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  }
  async learnerDownload(actor: Actor, enrollmentId: string, lessonId: string, assetId: string) {
    const e = await this.support.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId: actor.id },
    });
    if (!e) throw new ForbiddenException('Lesson access denied');
    required(
      await this.support.prisma.lessonAsset.findFirst({
        where: {
          workspaceId: e.workspaceId,
          lessonId,
          assetId,
          lesson: {
            courseId: e.courseId,
            isPublished: true,
            deletedAt: null,
            section: { deletedAt: null },
          },
        },
      }),
    );
    await this.evaluate(actor, e.workspaceId, e.id, lessonId);
    return this.capability(await this.ready(e.workspaceId, assetId));
  }
  async staffDownload(actor: Actor, scope: Scope, lessonId: string, assetId: string) {
    await this.support.authorize(actor, scope, 'read');
    await this.support.lesson(this.support.prisma, scope, lessonId);
    required(
      await this.support.prisma.lessonAsset.findFirst({
        where: { workspaceId: scope.workspaceId, lessonId, assetId },
      }),
    );
    await this.support.audit.record({
      action: 'asset.staff_preview',
      resourceType: 'Asset',
      resourceId: assetId,
      workspaceId: scope.workspaceId,
      actorId: actor.id,
      requestId: this.support.requestId(),
    });
    return this.capability(await this.ready(scope.workspaceId, assetId));
  }
  async previewLesson(courseId: string, lessonId: string) {
    const row = required(
      await this.support.prisma.lesson.findFirst({
        where: {
          id: lessonId,
          courseId,
          isPreview: true,
          isPublished: true,
          deletedAt: null,
          type: { in: ['TEXT', 'VIDEO', 'DOCUMENT', 'INTERACTIVE'] },
          section: { deletedAt: null },
          course: {
            status: 'PUBLISHED',
            visibility: { in: ['PUBLIC', 'UNLISTED'] },
            deletedAt: null,
            workspace: { status: 'ACTIVE', deletedAt: null },
          },
        },
        include: {
          lessonAssets: {
            where: { purpose: { in: ['PRIMARY_VIDEO', 'PRIMARY_DOCUMENT', 'CAPTIONS'] } },
            include: { asset: true },
          },
        },
      }),
    );
    const d = lessonDto(row);
    return {
      lessonId: row.id,
      title: row.title,
      payload: d.payload,
      assets: row.lessonAssets
        .filter((a) => a.asset.status === 'READY' && !a.asset.deletedAt)
        .map((a) => ({
          assetId: a.assetId,
          filename: a.asset.filename,
          mimeType: a.asset.mimeType,
          purpose: a.purpose,
        })),
    };
  }
  async publicDownload(courseId: string, lessonId: string, assetId: string) {
    const l = await this.previewLesson(courseId, lessonId);
    if (!l.assets.some((a) => a.assetId === assetId)) throw new NotFoundException();
    const row = required(await this.support.prisma.lesson.findUnique({ where: { id: lessonId } }));
    return this.capability(await this.ready(row.workspaceId, assetId));
  }
  async attachment(actor: Actor, attemptId: string, assetId: string, workspaceId?: string) {
    const attempt = required(
      await this.support.prisma.assessmentAttempt.findFirst({
        where: {
          id: attemptId,
          ...(workspaceId ? { workspaceId } : { enrollment: { userId: actor.id } }),
        },
        include: { assessment: true },
      }),
    );
    if (workspaceId) {
      await this.support.authorize(actor, { workspaceId, courseId: attempt.courseId }, 'grade');
      await this.support.audit.record({
        action: 'asset.submission_read',
        resourceType: 'Asset',
        resourceId: assetId,
        workspaceId,
        actorId: actor.id,
        requestId: this.support.requestId(),
      });
    }
    required(
      await this.support.prisma.answerAttachment.findFirst({
        where: { workspaceId: attempt.workspaceId, assetId, answer: { attemptId } },
      }),
    );
    return this.capability(await this.ready(attempt.workspaceId, assetId));
  }
  async join(actor: Actor, enrollmentId: string, sessionId: string) {
    const e = required(
      await this.support.prisma.enrollment.findFirst({
        where: { id: enrollmentId, userId: actor.id },
      }),
    );
    const s = required(
      await this.support.prisma.liveSession.findFirst({
        where: {
          id: sessionId,
          workspaceId: e.workspaceId,
          courseId: e.courseId,
          deletedAt: null,
          status: 'SCHEDULED',
        },
      }),
    );
    if (
      (s.cohortId && s.cohortId !== e.cohortId) ||
      new Date() < new Date(s.startsAt.getTime() - 15 * 60000) ||
      new Date() >= s.endsAt
    )
      throw new NotFoundException();
    await this.evaluate(actor, e.workspaceId, e.id, s.lessonId);
    // Provider join URLs cannot expire themselves. Redeem a 60s server capability which rechecks access.
    return signJoin(
      { enrollmentId, sessionId, userId: actor.id },
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      this.config.get<string>('API_PUBLIC_ORIGIN') ?? 'http://localhost:4100',
    );
  }
  async redeemJoin(token: string) {
    const c = verifyJoin(token, this.config.getOrThrow<string>('JWT_ACCESS_SECRET'));
    const u = required(
      await this.support.prisma.user.findFirst({
        where: { id: c.userId, status: 'ACTIVE', deletedAt: null },
      }),
    );
    await this.join(u, c.enrollmentId, c.sessionId);
    return required(
      await this.support.prisma.liveSession.findUnique({ where: { id: c.sessionId } }),
    ).joinUrl;
  }
}
