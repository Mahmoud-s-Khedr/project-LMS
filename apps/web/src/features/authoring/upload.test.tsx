import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetUploader } from './components/asset-uploader';
import * as api from './api';

// Polyfill arrayBuffer/text for jsdom File instances in test environment
if (typeof File !== 'undefined') {
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = async function () {
      return new TextEncoder().encode('mock file binary bytes').buffer;
    };
  }
  if (!File.prototype.text) {
    File.prototype.text = async function () {
      return 'mock file binary bytes';
    };
  }
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('AssetUploader Component', () => {
  const workspaceId = 'a0000000-0000-4000-8000-000000000010';
  const parentId = 'a0000000-0000-4000-8000-000000000101';

  beforeEach(() => {
    vi.restoreAllMocks();
    File.prototype.arrayBuffer = async function () {
      return new TextEncoder().encode('clean binary content').buffer;
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('rejects oversized files immediately without network upload', async () => {
    const onReady = vi.fn();
    renderWithClient(
      <AssetUploader
        workspaceId={workspaceId}
        parentId={parentId}
        purpose="PRIMARY_VIDEO"
        maxSizeBytes={1024 * 1024} // 1MB mock limit
        onAssetReady={onReady}
      />,
    );

    // Create a 2MB dummy file
    const oversizedFile = new File(['x'.repeat(100)], 'huge_lecture.mp4', {
      type: 'video/mp4',
    });
    Object.defineProperty(oversizedFile, 'size', { value: 2 * 1024 * 1024 });

    const input = document.getElementById(`upload-${parentId}-PRIMARY_VIDEO`) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [oversizedFile] } });

    const errorAlert = await screen.findByText(/Upload Failed/i);
    expect(errorAlert).toBeInTheDocument();
    expect(screen.getByText(/SIZE_MISMATCH/i)).toBeInTheDocument();
    expect(screen.getByText(/exceeds maximum permitted size/i)).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('rejects submission files exceeding 10MB limit', async () => {
    const onReady = vi.fn();
    renderWithClient(
      <AssetUploader
        workspaceId={workspaceId}
        parentId={parentId}
        purpose="SUBMISSION"
        onAssetReady={onReady}
      />,
    );

    // Create an 11MB file
    const oversizedSubmission = new File(['x'], 'homework.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(oversizedSubmission, 'size', { value: 11 * 1024 * 1024 });

    const input = document.getElementById(`upload-${parentId}-SUBMISSION`) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [oversizedSubmission] } });

    await waitFor(() => {
      expect(screen.getByText(/SIZE_MISMATCH/i)).toBeInTheDocument();
      expect(screen.getByText(/exceeds maximum permitted size of 10 MB/i)).toBeInTheDocument();
    });
  });

  it('handles virus scan rejection with rejection code display', async () => {
    const onReady = vi.fn();

    vi.spyOn(api, 'requestAssetUpload').mockResolvedValueOnce({
      assetId: 'a0000000-0000-4000-8000-000000000999',
      url: 'https://minio.example.com/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    vi.spyOn(api, 'uploadAssetBinary').mockResolvedValueOnce();
    vi.spyOn(api, 'completeAssetUpload').mockResolvedValueOnce({
      operationId: 'a0000000-0000-4000-8000-000000000888',
      status: 'SCANNING',
    });

    // Mock scan returning REJECTED with MALWARE code
    vi.spyOn(api, 'pollAssetScan').mockRejectedValueOnce(
      new Error('Asset was rejected during scan: MALWARE'),
    );

    renderWithClient(
      <AssetUploader
        workspaceId={workspaceId}
        parentId={parentId}
        purpose="PRIMARY_VIDEO"
        onAssetReady={onReady}
      />,
    );

    const testFile = new File(['dummy-content'], 'infected.mp4', { type: 'video/mp4' });
    const input = document.getElementById(`upload-${parentId}-PRIMARY_VIDEO`) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [testFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Upload Failed/i)).toBeInTheDocument();
      expect(screen.getByText(/MALWARE/i)).toBeInTheDocument();
    });

    expect(onReady).not.toHaveBeenCalled();
  });

  it('successfully transitions from Hashing -> Uploading -> Scanning -> Ready', async () => {
    const onReady = vi.fn();
    const assetId = 'a0000000-0000-4000-8000-000000000777';

    vi.spyOn(api, 'requestAssetUpload').mockResolvedValueOnce({
      assetId,
      url: 'https://minio.example.com/upload',
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    vi.spyOn(api, 'uploadAssetBinary').mockImplementation(async (_url, _method, _headers, _file, onProgress) => {
      if (onProgress) {
        onProgress(50);
        onProgress(100);
      }
    });

    vi.spyOn(api, 'completeAssetUpload').mockResolvedValueOnce({
      operationId: 'a0000000-0000-4000-8000-000000000888',
      status: 'SCANNING',
    });

    vi.spyOn(api, 'pollAssetScan').mockResolvedValueOnce({
      id: assetId,
      workspaceId,
      filename: 'clean_lecture.mp4',
      mimeType: 'video/mp4',
      sizeBytes: '13',
      status: 'READY',
      visibility: 'PUBLIC',
      rejectionCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderWithClient(
      <AssetUploader
        workspaceId={workspaceId}
        parentId={parentId}
        purpose="PRIMARY_VIDEO"
        onAssetReady={onReady}
      />,
    );

    const validFile = new File(['clean content'], 'clean_lecture.mp4', { type: 'video/mp4' });
    const input = document.getElementById(`upload-${parentId}-PRIMARY_VIDEO`) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [validFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Scan passed and ready to attach/i)).toBeInTheDocument();
    });

    expect(onReady).toHaveBeenCalledWith(
      expect.objectContaining({
        id: assetId,
        status: 'READY',
      }),
    );
  });
});
