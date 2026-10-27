'use client';

import { useState } from 'react';
import { Download, FileText, Loader2, X, ExternalLink, BookOpen, MonitorPlay } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreviewLessonQuery, usePreviewAssetDownloadMutation } from '../hooks';
import type { PublicOutlineLesson } from '../types';
import { formatDurationMinutes } from '../types';
import { RichTextRenderer } from './rich-text-renderer';

interface PreviewLessonModalProps {
  courseId: string;
  lesson: PublicOutlineLesson | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PreviewLessonModal({ courseId, lesson, isOpen, onClose }: PreviewLessonModalProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const {
    data: preview,
    isLoading,
    isError,
    error,
  } = usePreviewLessonQuery(courseId, lesson?.lessonId ?? null, {
    enabled: isOpen && Boolean(lesson),
  });

  const downloadMutation = usePreviewAssetDownloadMutation();

  if (!isOpen || !lesson) return null;

  const handleDownload = async (assetId: string, filename: string) => {
    setDownloadError(null);
    try {
      const capability = await downloadMutation.mutateAsync({
        courseId,
        lessonId: lesson.lessonId,
        assetId,
      });
      // Trigger download via signed capability URL
      const link = document.createElement('a');
      link.href = capability.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      setDownloadError('Failed to generate download link. Please try again.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-6 py-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              Free Preview
            </Badge>
            <Badge variant="outline">{lesson.type}</Badge>
            {lesson.estimatedMinutes > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatDurationMinutes(lesson.estimatedMinutes)}
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
            aria-label="Close preview modal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <h2
            id="preview-modal-title"
            className="font-serif text-2xl font-bold tracking-tight text-foreground mb-4"
          >
            {lesson.title}
          </h2>

          {isLoading ? (
            <div className="space-y-4 py-6" aria-busy="true">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center text-destructive">
              <p className="font-semibold">Unable to load lesson preview</p>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error
                  ? error.message
                  : 'Please check your connection and try again.'}
              </p>
            </div>
          ) : preview ? (
            <div className="space-y-6">
              {/* Payload View */}
              {preview.payload.type === 'TEXT' && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-5">
                  <RichTextRenderer content={preview.payload.body} />
                </div>
              )}

              {preview.payload.type === 'VIDEO' && (
                <div className="space-y-4">
                  <div className="aspect-video w-full rounded-lg bg-black flex flex-col items-center justify-center text-white p-6 shadow-inner">
                    <MonitorPlay className="h-16 w-16 text-primary mb-3" />
                    <p className="text-sm font-medium">Video Preview</p>
                    {preview.payload.body.durationSeconds && (
                      <p className="text-xs text-zinc-400 mt-1">
                        Duration: {Math.round(preview.payload.body.durationSeconds / 60)} minutes
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Full video player and high-definition streaming unlock upon enrollment.
                  </p>
                </div>
              )}

              {preview.payload.type === 'DOCUMENT' && (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center bg-muted/20">
                  <FileText className="h-12 w-12 text-primary/70 mb-2" />
                  <p className="font-semibold">Lesson Document Resource</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md">
                    This lesson contains guided notes and reading material. Download sample
                    materials below or enroll for the full library.
                  </p>
                </div>
              )}

              {preview.payload.type === 'INTERACTIVE' && (
                <div className="space-y-2">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-border">
                    <iframe
                      src={preview.payload.body.embedUrl}
                      sandbox={preview.payload.body.sandbox.join(' ')}
                      title={lesson.title}
                      className="h-full w-full border-0"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Interactive embed is running in a secure, sandboxed container.
                  </p>
                </div>
              )}

              {/* Downloadable Assets */}
              {preview.assets && preview.assets.length > 0 && (
                <div className="mt-8 border-t border-border/60 pt-6">
                  <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" />
                    Preview Attachments & Downloads
                  </h3>

                  {downloadError && (
                    <p className="text-xs text-destructive mb-2">{downloadError}</p>
                  )}

                  <div className="grid gap-2 sm:grid-cols-2">
                    {preview.assets.map((asset) => (
                      <div
                        key={asset.assetId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 bg-card"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{asset.filename}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {asset.purpose} • {asset.mimeType}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(asset.assetId, asset.filename)}
                          disabled={downloadMutation.isPending}
                          className="gap-1 text-xs"
                        >
                          {downloadMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border/80 bg-muted/10 px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
