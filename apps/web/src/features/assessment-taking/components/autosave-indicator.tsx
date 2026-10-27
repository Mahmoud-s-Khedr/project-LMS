'use client';

import React from 'react';
import { Check, CloudAlert, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AutosaveStatus } from '../types';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  lastSavedAt?: string | null;
  className?: string;
}

export function AutosaveIndicator({ status, lastSavedAt, className }: AutosaveIndicatorProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors',
        status === 'SAVED' && 'text-emerald-600 dark:text-emerald-400',
        status === 'SAVING' && 'text-muted-foreground',
        status === 'OFFLINE' && 'text-amber-600 dark:text-amber-400',
        status === 'CONFLICT' && 'text-amber-600 dark:text-amber-400',
        status === 'ERROR' && 'text-destructive',
        className,
      )}
      data-testid="autosave-status-indicator"
      aria-live="polite"
    >
      {status === 'SAVING' && (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Saving...</span>
        </>
      )}

      {status === 'SAVED' && (
        <>
          <Check className="h-3 w-3" />
          <span>
            Saved
            {lastSavedAt
              ? ` ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : ''}
          </span>
        </>
      )}

      {status === 'OFFLINE' && (
        <>
          <CloudOff className="h-3 w-3" />
          <span>Offline - changes cached locally</span>
        </>
      )}

      {status === 'CONFLICT' && (
        <>
          <CloudAlert className="h-3 w-3" />
          <span>Version conflict - reload required</span>
        </>
      )}

      {status === 'ERROR' && (
        <>
          <CloudAlert className="h-3 w-3" />
          <span>Save failed - retrying</span>
        </>
      )}
    </div>
  );
}
