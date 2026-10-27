'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ContentUnavailableViewProps {
  onRetry?: () => void;
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
  message?: string;
}

export function ContentUnavailableView({
  onRetry,
  onBack,
  backHref,
  backLabel = 'Back to My Courses',
  message,
}: ContentUnavailableViewProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border bg-card p-8 md:p-12 text-center max-w-lg mx-auto my-12 shadow-sm"
      data-testid="content-unavailable-view"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
        <Clock className="h-8 w-8" />
      </div>

      <Badge
        variant="outline"
        className="mb-2 text-xs font-semibold border-amber-500/30 text-amber-700 dark:text-amber-400"
      >
        TEMPORARILY UNAVAILABLE
      </Badge>

      <h3 className="text-lg font-bold text-foreground">Content Temporarily Unavailable</h3>

      <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
        {message ||
          'Course content evaluation is temporarily offline while the learning service is being updated. Your enrollment is safe and your progress is preserved.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry && (
          <Button size="sm" onClick={onRetry} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </Button>
        )}

        {onBack ? (
          <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5 text-xs">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{backLabel}</span>
          </Button>
        ) : backHref ? (
          <Button size="sm" variant="outline" asChild className="gap-1.5 text-xs">
            <Link href={backHref}>
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{backLabel}</span>
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Helper to check if an unknown error represents a 503 AccessPolicy / temporarily unavailable condition.
 */
export function isContentUnavailableError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.status === 503) return true;
    if (typeof err.message === 'string') {
      const msg = err.message.toLowerCase();
      if (
        msg.includes('503') ||
        msg.includes('accesspolicy') ||
        msg.includes('temporarily unavailable') ||
        msg.includes('service unavailable')
      ) {
        return true;
      }
    }
    if (err.code === 'SERVICE_UNAVAILABLE') return true;
  }
  return false;
}
