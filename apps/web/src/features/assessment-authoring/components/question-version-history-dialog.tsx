'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuestionVersionsQuery } from '../hooks';
import { richTextToText } from '../utils';

interface QuestionVersionHistoryDialogProps {
  workspaceId: string;
  questionId: string;
  questionTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuestionVersionHistoryDialog({
  workspaceId,
  questionId,
  questionTitle,
  open,
  onOpenChange,
}: QuestionVersionHistoryDialogProps) {
  const { data, isLoading, error } = useQuestionVersionsQuery(
    workspaceId,
    questionId,
    {},
    { enabled: open && Boolean(questionId) },
  );

  const versions = data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Version History: {questionTitle}</DialogTitle>
          <DialogDescription>
            Question versions are immutable. Completed and in-progress attempts remain anchored to
            the exact version snapshot at test start.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4 text-center text-sm text-destructive bg-destructive/10 rounded-md">
              Failed to load question versions: {error instanceof Error ? error.message : 'Error'}
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center p-6 text-sm text-muted-foreground">
              No version history records found.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((ver) => {
                const prompt = richTextToText(ver.payload.prompt);
                const explanation = richTextToText(ver.payload.explanation);

                return (
                  <div
                    key={ver.id}
                    className="rounded-lg border p-4 space-y-2 bg-card hover:border-primary/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          v{ver.version}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {ver.payload.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {ver.payload.defaultPoints} pts
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ver.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-sm line-clamp-3 text-card-foreground">{prompt}</p>

                    {ver.payload.options && ver.payload.options.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {ver.payload.options.length} options configured
                      </div>
                    )}

                    {explanation && (
                      <div className="text-xs bg-muted/30 p-2 rounded text-muted-foreground line-clamp-2">
                        <span className="font-semibold text-foreground">Explanation:</span>{' '}
                        {explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
