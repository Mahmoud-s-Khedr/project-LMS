/**
 * Incremental SHA-256 hash computation for File, Blob, and ArrayBuffer.
 *
 * Reads inputs incrementally in 8 MiB chunks using file.slice() to avoid
 * memory exhaustion on multi-GB media uploads. Supports Web Worker execution
 * off the main thread with automatic fallback to cooperative main-thread yielding,
 * live progress reporting, and cancellation via AbortSignal.
 *
 * Integrates with hash-wasm (via createSHA256) when installed or mocked, with a
 * zero-dependency pure TypeScript FIPS 180-4 SHA-256 fallback when hash-wasm
 * is not yet installed.
 */

export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

export interface IHasher {
  init(): IHasher;
  update(data: Uint8Array | string): IHasher;
  digest(outputType?: 'hex' | 'binary'): string;
  save?(): unknown;
  load?(state: unknown): IHasher;
  blockSize: number;
  digestSize: number;
}

export interface ComputeSha256Progress {
  bytesHashed: number;
  totalBytes: number;
  percentage: number;
}

export interface ComputeSha256Options {
  /**
   * Chunk size in bytes for incremental slicing. Defaults to 8 MiB (8,388,608 bytes).
   */
  chunkSize?: number;

  /**
   * Optional callback invoked after each chunk is hashed.
   */
  onProgress?: (progress: ComputeSha256Progress) => void;

  /**
   * Optional AbortSignal to cancel hash computation.
   */
  signal?: AbortSignal;

  /**
   * Optional hasher factory override (e.g. hash-wasm createSHA256 mock).
   */
  hasherFactory?: () => Promise<IHasher>;

  /**
   * Whether to prefer running off the main thread in a Web Worker if available.
   * Defaults to true in browser environments.
   */
  preferWorker?: boolean;
}

// ============================================================================
// Pure TypeScript FIPS 180-4 SHA-256 Hasher (fallback when hash-wasm not present)
// ============================================================================

const INITIAL_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(n: number, b: number): number {
  return (n >>> b) | (n << (32 - b));
}

export class PureSha256Hasher implements IHasher {
  private H = new Uint32Array(8);
  private buffer = new Uint8Array(64);
  private bufferLength = 0;
  private totalBytes = 0n;
  private W = new Uint32Array(64);
  readonly blockSize = 64;
  readonly digestSize = 32;

  constructor() {
    this.init();
  }

  init(): this {
    this.H.set(INITIAL_H);
    this.buffer.fill(0);
    this.bufferLength = 0;
    this.totalBytes = 0n;
    return this;
  }

