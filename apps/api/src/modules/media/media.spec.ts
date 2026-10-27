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
    await expect(new ClamAvScanner().scan('/nonexistent/lms-test-file')).rejects.toBeInstanceOf(
      MediaRejected,
    );
  });
});
