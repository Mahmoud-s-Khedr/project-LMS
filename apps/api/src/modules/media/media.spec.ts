import { randomUUID } from 'node:crypto';
import { sniffMime, MediaRejected } from './media-storage.service';
import { signJoin, verifyJoin } from './signed-join';
import { multipartPartsSchema } from './media.contracts';
import { ClamAvScanner, MediaProcessingTask } from './media-processing.task';
describe('Media security primitives', () => {
  it('checks file magic instead of trusting content type or extension', () => {
    expect(sniffMime(Buffer.from('%PDF-1.7\n'), 'application/pdf')).toBe(true);
    expect(sniffMime(Buffer.from('<html>payload'), 'application/pdf')).toBe(false);
    expect(sniffMime(Buffer.from('<svg onload=evil>'), 'text/plain')).toBe(false);
    expect(sniffMime(Buffer.from('WEBVTT\n'), 'text/vtt')).toBe(true);
    expect(sniffMime(Buffer.from('html'), 'video/mp4')).toBe(false);
    expect(sniffMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(true);
  });
  it('join capabilities expire at exactly 60 seconds and cannot be altered', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      const ids = { userId: randomUUID(), sessionId: randomUUID(), enrollmentId: randomUUID() };
      const result = signJoin(ids, 'secret', 'https://api.example.test');
      const token = new URL(result.url).searchParams.get('capability')!;
      expect(verifyJoin(token, 'secret')).toMatchObject(ids);
      expect(() => verifyJoin(token, 'other')).toThrow();
      jest.advanceTimersByTime(60000);
      expect(() => verifyJoin(token, 'secret')).toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
  it('requires ordered contiguous unique multipart part numbers', () => {
    const part = { partNumber: 1, etag: '0123456789abcdef0123456789abcdef' };
    expect(multipartPartsSchema.safeParse({ parts: [part] }).success).toBe(true);
    expect(multipartPartsSchema.safeParse({ parts: [part, part] }).success).toBe(false);
    expect(multipartPartsSchema.safeParse({ parts: [{ ...part, partNumber: 2 }] }).success).toBe(
      false,
    );
  });
  it('keeps verified video source-only playable when ffmpeg is unavailable', async () => {
    const task = new MediaProcessingTask({} as never, {} as never, undefined, async () => {
      throw Object.assign(new Error('missing executable'), { code: 'ENOENT' });
    });
    await expect(
      task.probeVideo('/unused', '/unused', randomUUID(), randomUUID()),
    ).resolves.toEqual({ mode: 'SOURCE_ONLY' });
  });
  it('default malware scanner fails closed when a file cannot be scanned', async () => {
    await expect(new ClamAvScanner().scan('/nonexistent/lms-test-file')).rejects.not.toBeInstanceOf(
      MediaRejected,
    );
  });
  it('retries transient scan errors and permanently rejects invalid files', async () => {
    for (const [error, attempts, status] of [
      [new Error('offline'), 0, undefined],
      [new Error('offline'), 7, 'REJECTED'],
      [new MediaRejected('MALWARE'), 0, 'REJECTED'],
    ] as const) {
      const asset = {
        id: 'asset',
        workspaceId: 'workspace',
        updatedAt: new Date(),
        metadata: { scanAttempts: attempts },
        objectKey: 'key',
        sizeBytes: 1n,
      };
      let lease = '';
      const updateMany = jest.fn(async ({ data }: { data: { metadata: unknown } }) => {
        lease = (data.metadata as { lease?: string }).lease ?? lease;
        return { count: 1 };
      });
      const prisma = {
        asset: {
          findFirst: jest.fn().mockResolvedValue(asset),
          findUnique: jest.fn(async () => ({ ...asset, status: 'SCANNING', metadata: { lease } })),
          updateMany,
        },
      };
      const objects = {
        fetchVerified: jest.fn().mockRejectedValue(error),
        storage: { deleteObject: jest.fn() },
      };
      await new MediaProcessingTask(prisma as never, objects as never).process(
        'asset',
        'workspace',
      );
      const final = updateMany.mock.calls[1]![0].data as {
        status?: string;
        metadata: Record<string, unknown>;
      };
      expect(final.status).toBe(status);
      expect(final.metadata.scanAttempts).toBe(attempts + 1);
      if (!status)
        expect(final.metadata).toMatchObject({
          lastErrorCode: 'SCAN_FAILED',
          leaseUntil: expect.any(String),
        });
      else
        expect(final.metadata.rejectionCode).toBe(
          error instanceof MediaRejected ? 'MALWARE' : 'SCAN_FAILED',
        );
    }
  });
});

it('honors the configured S3 addressing style', async () => {
  const { ConfigService } = await import('@nestjs/config');
  const { MediaStorageService } = await import('./media-storage.service');
  for (const value of [true, false]) {
    const config = new ConfigService({
      S3_ENDPOINT: 'http://localhost:59000',
      S3_REGION: 'us-east-1',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'password',
      S3_FORCE_PATH_STYLE: value,
    });
    const service = new MediaStorageService(config, {} as never);
    try {
      const client = (service as unknown as { client: { config: { forcePathStyle: boolean } } })
        .client;
      expect(client.config.forcePathStyle).toBe(value);
    } finally {
      service.onModuleDestroy();
    }
  }
});
