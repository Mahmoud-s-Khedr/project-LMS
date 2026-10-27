'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { OptimisticConflictState } from '../types';

interface ConflictDialogProps {
  conflict: OptimisticConflictState | null;
  onReload: () => void;
  onDismiss: () => void;
}

export function ConflictDialog({ conflict, onReload, onDismiss }: ConflictDialogProps) {
  if (!conflict || !conflict.hasConflict) return null;

  return (
    <Dialog open={conflict.hasConflict} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <DialogTitle>Version Conflict Detected</DialogTitle>
          </div>
          <DialogDescription className="pt-2 text-left text-sm text-muted-foreground">
            {conflict.message ||
              `The ${conflict.resourceType} was updated elsewhere while you were editing. To prevent accidental overwrites, please reload the latest server version.`}
          </DialogDescription>
        </DialogHeader>

        <div className="my-2 rounded-md bg-muted p-3 text-xs font-mono text-muted-foreground">
          Resource: <span className="text-foreground">{conflict.resourceType}</span>
          <br />
          ID: <span className="text-foreground">{conflict.resourceId}</span>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onDismiss}>
            Review My Changes
          </Button>
          <Button
            variant="default"
            onClick={() => {
              onReload();
              onDismiss();
            }}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Latest Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
