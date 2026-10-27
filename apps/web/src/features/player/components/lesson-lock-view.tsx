'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { EffectiveAccess } from '../types';

interface LessonLockViewProps {
  access: Extract<EffectiveAccess, { allowed: false }>;
  onBackToOutline?: () => void;
}

export function LessonLockView({ access, onBackToOutline }: LessonLockViewProps) {
  const [timeUntilUnlock, setTimeUntilUnlock] = useState<string | null>(null);

  useEffect(() => {
    if (access.reason !== 'NOT_RELEASED' || !access.unlockAt) return;

    const updateCountdown = () => {
      const diffMs = Date.parse(access.unlockAt!) - Date.now();
      if (diffMs <= 0) {
        setTimeUntilUnlock('Now available (refresh page)');
        return;
      }

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

      if (days > 0) {
        setTimeUntilUnlock(`${days}d ${hours}h`);
      } else {
        setTimeUntilUnlock(`${hours}h ${minutes}m`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60_000);
    return () => clearInterval(interval);
  }, [access]);

  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border bg-card p-8 md:p-12 text-center max-w-lg mx-auto my-12 shadow-sm"
      data-testid="lesson-lock-view"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
        <Lock className="h-8 w-8" />
      </div>

      <Badge variant="outline" className="mb-2 text-xs font-semibold">
        {access.reason.replace(/_/g, ' ')}
      </Badge>

      <h3 className="text-lg font-semibold text-foreground">Content is Locked</h3>

      {access.reason === 'NOT_RELEASED' && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-muted-foreground">
            This lesson is scheduled to be released according to the course drip schedule.
          </p>
          {access.unlockAt && (
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-muted/50 p-2 text-xs font-medium text-foreground">
              <Clock className="h-4 w-4 text-primary" />
              <span>
                Unlocks on {new Date(access.unlockAt).toLocaleString()}
                {timeUntilUnlock && ` (in ${timeUntilUnlock})`}
              </span>
            </div>
          )}
        </div>
      )}

      {access.reason === 'PREREQUISITE_UNMET' && (
        <p className="mt-2 text-xs text-muted-foreground">
          You must complete the prerequisite lessons in earlier sections before accessing this lesson.
        </p>
      )}

      {access.reason === 'ACCESS_EXPIRED' && (
        <p className="mt-2 text-xs text-muted-foreground">
          Your enrollment access period has expired. Please contact support or renew your enrollment to continue.
        </p>
      )}

      {access.reason === 'ENROLLMENT_SUSPENDED' && (
        <p className="mt-2 text-xs text-muted-foreground">
          Your access to this course has been suspended. Please check with course administrators.
        </p>
      )}

      {onBackToOutline && (
        <Button
          variant="outline"
          size="sm"
          onClick={onBackToOutline}
          className="mt-6 text-xs"
        >
          Return to Course Outline
        </Button>
      )}
    </div>
  );
}
