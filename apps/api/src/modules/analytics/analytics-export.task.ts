import { Injectable } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ReportExport } from '@prisma/client';
import * as c from '@lms/shared';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MediaStorageService } from '../media/media-storage.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReportsService } from './analytics-reports.service';
import { csvRow, DAY, parse } from './analytics.support';

/** Durable PENDING rows are the queue backstop, including if Redis or dispatch loses a wakeup. */
@Injectable()
export class AnalyticsExportTask implements BackgroundTaskHandler<{ operationId?: string }> {
  readonly payloadSchema = z.strictObject({ operationId: z.uuid().optional() });
  readonly name = 'analytics.exports';
  readonly everyMs = 30000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly service: AnalyticsService,
    private readonly reports: AnalyticsReportsService,
    private readonly storage: StorageService,
    private readonly files: MediaStorageService,
  ) {}

  async handle(payload: { operationId?: string } = {}) {
    if (payload.operationId) {
      await this.process(payload.operationId);
      return;
    }
    await this.expire();
    const rows = await this.prisma.reportExport.findMany({
      where: {
        expiresAt: { gt: new Date() },
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', lockedUntil: { lt: new Date() } },
          { status: 'PROCESSING', lockedUntil: null },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 10,
    });
    for (const row of rows) await this.process(row.id);
  }

  async process(id: string) {
    let lease = new Date(Date.now() + 600000);
    const acquired = await this.prisma.reportExport.updateMany({
      where: {
        id,
        expiresAt: { gt: new Date() },
        OR: [
          { status: 'PENDING' },
          { status: 'PROCESSING', lockedUntil: { lt: new Date() } },
          { status: 'PROCESSING', lockedUntil: null },
        ],
      },
      data: {
        status: 'PROCESSING',
        startedAt: new Date(),
        lockedUntil: lease,
        lastError: null,
      },
    });
    if (!acquired.count) return;
    const row = await this.prisma.reportExport.findUniqueOrThrow({ where: { id } });
    const objectKey = `${row.workspaceId}/reports/${row.id}/${randomUUID()}.csv`;
    let directory: string | undefined;
    let assetId: string | undefined;
    try {
      const input = parse(c.exportRequestSchema, { kind: row.kind, parameters: row.parameters });
      const actor = await this.actor(row);
      await this.service.authorizeExport(actor, row.workspaceId, input);
      directory = await mkdtemp(join(tmpdir(), 'lms-report-'));
      const path = join(directory, 'report.csv');
      const file = await open(path, 'wx', 0o600);
      let bytes = 0;
      const digest = createHash('sha256');
      const write = async (value: string) => {
        const buffer = Buffer.from(value);
        bytes += buffer.length;
        if (bytes > 100 * 1024 * 1024) throw new Error('Export exceeds 100 MiB; narrow filters');
        digest.update(buffer);
        await file.writeFile(buffer);
      };
      const renew = async () => {
        const next = new Date(Date.now() + 600000);
        const result = await this.prisma.reportExport.updateMany({
          where: {
            id,
            status: 'PROCESSING',
            lockedUntil: { equals: lease, gt: new Date() },
            expiresAt: { gt: new Date() },
          },
          data: { lockedUntil: next },
        });
        if (!result.count) throw new Error('Export lease lost');
        lease = next;
      };
      try {
        let columns: string[] | undefined;
        const page = async (rows: Record<string, unknown>[], defaults: readonly string[]) => {
          if (!columns) {
            columns = [...defaults];
            await write(csvRow(Object.fromEntries(columns.map((k) => [k, k])), columns));
          }
          for (const result of rows) await write(csvRow(result, columns));
          await renew();
        };
        const p = input.parameters;
        if (input.kind === 'REVENUE')
          await page(await this.reports.revenue(row.workspaceId, p), [
            'currency',
            'paid',
            'refunded',
            'net',
          ]);
        else {
          const scope = { workspaceId: row.workspaceId, courseId: p.courseId! };
          if (input.kind === 'ASSESSMENTS')
            await page(await this.reports.assessments(scope, p), [
              'assessmentId',
              'attempts',
              'passed',
              'awaitingManualGrading',
              'averagePercent',
            ]);
          else if (input.kind === 'PROGRESS')
            await page(await this.reports.daily(scope, p), [
              'courseId',
              'day',
              'newEnrollments',
              'activeLearners',
              'completions',
              'learningSeconds',
              'assessmentSubmissions',
            ]);
          else {
            let cursor: string | undefined;
            do {
              const result = await this.reports.learners(scope, {
                ...p,
                limit: 100,
                ...(cursor ? { cursor } : {}),
              });
              await page(result.data, [
                'enrollmentId',
                'userId',
                'cohortId',
                'completionPercent',
                'lastActivityAt',
                'learningSeconds',
              ]);
              cursor = result.meta.nextCursor ?? undefined;
            } while (cursor);
          }
        }
      } finally {
        await file.close();
      }
      // Permission may have been revoked while pages were being read.
      await this.service.authorizeExport(await this.actor(row), row.workspaceId, input);
      await renew();
      // Persist the object key before uploading so process death cannot create an untracked artifact.
      assetId = await this.prisma.$transaction(async (tx) => {
        const fenced = await tx.reportExport.updateMany({
          where: {
            id,
            status: 'PROCESSING',
            lockedUntil: { equals: lease, gt: new Date() },
            expiresAt: { gt: new Date() },
          },
          data: { lastError: null },
        });
        if (!fenced.count) throw new Error('Export lease lost');
        if (row.assetId)
          await tx.asset.updateMany({
            where: { id: row.assetId, workspaceId: row.workspaceId },
            data: { status: 'DELETED', deletedAt: new Date() },
          });
        const asset = await tx.asset.create({
          data: {
            workspaceId: row.workspaceId,
            uploadedById: row.requestedById,
            objectKey,
            bucket: this.storage.privateBucket,
            filename: `${row.kind.toLowerCase()}-${row.id}.csv`,
            mimeType: 'text/csv',
            sizeBytes: BigInt(bytes),
            sha256: digest.digest('hex'),
            status: 'PENDING_UPLOAD',
            visibility: 'PRIVATE',
            uploadExpiresAt: lease,
            metadata: { reportExportId: id, serverGenerated: true },
          },
        });
        await tx.reportExport.update({ where: { id }, data: { assetId: asset.id } });
        return asset.id;
      });
      await this.files.putFile(objectKey, path, 'text/csv', bytes);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.reportExport.updateMany({
          where: {
            id,
            workspaceId: row.workspaceId,
            status: 'PROCESSING',
            lockedUntil: { equals: lease, gt: new Date() },
            expiresAt: { gt: new Date() },
          },
          data: { status: 'READY', completedAt: new Date(), lockedUntil: null },
        });
        if (!updated.count) throw new Error('Export lease lost');
        await tx.asset.update({
          where: { id: assetId! },
          data: { status: 'READY', verifiedAt: new Date(), uploadExpiresAt: null },
        });
      });
    } catch {
      // Do not persist provider errors, presigned URLs, credentials or report contents.
      await this.prisma.reportExport.updateMany({
        where: { id, status: 'PROCESSING', lockedUntil: { equals: lease, gt: new Date() } },
        data: {
          status: 'FAILED',
          lockedUntil: null,
          lastError: 'Report generation failed. Retry with a new export request.',
        },
      });
      if (assetId) {
        await this.prisma.asset.updateMany({
          where: { id: assetId, workspaceId: row.workspaceId },
          data: { status: 'DELETED', deletedAt: new Date() },
        });
        await this.storage.deleteObject(objectKey);
      }
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
  private async actor(row: ReportExport) {
    const actor = await this.prisma.user.findFirst({
      where: { id: row.requestedById, status: 'ACTIVE', deletedAt: null },
      select: { id: true, platformRole: true },
    });
    if (!actor) throw new Error('Requester inactive');
    return actor;
  }
  async expire() {
    await this.prisma.reportExport.updateMany({
      where: { expiresAt: { lte: new Date() }, status: { not: 'EXPIRED' } },
      data: { status: 'EXPIRED', lockedUntil: null },
    });
    const expired = await this.prisma.reportExport.findMany({
      where: { status: 'EXPIRED', asset: { deletedAt: null } },
      include: { asset: true },
      take: 50,
    });
    for (const row of expired)
      if (row.asset) {
        await this.storage.deleteObject(row.asset.objectKey);
        await this.prisma.asset.updateMany({
          where: { id: row.asset.id, workspaceId: row.workspaceId },
          data: { deletedAt: new Date() },
        });
      }
    await this.prisma.idempotencyRecord.deleteMany({
      where: { route: 'analytics.exports', expiresAt: { lt: new Date(Date.now() - DAY) } },
    });
  }
}
