import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { certificateLayoutSchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import type { EventConsumer, DeliveredEvent } from '../events/event-consumer';
import type { BackgroundTaskHandler } from '../events/background-task';
import type { Prisma } from '@prisma/client';
import { CertificatesService, certificateDto } from './certificates.service';
import { CertificateRenderer } from './certificate-renderer';

@Injectable()
export class CertificateCompletionConsumer implements EventConsumer<'course.completed.v1'> {
  readonly name = 'certificates.completion';
  readonly eventTypes = ['course.completed.v1'] as const;
  constructor(private readonly certificates: CertificatesService) {}
  async handle(event: DeliveredEvent<'course.completed.v1'>, tx: Prisma.TransactionClient) {
    const enrollment = await tx.enrollment.findFirst({
      where: { workspaceId: event.workspaceId, id: event.payload.enrollmentId },
    });
    if (!enrollment?.completedAt) return;
    const template = await tx.certificateTemplate.findFirst({
      where: {
        workspaceId: event.workspaceId,
        courseId: enrollment.courseId,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });
    if (!template) return;
    await this.certificates.issueInTx(
      tx,
      { workspaceId: event.workspaceId, courseId: enrollment.courseId },
      enrollment.id,
      template.id,
      null,
      `event:${event.id}`,
    );
  }
}
const renderSnapshot = z.object({
  layout: certificateLayoutSchema,
  backgroundAssetId: z.uuid().nullable(),
});
@Injectable()
export class CertificateRenderTask implements BackgroundTaskHandler {
  readonly name = 'certificates.render';
  readonly everyMs = 30000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly renderer: CertificateRenderer,
  ) {}
  async handle() {
    // A process can disappear on its final attempt. Surface that terminal state rather than
    // leaving the certificate pending forever; support can explicitly request another render.
    await this.prisma.$executeRaw`
      UPDATE "Certificate" c SET "templateSnapshot"=c."templateSnapshot" || '{"renderFailed":true}'::jsonb,
        "updatedAt"=now()
      FROM "Asset" a WHERE c."documentAssetId" IS NULL
        AND a."objectKey"=('workspaces/' || c."workspaceId"::text || '/certificates/' || c."id"::text || '.pdf')
        AND a."uploadExpiresAt"<=now() AND COALESCE((a."metadata"->>'attempts')::int,0)>=8`;

    const eligible = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT c."id" FROM "Certificate" c
      LEFT JOIN "Asset" a ON a."objectKey" = ('workspaces/' || c."workspaceId"::text || '/certificates/' || c."id"::text || '.pdf')
      WHERE c."documentAssetId" IS NULL
        AND (a."uploadExpiresAt" IS NULL OR a."uploadExpiresAt" <= now())
        AND COALESCE((a."metadata"->>'attempts')::int,0) < 8
      ORDER BY c."createdAt",c."id" LIMIT 20`;
    const pending = await this.prisma.certificate.findMany({
      where: { id: { in: eligible.map((row) => row.id) }, documentAssetId: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const row of pending) {
      // A CAS lease in the deterministic Asset row avoids long transactions and overlapping renders.
      const key = `workspaces/${row.workspaceId}/certificates/${row.id}.pdf`;
      const state = await this.prisma.asset.findUnique({ where: { objectKey: key } });
      if (state?.uploadExpiresAt && state.uploadExpiresAt > new Date()) continue;
      const lease = randomUUID();
      // Generated files have a system actor. Requires the nullable-uploader schema request;
      // raw SQL keeps compatibility with the currently frozen generated Prisma input type.
      await this.prisma.$executeRaw`
        INSERT INTO "Asset" ("id", "workspaceId", "objectKey", "bucket", "filename", "mimeType",
          "sizeBytes", "uploadedById", "status", "visibility", "metadata", "uploadExpiresAt", "createdAt", "updatedAt")
        VALUES (${randomUUID()}::uuid, ${row.workspaceId}::uuid, ${key}, ${this.storage.privateBucket},
          ${`certificate-${row.id}.pdf`}, 'application/pdf', 1, NULL, 'PENDING_UPLOAD', 'PRIVATE', '{}'::jsonb,
          ${new Date(0)}, now(), now()) ON CONFLICT ("objectKey") DO NOTHING`;
      const asset = await this.prisma.asset.findUniqueOrThrow({ where: { objectKey: key } });
      const claimed = await this.prisma.asset.updateMany({
        where: {
          id: asset.id,
          OR: [{ uploadExpiresAt: null }, { uploadExpiresAt: { lte: new Date() } }],
        },
        data: {
          status: 'PENDING_UPLOAD',
          uploadExpiresAt: new Date(Date.now() + 120000),
          metadata: {
            lease,
            attempts: Number((asset.metadata as Prisma.JsonObject).attempts ?? 0) + 1,
          },
        },
      });
      if (!claimed.count) continue;
      try {
        const dto = certificateDto(row),
          frozen = renderSnapshot.parse(row.templateSnapshot);
        let background: { bytes: Buffer; mimeType: 'image/png' | 'image/jpeg' } | undefined;
        if (frozen.backgroundAssetId) {
          const bg = await this.prisma.asset.findFirst({
            where: {
              id: frozen.backgroundAssetId,
              workspaceId: row.workspaceId,
              status: 'READY',
              deletedAt: null,
              bucket: this.storage.privateBucket,
              mimeType: { in: ['image/png', 'image/jpeg'] },
              sizeBytes: { lte: 10 * 1024 * 1024 },
            },
          });
          if (!bg) throw new Error('Background unavailable');
          const response = await fetch(await this.storage.createDownloadUrl(bg.objectKey), {
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw new Error('Background unavailable');
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Background unavailable');
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const chunk = await reader.read();
              if (chunk.done) break;
              size += chunk.value.length;
              if (size > 10 * 1024 * 1024) throw new Error('Background exceeds limit');
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel();
          }
          background = {
            bytes: Buffer.concat(chunks),
            mimeType: bg.mimeType as 'image/png' | 'image/jpeg',
          };
        }
        const bytes = await this.renderer.render({
          layout: frozen.layout,
          recipientName: dto.recipientName,
          courseTitle: dto.courseTitle,
          issuerName: dto.issuerName,
          verificationCode: row.verificationCode,
          issuedAt: row.issuedAt,
          ...(background ? { background } : {}),
        });
        const response = await fetch(await this.storage.createUploadUrl(key, 'application/pdf'), {
          method: 'PUT',
          body: new Uint8Array(bytes),
          headers: { 'content-type': 'application/pdf' },
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error('Certificate upload failed');
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.asset.updateMany({
            where: { id: asset.id, metadata: { path: ['lease'], equals: lease } },
            data: {
              status: 'READY',
              sizeBytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
              verifiedAt: new Date(),
              uploadExpiresAt: null,
              metadata: { generatedBy: 'certificates' },
            },
          });
          if (!updated.count) throw new Error('Render lease lost');
          await tx.certificate.update({
            where: { id: row.id },
            data: { documentAssetId: asset.id },
          });
        });
      } catch {
        await this.prisma.asset.updateMany({
          where: { id: asset.id, metadata: { path: ['lease'], equals: lease } },
          data: { status: 'REJECTED', uploadExpiresAt: new Date(Date.now() + 300000) },
        });
        await this.prisma.certificate.update({
          where: { id: row.id },
          data: {
            templateSnapshot: {
              ...(row.templateSnapshot as Prisma.JsonObject),
              renderFailed: true,
            },
          },
        });
      }
    }
  }
}
