'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileCheck,
  AlertCircle,
  Loader2,
  FileText,
  Video,
} from 'lucide-react';
import { useAssetUploader } from '../hooks';
import type { Asset, AssetPurpose } from '../types';

interface AssetUploaderProps {
  workspaceId: string;
  parentId: string;
  purpose: AssetPurpose;
  accept?: string;
  maxSizeBytes?: number;
  label?: string;
  onAssetReady: (asset: Asset) => void;
  disabled?: boolean;
}

export function AssetUploader({
  workspaceId,
  parentId,
  purpose,
  accept,
  maxSizeBytes = 5368709120, // 5 GiB
  label = 'Select or drop a file to upload',
  onAssetReady,
  disabled = false,
}: AssetUploaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { uploadFile } = useAssetUploader(workspaceId);

  const [currentFile, setCurrentFile] = React.useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = React.useState<
    'IDLE' | 'HASHING' | 'REQUESTING' | 'UPLOADING' | 'SCANNING' | 'READY' | 'REJECTED' | 'ERROR'
  >('IDLE');
  const [progress, setProgress] = React.useState<number>(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [rejectionCode, setRejectionCode] = React.useState<string | null>(null);

  const handleFileChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    // Reset previous errors
    setErrorMessage(null);
    setRejectionCode(null);
    setCurrentFile(file);

    // 1. Oversized file validation
    const maxLimit = purpose === 'SUBMISSION' ? 10485760 : maxSizeBytes;
    if (file.size > maxLimit) {
      setUploadStatus('REJECTED');
      setRejectionCode('SIZE_MISMATCH');
      const limitMb = Math.round(maxLimit / (1024 * 1024));
      setErrorMessage(`File exceeds maximum permitted size of ${limitMb} MB`);
      return;
    }

    // 2. Unsafe filename check
    if (/[\\/]/.test(file.name) || Array.from(file.name).some((c) => c.charCodeAt(0) < 32)) {
      setUploadStatus('ERROR');
      setErrorMessage('Filename contains unsafe path or control characters');
      return;
    }

    try {
      setUploadStatus('HASHING');
      setProgress(15);

      const readyAsset = await uploadFile(file, purpose, parentId);
      setUploadStatus('READY');
      setProgress(100);
      onAssetReady(readyAsset);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setUploadStatus(message.includes('rejected') ? 'REJECTED' : 'ERROR');
      setErrorMessage(message);
    }
  };

  const handleReset = () => {
    setCurrentFile(null);
    setUploadStatus('IDLE');
    setProgress(0);
    setErrorMessage(null);
    setRejectionCode(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-input p-4 transition-colors hover:border-primary/50">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={disabled || uploadStatus === 'UPLOADING' || uploadStatus === 'SCANNING'}
        onChange={(e) => void handleFileChange(e.target.files)}
        className="hidden"
        id={`upload-${parentId}-${purpose}`}
      />

      {uploadStatus === 'IDLE' && (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <div className="rounded-full bg-muted p-3 text-muted-foreground">
            {purpose === 'PRIMARY_VIDEO' ? (
              <Video className="h-6 w-6" />
            ) : (
              <FileText className="h-6 w-6" />
            )}
          </div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">
            {purpose === 'PRIMARY_VIDEO'
              ? 'MP4 video up to 5 GiB'
              : purpose === 'SUBMISSION'
                ? 'PDF or image up to 10 MiB'
                : 'PDF, text, or media asset'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="mt-2"
          >
            <Upload className="mr-1.5 h-4 w-4" />
            Browse File
          </Button>
        </div>
      )}

      {(uploadStatus === 'HASHING' ||
        uploadStatus === 'REQUESTING' ||
        uploadStatus === 'UPLOADING' ||
        uploadStatus === 'SCANNING') && (
        <div className="flex flex-col items-center justify-center gap-3 py-4 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{currentFile?.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {uploadStatus === 'HASHING' && 'Computing SHA-256 checksum...'}
              {uploadStatus === 'REQUESTING' && 'Requesting secure upload authorization...'}
              {uploadStatus === 'UPLOADING' && `Uploading bytes (${progress}%)...`}
              {uploadStatus === 'SCANNING' && 'Scanning for malware and verifying file...'}
            </p>
          </div>
          <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${Math.max(10, progress)}%` }}
            />
          </div>
        </div>
      )}

      {uploadStatus === 'READY' && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-emerald-500/10 p-3 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 shrink-0" />
            <div className="text-left text-xs">
              <p className="font-semibold">{currentFile?.name ?? 'Asset uploaded'}</p>
              <p className="text-[11px] opacity-80">Scan passed and ready to attach</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
            Replace
          </Button>
        </div>
      )}

      {(uploadStatus === 'REJECTED' || uploadStatus === 'ERROR') && (
        <div className="flex flex-col gap-2 rounded-md bg-destructive/10 p-3 border border-destructive/20 text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="text-left text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Upload Failed</span>
                {rejectionCode && (
                  <Badge variant="destructive" className="text-[10px] uppercase">
                    {rejectionCode}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-muted-foreground">{errorMessage || 'An error occurred during upload.'}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleReset}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
