import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAssetUploader } from '../hooks';
import * as api from '../api';

// Polyfill arrayBuffer for jsdom
if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = async function () {
    return new TextEncoder().encode('file-bytes').buffer;
  };
}

describe('useAssetUploader incremental hashing & abort flows', () => {
  const workspaceId = 'a0000000-0000-4000-8000-000000000010';
  const parentId = 'a0000000-0000-4000-8000-000000000101';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports incremental hashing progress and completes upload', async () => {
    const assetId = 'a0000000-0000-4000-8000-000000000555';

    const requestSpy = vi.spyOn(api, 'requestAssetUpload').mockResolvedValueOnce({
      assetId,
      url: 'https://storage.example.com/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    vi.spyOn(api, 'uploadAssetBinary').mockImplementation(async (_u, _m, _h, _f, onProgress) => {
      if (onProgress) onProgress(100);
    });

    vi.spyOn(api, 'completeAssetUpload').mockResolvedValueOnce({
      operationId: 'a0000000-0000-4000-8000-000000000777',
      status: 'SCANNING',
    });

    vi.spyOn(api, 'pollAssetScan').mockResolvedValueOnce({
      id: assetId,
      workspaceId,
      filename: 'multi_chunk.mp4',
      mimeType: 'video/mp4',
      sizeBytes: '2048',
      status: 'READY',
      visibility: 'PUBLIC',
      rejectionCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useAssetUploader(workspaceId));

    const content = 'a'.repeat(2048);
    const file = new File([content], 'multi_chunk.mp4', { type: 'video/mp4' });

    const progressStages: { stage: string; percent: number }[] = [];

    let assetResult;
    await act(async () => {
      assetResult = await result.current.uploadFile(file, 'PRIMARY_VIDEO', parentId, {
        chunkSize: 512, // Force multiple chunks
        onProgress: (p) => progressStages.push(p),
      });
    });

    expect(assetResult).toBeDefined();
    expect(requestSpy).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        filename: 'multi_chunk.mp4',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );

    // Verify hashing progress was reported
    const hashingSteps = progressStages.filter((p) => p.stage === 'HASHING');
    expect(hashingSteps.length).toBeGreaterThanOrEqual(4);
    expect(hashingSteps[hashingSteps.length - 1]?.percent).toBe(100);
  });

  it('aborts upload when AbortSignal is cancelled during hashing', async () => {
    const controller = new AbortController();

    const requestSpy = vi.spyOn(api, 'requestAssetUpload');

    const { result } = renderHook(() => useAssetUploader(workspaceId));

    const file = new File(['x'.repeat(1000)], 'large.mp4', { type: 'video/mp4' });

    let uploadError: unknown;
    await act(async () => {
      try {
        await result.current.uploadFile(file, 'PRIMARY_VIDEO', parentId, {
          chunkSize: 100,
          signal: controller.signal,
          onProgress: ({ percent }) => {
            if (percent >= 30) {
              controller.abort(new DOMException('User cancelled hashing', 'AbortError'));
            }
          },
        });
      } catch (err) {
        uploadError = err;
      }
    });

    expect(uploadError).toBeDefined();
    expect((uploadError as Error).message).toContain('User cancelled hashing');
    expect(requestSpy).not.toHaveBeenCalled();
  });
});
