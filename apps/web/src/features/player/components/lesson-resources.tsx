'use client';

import React, { useState } from 'react';
import { Download, File, RefreshCw, Paperclip, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requestLessonAssetDownload } from '../api';
import { isContentUnavailableError } from './content-unavailable-view';
import type { LearnerLesson } from '../types';

interface LessonResourcesProps {
  enrollmentId: string;
  lesson: LearnerLesson;
}

export function LessonResources({ enrollmentId, lesson }: LessonResourcesProps) {
  // STRICT SECURITY REQUIREMENT: No download buttons for protected video!
  // Filter out any primary video assets from the downloadable resources list.
  const downloadableAssets = lesson.assets.filter(
    (a) => a.purpose !== 'PRIMARY_VIDEO' && !a.mimeType.startsWith('video/'),
  );

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  if (downloadableAssets.length === 0) return null;

  const handleDownload = async (assetId: string, filename: string) => {
    setDownloadingId(assetId);
    setDownloadError(null);
    try {
      const capability = await requestLessonAssetDownload(enrollmentId, lesson.lessonId, assetId);
      // Trigger browser download via temporary anchor
      const link = document.createElement('a');
      link.href = capability.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      if (isContentUnavailableError(err)) {
        setDownloadError(
          'Download temporarily unavailable while learning access policy initializes.',
        );
      } else {
        setDownloadError(err instanceof Error ? err.message : 'Failed to download asset');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      className="mt-6 rounded-xl border bg-card p-4 shadow-xs"
      data-testid="lesson-resources-container"
    >
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="h-4 w-4 text-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lesson Resources ({downloadableAssets.length})
        </h4>
      </div>

      {downloadError && (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-900 dark:text-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{downloadError}</span>
        </div>
      )}

      <ul className="space-y-2">
        {downloadableAssets.map((asset) => (
          <li
            key={asset.assetId}
            className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0 mr-3">
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{asset.filename}</p>
                <p className="text-[10px] text-muted-foreground">{asset.mimeType}</p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDownload(asset.assetId, asset.filename)}
              disabled={downloadingId === asset.assetId}
              className="h-8 gap-1.5 text-xs shrink-0"
              data-testid={`download-asset-${asset.assetId}`}
            >
              {downloadingId === asset.assetId ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>Download</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
