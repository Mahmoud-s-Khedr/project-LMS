'use client';

import React from 'react';
import { FileText, Download, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssetSignedUrl } from '../hooks';
import { isContentUnavailableError } from './content-unavailable-view';
import type { LearnerLesson } from '../types';

interface DocumentLessonViewerProps {
  enrollmentId: string;
  lesson: LearnerLesson;
}

export function DocumentLessonViewer({ enrollmentId, lesson }: DocumentLessonViewerProps) {
  // Find primary document or resource asset
  const docAsset =
    lesson.assets.find(
      (a) => a.purpose === 'PRIMARY_DOCUMENT' || a.mimeType === 'application/pdf',
    ) ?? lesson.assets[0];

  const {
    url: docUrl,
    error: docError,
    isLoading: isDocLoading,
    renew: renewDocUrl,
  } = useAssetSignedUrl(enrollmentId, lesson.lessonId, docAsset?.assetId ?? null);

  if (!docAsset) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">Document Not Found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No document attachment is linked to this lesson.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs"
      data-testid="document-viewer-container"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{docAsset.filename}</h3>
            <p className="text-xs text-muted-foreground">{docAsset.mimeType}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {docUrl && (
            <>
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs"
                data-testid="open-document-button"
              >
                <a href={docUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open in Tab</span>
                </a>
              </Button>
              <Button
                variant="default"
                size="sm"
                asChild
                className="gap-1.5 text-xs"
                data-testid="download-document-button"
              >
                <a href={docUrl} download={docAsset.filename}>
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Document</span>
                </a>
              </Button>
            </>
          )}
        </div>
      </div>

      {docError && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-amber-600 mb-2" />
          <p className="text-xs font-semibold text-foreground">
            {isContentUnavailableError(docError)
              ? 'Document Temporarily Unavailable'
              : 'Failed to generate document capability link.'}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {isContentUnavailableError(docError)
              ? 'Learning access evaluation is temporarily offline while services initialize. Your course enrollment is active.'
              : 'Unable to secure signed download capability. Please retry.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void renewDocUrl()}
            className="mt-3 gap-1.5 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Link</span>
          </Button>
        </div>
      )}

      {isDocLoading && !docUrl && (
        <div className="flex h-96 items-center justify-center rounded-lg border bg-muted/20">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Loading document securely...</span>
          </div>
        </div>
      )}

      {docUrl && (
        <div className="relative h-[70vh] min-h-[500px] w-full overflow-hidden rounded-lg border bg-muted/10">
          <iframe
            src={`${docUrl}#toolbar=1`}
            title={docAsset.filename}
            className="h-full w-full border-0"
            data-testid="document-iframe"
          />
        </div>
      )}
    </div>
  );
}
