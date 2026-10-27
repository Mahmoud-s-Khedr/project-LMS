'use client';

import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useServerDeadlineTimer } from '../hooks';

interface AssessmentTimerProps {
  deadlineAt: string | null;
  onExpire?: () => void;
  className?: string;
}

export function AssessmentTimer({ deadlineAt, onExpire, className }: AssessmentTimerProps) {
  const { formattedTime, isExpiringSoon, isCritical, isExpired } = useServerDeadlineTimer(
    deadlineAt,
    onExpire,
  );

  if (!deadlineAt || formattedTime === null) return null;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-mono font-semibold transition-colors shadow-xs',
        isExpired
          ? 'bg-destructive text-destructive-foreground animate-pulse'
          : isCritical
            ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse'
            : isExpiringSoon
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              : 'bg-muted text-foreground border',
        className,
      )}
      role="timer"
      aria-live="polite"
      aria-label={`Time remaining: ${formattedTime}`}
      data-testid="assessment-countdown-timer"
    >
      {isCritical || isExpired ? (
        <AlertTriangle className="h-3.5 w-3.5 animate-bounce" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      <span>{isExpired ? 'Time Expired' : formattedTime}</span>
    </div>
  );
}