  private processBlock(block: Uint8Array, offset: number): void {
    const W = this.W;
    for (let i = 0; i < 16; i++) {
      const o = offset + i * 4;
      W[i] =
        (((block[o] ?? 0) << 24) |
          ((block[o + 1] ?? 0) << 16) |
          ((block[o + 2] ?? 0) << 8) |
          (block[o + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15] ?? 0, 7) ^ rotr(W[i - 15] ?? 0, 18) ^ ((W[i - 15] ?? 0) >>> 3);
      const s1 = rotr(W[i - 2] ?? 0, 17) ^ rotr(W[i - 2] ?? 0, 19) ^ ((W[i - 2] ?? 0) >>> 10);
      W[i] = ((W[i - 16] ?? 0) + s0 + (W[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = this.H[0] ?? 0;
    let b = this.H[1] ?? 0;
    let c = this.H[2] ?? 0;
    let d = this.H[3] ?? 0;
    let e = this.H[4] ?? 0;
    let f = this.H[5] ?? 0;
    let g = this.H[6] ?? 0;
    let h = this.H[7] ?? 0;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + (K[i] ?? 0) + (W[i] ?? 0)) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.H[0] = ((this.H[0] ?? 0) + a) >>> 0;
    this.H[1] = ((this.H[1] ?? 0) + b) >>> 0;
    this.H[2] = ((this.H[2] ?? 0) + c) >>> 0;
    this.H[3] = ((this.H[3] ?? 0) + d) >>> 0;
    this.H[4] = ((this.H[4] ?? 0) + e) >>> 0;
    this.H[5] = ((this.H[5] ?? 0) + f) >>> 0;
    this.H[6] = ((this.H[6] ?? 0) + g) >>> 0;
    this.H[7] = ((this.H[7] ?? 0) + h) >>> 0;
  }

  update(data: Uint8Array | string): this {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    let offset = 0;
    let remaining = bytes.length;
    this.totalBytes += BigInt(bytes.length);

    if (this.bufferLength > 0) {
      const needed = 64 - this.bufferLength;
      if (remaining >= needed) {
        this.buffer.set(bytes.subarray(0, needed), this.bufferLength);
        this.processBlock(this.buffer, 0);
        offset += needed;
        remaining -= needed;
        this.bufferLength = 0;
      } else {
        this.buffer.set(bytes, this.bufferLength);
        this.bufferLength += remaining;
        return this;
      }
    }

    while (remaining >= 64) {
      this.processBlock(bytes, offset);
      offset += 64;
      remaining -= 64;
    }

    if (remaining > 0) {
      this.buffer.set(bytes.subarray(offset, offset + remaining), 0);
      this.bufferLength = remaining;
    }

    return this;
  }

  digest(outputType: 'hex' | 'binary' = 'hex'): string {
    const finalBuffer = new Uint8Array(64);
    finalBuffer.set(this.buffer.subarray(0, this.bufferLength), 0);
    finalBuffer[this.bufferLength] = 0x80;
    finalBuffer.fill(0, this.bufferLength + 1);

    if (this.bufferLength >= 56) {
      this.processBlock(finalBuffer, 0);
      finalBuffer.fill(0);
    }

    const bitLength = this.totalBytes * 8n;
    const view = new DataView(finalBuffer.buffer, finalBuffer.byteOffset, 64);
    view.setBigUint64(56, bitLength, false);

    this.processBlock(finalBuffer, 0);

    let hex = '';
    for (let i = 0; i < 8; i++) {
      hex += (this.H[i] ?? 0).toString(16).padStart(8, '0');
    }

    if (outputType === 'hex') {
      return hex;
    }
    return hex;
  }
}

export function createSha256Fallback(): IHasher {
  return new PureSha256Hasher();
}

// ============================================================================
// Hasher Factory & hash-wasm dynamic loader
// ============================================================================

let customHasherFactory: (() => Promise<IHasher>) | null = null;

export function setSha256HasherFactory(factory: (() => Promise<IHasher>) | null): void {
  customHasherFactory = factory;
}

export async function getSha256Hasher(): Promise<IHasher> {
  if (customHasherFactory) {
    const hasher = await customHasherFactory();
    hasher.init();
    return hasher;
  }

  try {
    const mod = (await import('hash-wasm')) as {
      createSHA256?: () => Promise<IHasher>;
    };
    if (typeof mod?.createSHA256 === 'function') {
      const hasher = await mod.createSHA256();
      hasher.init();
      return hasher;
    }
  } catch {
    // hash-wasm is not installed yet or cannot be resolved; use pure-TS fallback
  }

  return createSha256Fallback();
}

// ============================================================================
// Main-thread cooperative yielding helper
// ============================================================================

async function yieldToMainThread(): Promise<void> {
  const g = globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } };
  if (typeof g.scheduler?.yield === 'function') {
    await g.scheduler.yield();
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// ============================================================================
// Web Worker Implementation (runs hashing off the main thread when available)
// ============================================================================

const WORKER_CODE = `
${PureSha256Hasher.toString()}
const INITIAL_H = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
function rotr(n, b) { return (n >>> b) | (n << (32 - b)); }

self.onmessage = async function(e) {
  const { type, file, chunkSize } = e.data;
  if (type === 'START') {
    try {
      const hasher = new PureSha256Hasher();
      const totalBytes = file.size;
      let offset = 0;
      while (offset < totalBytes) {
        const end = Math.min(offset + chunkSize, totalBytes);
        const slice = file.slice(offset, end);
        const buffer = await slice.arrayBuffer();
        hasher.update(new Uint8Array(buffer));
        offset = end;
        self.postMessage({
          type: 'PROGRESS',
          bytesHashed: offset,
          totalBytes,
          percentage: totalBytes > 0 ? Math.round((offset / totalBytes) * 100) : 100
        });
      }
      const hash = hasher.digest('hex');
      self.postMessage({ type: 'DONE', hash });
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err && err.message ? err.message : String(err) });
    }
  }
};
`;

function runWorkerSha256(
  file: File | Blob,
  chunkSize: number,
  options?: ComputeSha256Options,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let worker: Worker | null = null;
    let workerUrl: string | null = null;

    const cleanup = () => {
      if (options?.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
      if (worker) {
        worker.terminate();
        worker = null;
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
        workerUrl = null;
      }
    };

    const onAbort = () => {
      cleanup();
      reject(options?.signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };

    if (options?.signal?.aborted) {
      onAbort();
      return;
    }

    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);

      if (options?.signal) {
        options.signal.addEventListener('abort', onAbort);
      }

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data as
          | { type: 'PROGRESS'; bytesHashed: number; totalBytes: number; percentage: number }
          | { type: 'DONE'; hash: string }
          | { type: 'ERROR'; message: string };

        if (data.type === 'PROGRESS') {
          options?.onProgress?.({
            bytesHashed: data.bytesHashed,
            totalBytes: data.totalBytes,
            percentage: data.percentage,
          });
        } else if (data.type === 'DONE') {
          cleanup();
          resolve(data.hash);
        } else if (data.type === 'ERROR') {
          cleanup();
          reject(new Error(data.message));
        }
      };

      worker.onerror = (err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error('Web Worker error during hash computation'));
      };

      worker.postMessage({ type: 'START', file, chunkSize });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

// ============================================================================
// Public computeSha256 function
// ============================================================================

/**
 * Compute the lowercase hexadecimal SHA-256 hash of a File, Blob, or ArrayBuffer.
 *
 * Chunks large inputs incrementally (default 8 MiB) via file.slice() so memory
 * usage stays bounded regardless of file size. Supports Web Worker execution,
 * cooperative yielding, progress updates, and AbortSignal cancellation.
 */
export async function computeSha256(
  data: File | Blob | ArrayBuffer,
  options?: ComputeSha256Options,
): Promise<string> {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
  }

  const chunkSize = options?.chunkSize && options.chunkSize > 0 ? options.chunkSize : DEFAULT_CHUNK_SIZE;

  // Attempt Web Worker off-thread hashing if practical (Blob/File in browser with Worker support, and no custom hasher factory override)
  const isBlobOrFile = typeof Blob !== 'undefined' && data instanceof Blob;
  const canUseWorker =
    isBlobOrFile &&
    options?.preferWorker !== false &&
    !options?.hasherFactory &&
    !customHasherFactory &&
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function';

  if (canUseWorker) {
    try {
      return await runWorkerSha256(data as Blob, chunkSize, options);
    } catch {
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      }
      // If Web Worker failed to instantiate (e.g. CSP policy disallowing blob workers), fall through to chunked loop with yielding
    }
  }

  // Fallback: incremental chunking on the main thread with cooperative yielding
  const hasher = options?.hasherFactory ? await options.hasherFactory() : await getSha256Hasher();
  hasher.init();

  // Check if data is ArrayBuffer (safe across realms/jsdom/workers)
  const isArrayBuffer =
    data instanceof ArrayBuffer ||
    Object.prototype.toString.call(data) === '[object ArrayBuffer]';

  if (isArrayBuffer) {
    const totalBytes = (data as ArrayBuffer).byteLength;
    let offset = 0;

    if (totalBytes === 0) {
      hasher.update(new Uint8Array(0));
      options?.onProgress?.({ bytesHashed: 0, totalBytes: 0, percentage: 100 });
      return hasher.digest('hex');
    }

    while (offset < totalBytes) {
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
      }

      const end = Math.min(offset + chunkSize, totalBytes);
      const chunkView = new Uint8Array(data as ArrayBuffer, offset, end - offset);
      hasher.update(chunkView);
      offset = end;

      options?.onProgress?.({
        bytesHashed: offset,
        totalBytes,
        percentage: Math.round((offset / totalBytes) * 100),
      });

      await yieldToMainThread();
    }

    return hasher.digest('hex');
  }

  // File or Blob instance
  const blob = data;
  const totalBytes = blob.size;
  let offset = 0;

  if (totalBytes === 0) {
    hasher.update(new Uint8Array(0));
    options?.onProgress?.({ bytesHashed: 0, totalBytes: 0, percentage: 100 });
    return hasher.digest('hex');
  }

  while (offset < totalBytes) {
    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
    }

    const end = Math.min(offset + chunkSize, totalBytes);
    const chunkBlob = typeof blob.slice === 'function' ? blob.slice(offset, end) : blob;

    let buffer: ArrayBuffer;
    if (typeof chunkBlob.arrayBuffer === 'function') {
      buffer = await chunkBlob.arrayBuffer();
    } else if (typeof FileReader !== 'undefined') {
      buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(chunkBlob);
      });
    } else {
      buffer = new ArrayBuffer(0);
    }

    hasher.update(new Uint8Array(buffer));
    offset = end;

    options?.onProgress?.({
      bytesHashed: offset,
      totalBytes,
      percentage: Math.round((offset / totalBytes) * 100),
    });

    await yieldToMainThread();
  }

  return hasher.digest('hex');
}
