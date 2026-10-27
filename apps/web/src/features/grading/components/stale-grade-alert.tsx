'use client';

import * as React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StaleGradeAlertProps {
  onReload: () => void;
  message?: string;
}

export function StaleGradeAlert({
  onReload,
  message = 'This attempt has been updated by another grader or student event. Your local changes are stale.',
}: StaleGradeAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive space-y-2"
    >
      <div className="flex items-center gap-2 font-semibold text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Version Conflict Detected
      </div>
      <p className="text-xs">{message}</p>
      <div className="pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onReload}
          className="gap-1.5 border-destructive/30 hover:bg-destructive/15 text-destructive"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload Latest Submission
        </Button>
      </div>
    </div>
  );
}
