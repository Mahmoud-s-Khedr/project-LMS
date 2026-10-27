import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaStorageService } from './media-storage.service';
import { assetMetadata } from './media.service';
import { json } from '../content/content.support';
import type { BackgroundTaskHandler } from '../events/background-task';
/** Deliberate public Asset variant made only for the current cover of a published course. */
@Injectable()
export class PublicCoverTask implements BackgroundTaskHandler {
  readonly name = 'media.publish-covers';
  readonly everyMs = 60000;
  readonly maxAttempts = 5;
  private lastCourseId: string | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: MediaStorageService,
    private readonly audit: AuditService,
  ) {}
  async handle() {
    const rows = await this.prisma.course.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        coverId: { not: null },
        workspace: { status: 'ACTIVE', deletedAt: null },
        cover: { status: 'READY', deletedAt: null, visibility: 'PRIVATE' },
        ...(this.lastCourseId ? { id: { gt: this.lastCourseId } } : {}),
      },
      select: { id: true, workspaceId: true, coverId: true },
      orderBy: { id: 'asc' },
      take: 25,
    });
    this.lastCourseId = rows.at(-1)?.id ?? null;
    let failed = false;
    for (const row of rows)
      if (row.coverId) {
        try {
          await this.process(row.workspaceId, row.id, row.coverId);
        } catch {
          failed = true;
        }
      }
    if (failed) throw new Error('Cover publication batch incomplete');
  }
  async process(workspaceId: string, courseId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id: assetId,
        workspaceId,
        status: 'READY',
        deletedAt: null,
        visibility: 'PRIVATE',
        coveredCourses: { some: { id: courseId, status: 'PUBLISHED', deletedAt: null } },
      },
    });
    if (!asset) return;
    const meta = assetMetadata(asset);
    if (
      meta.purpose !== 'COURSE_COVER' ||
      meta.parentId !== courseId ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(asset.mimeType) ||
      !asset.verifiedAt ||
      !asset.sha256
    )
      return;
    const extension =
      asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/jpeg' ? 'jpg' : 'webp';
    const variantId = randomUUID();
    const key = `marketing/${workspaceId}/${assetId}/${variantId}.${extension}`;
    await this.objects.publishPublicVariant(asset.objectKey, key, asset.mimeType);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Course" WHERE "workspaceId"=${workspaceId}::uuid AND "id"=${courseId}::uuid FOR UPDATE`;
        const course = await tx.course.findFirst({
          where: {
            workspaceId,
            id: courseId,
            status: 'PUBLISHED',
            deletedAt: null,
            coverId: assetId,
            workspace: { status: 'ACTIVE', deletedAt: null },
          },
        });
        if (!course) return false;
        await tx.asset.create({
          data: {
            id: variantId,
            workspaceId,
            objectKey: key,
            bucket: this.objects.storage.publicBucket,
            filename: asset.filename,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
            sha256: asset.sha256,
            status: 'READY',
            visibility: 'PUBLIC',
            verifiedAt: asset.verifiedAt,
            uploadedById: asset.uploadedById,
            metadata: json({ purpose: 'COURSE_COVER', parentId: courseId, variantOfId: asset.id }),
          },
        });
        await tx.course.update({
          where: { id: courseId },
          data: { coverId: variantId, version: { increment: 1 } },
        });
        await this.audit.append(tx, {
          action: 'asset.cover_variant.published',
          resourceType: 'Asset',
          resourceId: variantId,
          workspaceId,
          actorId: null,
          requestId: `cover-${courseId}`,
          changes: { sourceAssetId: assetId, courseId },
        });
        return true;
      });
      if (!updated) await this.objects.deletePublicVariant(key);
    } catch (error) {
      await this.objects.deletePublicVariant(key).catch(() => undefined);
      throw error;
    }
  }
}
