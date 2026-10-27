import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  computeSha256,
  setSha256HasherFactory,
  type IHasher,
  PureSha256Hasher,
  DEFAULT_CHUNK_SIZE,
} from './hash';

describe('Incremental SHA-256 Hasher (utils/hash.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setSha256HasherFactory(null);
  });

  afterEach(() => {
    setSha256HasherFactory(null);
  });

  describe('Standard FIPS 180-4 Test Vectors', () => {
    it('computes correct hash for empty input', async () => {
      const blob = new Blob([]);
      const hash = await computeSha256(blob);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('computes correct hash for empty ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(0);
      const hash = await computeSha256(buffer);
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('computes correct hash for "hello world"', async () => {
      const blob = new Blob(['hello world'], { type: 'text/plain' });
      const hash = await computeSha256(blob);
      expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    });

    it('computes correct hash for "The quick brown fox jumps over the lazy dog"', async () => {
      const blob = new Blob(['The quick brown fox jumps over the lazy dog']);
      const hash = await computeSha256(blob);
      expect(hash).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
    });

    it('computes identical hash across ArrayBuffer and File inputs', async () => {
      const text = 'LMS media upload streaming test content '.repeat(200);
      const encoder = new TextEncoder();
      const buffer = encoder.encode(text).buffer;
      const file = new File([text], 'lecture.mp4', { type: 'video/mp4' });

      const hashBuffer = await computeSha256(buffer);
      const hashFile = await computeSha256(file);

      expect(hashBuffer).toBe(hashFile);
    });
  });

  describe('Incremental Chunking and Memory Efficiency', () => {
    it('chunks file.slice() correctly with small chunk sizes', async () => {
      const content = '0123456789abcdef'.repeat(100); // 1600 bytes
      const file = new File([content], 'data.bin');
      const progressSteps: number[] = [];

      const hash = await computeSha256(file, {
        chunkSize: 64, // 64 byte chunks
        onProgress: (p) => {
          progressSteps.push(p.percentage);
        },
      });

      // Compare with Web Crypto digest
      const expectedDigest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(content),
      );
      const expectedHash = Array.from(new Uint8Array(expectedDigest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      expect(hash).toBe(expectedHash);
      expect(progressSteps.length).toBe(25); // 1600 / 64 = 25 chunks
      expect(progressSteps[progressSteps.length - 1]).toBe(100);
    });

    it('chunks ArrayBuffer correctly with custom chunk size', async () => {
      const data = new Uint8Array(500);
      for (let i = 0; i < data.length; i++) {
        data[i] = i % 256;
      }

      const progressSteps: number[] = [];
      const hash = await computeSha256(data.buffer, {
        chunkSize: 100,
        onProgress: (p) => {
          progressSteps.push(p.bytesHashed);
        },
      });

      const expectedDigest = await crypto.subtle.digest('SHA-256', data);
      const expectedHash = Array.from(new Uint8Array(expectedDigest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      expect(hash).toBe(expectedHash);
      expect(progressSteps).toEqual([100, 200, 300, 400, 500]);
    });

    it('reports progress properly via onProgress callback', async () => {
      const file = new File(['a'.repeat(300)], 'test.txt');
      const reports: { bytesHashed: number; totalBytes: number; percentage: number }[] = [];

      await computeSha256(file, {
        chunkSize: 100,
        onProgress: (p) => reports.push({ ...p }),
      });

      expect(reports).toEqual([
        { bytesHashed: 100, totalBytes: 300, percentage: 33 },
        { bytesHashed: 200, totalBytes: 300, percentage: 67 },
        { bytesHashed: 300, totalBytes: 300, percentage: 100 },
      ]);
    });
  });

  describe('Cancellation Support (AbortSignal)', () => {
    it('rejects immediately when AbortSignal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort(new Error('User cancelled'));

      const file = new File(['some content'], 'test.mp4');
      await expect(computeSha256(file, { signal: controller.signal })).rejects.toThrow(
        'User cancelled',
      );
    });

    it('aborts midway through chunked hashing when signal is triggered', async () => {
      const controller = new AbortController();
      const largeContent = 'x'.repeat(1000);
      const file = new File([largeContent], 'large.mp4');

      let chunksProcessed = 0;
      const promise = computeSha256(file, {
        chunkSize: 100,
        onProgress: () => {
          chunksProcessed++;
          if (chunksProcessed === 3) {
            controller.abort(new DOMException('Upload aborted by user', 'AbortError'));
          }
        },
        signal: controller.signal,
      });

      await expect(promise).rejects.toThrow('Upload aborted by user');
      expect(chunksProcessed).toBe(3);
    });
  });

  describe('hash-wasm createSHA256 Mockability & Factory Injection', () => {
    it('uses injected hasher factory matching hash-wasm createSHA256 interface', async () => {
      const updateCalls: Uint8Array[] = [];
      const mockHasher: IHasher = {
        blockSize: 64,
        digestSize: 32,
        init: vi.fn().mockReturnThis(),
        update: vi.fn((data: Uint8Array | string) => {
          if (typeof data !== 'string') {
            updateCalls.push(data);
          }
          return mockHasher;
        }),
        digest: vi.fn(() => '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff'),
      };

      const customFactory = vi.fn(async () => mockHasher);
      setSha256HasherFactory(customFactory);

      const file = new File(['mock content bytes'], 'test.mp4');
      const hash = await computeSha256(file, { chunkSize: 8 });

      expect(customFactory).toHaveBeenCalled();
      expect(mockHasher.init).toHaveBeenCalled();
      expect(mockHasher.update).toHaveBeenCalled();
      expect(mockHasher.digest).toHaveBeenCalledWith('hex');
      expect(hash).toBe('1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff');
    });

    it('supports hasherFactory passed directly via options', async () => {
      const mockHasher: IHasher = {
        blockSize: 64,
        digestSize: 32,
        init: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => 'deadbeefcafebabe0000111122223333444455556666777788889999aaaabbbb'),
      };

      const file = new File(['payload'], 'file.bin');
      const hash = await computeSha256(file, {
        hasherFactory: async () => mockHasher,
      });

      expect(mockHasher.init).toHaveBeenCalled();
      expect(hash).toBe('deadbeefcafebabe0000111122223333444455556666777788889999aaaabbbb');
    });
  });

  describe('PureSha256Hasher Unit Tests', () => {
    it('can be re-initialized and reused', () => {
      const hasher = new PureSha256Hasher();
      hasher.update('first run');
      const h1 = hasher.digest('hex');

      hasher.init();
      hasher.update('first run');
      const h2 = hasher.digest('hex');

      expect(h1).toBe(h2);
    });

    it('handles string input in update()', () => {
      const hasher = new PureSha256Hasher();
      hasher.update('hello world');
      expect(hasher.digest('hex')).toBe(
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      );
    });

    it('exports DEFAULT_CHUNK_SIZE as 8 MiB', () => {
      expect(DEFAULT_CHUNK_SIZE).toBe(8 * 1024 * 1024);
    });
  });
});
