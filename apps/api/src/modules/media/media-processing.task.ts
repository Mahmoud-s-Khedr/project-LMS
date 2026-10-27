import { Injectable, Inject, Optional } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { json } from '../content/content.support';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MediaStorageService, MediaRejected, sniffMime } from './media-storage.service';
import { assetMetadata } from './media.service';
import type { BackgroundTaskHandler } from '../events/background-task';

const run = promisify(execFile);
export const MEDIA_TOOL_RUNNER = Symbol.for('lms.media.ToolRunner');
export type MediaToolRunner = (
  command: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string }>;
export const MEDIA_SCANNER = Symbol.for('lms.media.MalwareScanner');
export interface MalwareScanner {
  scan(path: string): Promise<'CLEAN' | 'INFECTED'>;
}
/** Default scanner fails closed if clamscan/its signature database is unavailable. */
@Injectable()
export class ClamAvScanner implements MalwareScanner {
  async scan(path: string): Promise<'CLEAN' | 'INFECTED'> {
    try {
      await run('clamscan', ['--no-summary', '--', path], { timeout: 20 * 60000, maxBuffer: 4096 });
      return 'CLEAN';
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === '1' || (e as { code?: number }).code === 1)
        return 'INFECTED';
      throw new MediaRejected('SCAN_FAILED');
    }
  }
}
/** BullMQ periodic backstop: durable SCANNING rows recover even when Redis loses all queued jobs. */
@Injectable()
export class MediaProcessingTask implements BackgroundTaskHandler {
  readonly name = 'media.process';
  readonly everyMs = 10000;
  readonly maxAttempts = 5;
  constructor(
    private readonly prisma: PrismaService,
    private readonly objects: MediaStorageService,
    @Optional()
    @Inject(MEDIA_SCANNER)
    private readonly scanner: MalwareScanner = new ClamAvScanner(),
    @Optional() @Inject(MEDIA_TOOL_RUNNER) private readonly execute: MediaToolRunner = run,
  ) {}
  async handle(): Promise<void> {
    const rows = await this.prisma.$queryRaw<
      { id: string; workspaceId: string }[]
    >`SELECT "id","workspaceId" FROM "Asset" WHERE "status"='SCANNING' AND "deletedAt" IS NULL AND (("metadata"->>'leaseUntil') IS NULL OR ("metadata"->>'leaseUntil')::timestamptz<=now()) ORDER BY "createdAt" LIMIT 10`;
    for (const a of rows) await this.process(a.id, a.workspaceId);
    await this.cleanup();
  }
  async process(id: string, workspaceId: string) {
    const a = await this.prisma.asset.findFirst({
      where: { id, workspaceId, status: 'SCANNING', deletedAt: null },
    });
    if (!a) return;
    const metadata = assetMetadata(a);
    if (typeof metadata.leaseUntil === 'string' && Date.parse(metadata.leaseUntil) > Date.now())
      return;
    const lease = randomUUID();
    const claimed = await this.prisma.asset.updateMany({
      where: { id, workspaceId, status: 'SCANNING', updatedAt: a.updatedAt },
      data: {
        metadata: json({
          ...metadata,
          lease,
          leaseUntil: new Date(Date.now() + 120 * 60000).toISOString(),
        }),
      },
    });
    if (!claimed.count) return;
    const dir = await mkdtemp(join(tmpdir(), 'lms-media-'));
    const path = join(dir, 'source');
    let verifiedKey: string | undefined;
    try {
      const verified = await this.objects.fetchVerified(a.objectKey, path, a.sizeBytes);
      if (verified.sha256 !== a.sha256) throw new MediaRejected('CHECKSUM_MISMATCH');
      if (verified.contentType !== a.mimeType || !sniffMime(verified.prefix, a.mimeType))
        throw new MediaRejected('MIME_MISMATCH');
      if ((await this.scanner.scan(path)) !== 'CLEAN') throw new MediaRejected('MALWARE');
      // Upload a new immutable key from the exact verified file. The browser never receives a PUT for this key.
      verifiedKey = `verified/${workspaceId}/${id}/${randomUUID()}`;
      await this.objects.putFile(verifiedKey, path, a.mimeType, Number(a.sizeBytes));
      let processing: Record<string, unknown> = { mode: 'SOURCE_ONLY' };
      if (a.mimeType === 'video/mp4')
        processing = await this.probeVideo(path, dir, workspaceId, id);
      const latest = await this.prisma.asset.findUnique({ where: { id } });
      if (!latest || latest.status !== 'SCANNING' || assetMetadata(latest).lease !== lease) {
        await this.objects.storage.deleteObject(verifiedKey);
        return;
      }
      const promoted = await this.prisma.asset.updateMany({
        where: { id, workspaceId, status: 'SCANNING', updatedAt: latest.updatedAt },
        data: {
          objectKey: verifiedKey,
          status: 'READY',
          verifiedAt: new Date(),
          metadata: json({ ...metadata, scan: 'CLEAN', processing }),
        },
      });
      if (!promoted.count) await this.objects.storage.deleteObject(verifiedKey);
      await this.objects.storage.deleteObject(a.objectKey).catch(() => undefined);
    } catch (e) {
      if (verifiedKey) await this.objects.storage.deleteObject(verifiedKey).catch(() => undefined);
      const code = e instanceof MediaRejected ? e.code : 'SCAN_FAILED';
      const current = await this.prisma.asset.findUnique({ where: { id } });
      if (current?.status === 'SCANNING' && assetMetadata(current).lease === lease)
        await this.prisma.asset.updateMany({
          where: { id, workspaceId, status: 'SCANNING', updatedAt: current.updatedAt },
          data: { status: 'REJECTED', metadata: json({ ...metadata, rejectionCode: code }) },
        });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  async probeVideo(path: string, dir: string, workspaceId: string, id: string) {
    try {
      await this.execute('ffmpeg', ['-version'], { timeout: 5000, maxBuffer: 8192 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { mode: 'SOURCE_ONLY' };
      throw e;
    }
    const probe = await this.execute(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-show_entries',
        'format=duration:stream=codec_type',
        '-of',
        'json',
        path,
      ],
      { timeout: 30000, maxBuffer: 65536 },
    );
    const info = JSON.parse(probe.stdout) as {
      format?: { duration?: string };
      streams?: { codec_type?: string }[];
    };
    if (!info.streams?.some((s) => s.codec_type === 'video'))
      throw new MediaRejected('MIME_MISMATCH');
    const thumbnail = join(dir, 'thumbnail.jpg');
    await this.execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        path,
        '-frames:v',
        '1',
        '-vf',
        'scale=640:-2',
        thumbnail,
      ],
      { timeout: 60000, maxBuffer: 65536 },
    );
    const key = `derived/${workspaceId}/${id}/thumbnail.jpg`;
    await this.objects.putFile(key, thumbnail, 'image/jpeg', (await stat(thumbnail)).size);
    // Private progressive MP4 is the initial delivery format. No HLS manifest is exposed without a segment gateway.
    const playlist = join(dir, 'stream.m3u8');
    await this.execute(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        path,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-vf',
        'scale=w=1280:h=720:force_original_aspect_ratio=decrease',
        '-c:a',
        'aac',
        '-f',
        'hls',
        '-hls_time',
        '6',
        '-hls_playlist_type',
        'vod',
        '-hls_segment_filename',
        join(dir, 'segment-%06d.ts'),
        playlist,
      ],
      { timeout: 30 * 60000, maxBuffer: 65536 },
    );
    const hlsKeys: string[] = [];
    try {
      for (const file of await readdir(dir)) {
        if (!/^segment-\d{6}\.ts$/.test(file) && file !== 'stream.m3u8') continue;
        const objectKey = `derived/${workspaceId}/${id}/${file}`;
        await this.objects.putFile(
          objectKey,
          join(dir, file),
          file.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
          (await stat(join(dir, file))).size,
        );
        hlsKeys.push(objectKey);
      }
    } catch (error) {
      for (const objectKey of hlsKeys) await this.objects.storage.deleteObject(objectKey);
      await this.objects.storage.deleteObject(key);
      throw error;
    }
    return {
      mode: 'PROGRESSIVE',
      durationSeconds: Number(info.format?.duration ?? 0),
      thumbnailKey: key,
      hlsKeys,
      hlsDelivery: 'PRIVATE_NOT_EXPOSED',
    };
  }
  async cleanup() {
    const rows = await this.prisma.$queryRaw<
      import('@prisma/client').Asset[]
    >`SELECT * FROM "Asset" WHERE ("metadata"->>'cleanedAt') IS NULL AND (("status"='PENDING_UPLOAD' AND "uploadExpiresAt"<now()) OR "status" IN ('DELETED','REJECTED')) ORDER BY "createdAt" LIMIT 25`;
    for (const a of rows) {
      const m = assetMetadata(a);
      if (m.cleanedAt) continue;
      if (typeof m.uploadId === 'string')
        await this.objects.abort(a.objectKey, m.uploadId).catch(() => undefined);
      if (a.bucket === this.objects.storage.publicBucket)
        await this.objects.deletePublicVariant(a.objectKey);
      else await this.objects.storage.deleteObject(a.objectKey);
      if (typeof m.publicVariantKey === 'string')
        await this.objects.deletePublicVariant(m.publicVariantKey);
      const processing = m.processing as { thumbnailKey?: string; hlsKeys?: string[] } | undefined;
      for (const key of [processing?.thumbnailKey, ...(processing?.hlsKeys ?? [])])
        if (key) await this.objects.storage.deleteObject(key);
      await this.prisma.asset.updateMany({
        where: { id: a.id, workspaceId: a.workspaceId, updatedAt: a.updatedAt },
        data: {
          status: a.status === 'PENDING_UPLOAD' ? 'DELETED' : a.status,
          metadata: json({ ...m, cleanedAt: new Date().toISOString() }),
        },
      });
    }
  }
}
