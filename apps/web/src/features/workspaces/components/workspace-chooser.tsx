'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, PlusCircle, User } from 'lucide-react';
import type { MyWorkspace } from '@lms/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActiveWorkspace } from '../hooks';

export interface WorkspaceChooserProps {
  onCreateNew?: () => void;
  className?: string;
}

export function WorkspaceChooser({ onCreateNew, className }: WorkspaceChooserProps) {
  const router = useRouter();
  const { activeWorkspaceId, setActiveWorkspaceId, workspaces, isLoading } = useActiveWorkspace();

  function handleSelect(ws: MyWorkspace) {
    setActiveWorkspaceId(ws.id);
    const role = ws.membership?.role;
    if (role === 'ADMIN' && ws.kind === 'ACADEMY') {
      router.push('/admin');
    } else if (role === 'INSTRUCTOR' || role === 'TEACHING_ASSISTANT' || role === 'ADMIN') {
      router.push('/instructor');
    } else {
      router.push('/student');
    }
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading workspaces"
        className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}
      >
        <span className="sr-only">Loading workspaces...</span>
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    );
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <Card className={cn('border-dashed border-border p-6 text-center', className)}>
        <div className="flex flex-col items-center justify-center space-y-3 py-6">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Building2 className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">No Workspaces Found</h3>
            <p className="max-w-sm text-xs text-muted-foreground">
              You do not belong to any instructor or academy workspaces yet. Create your first
              workspace to start teaching.
            </p>
          </div>
          {onCreateNew && (
            <Button onClick={onCreateNew} className="rounded-full gap-2">
              <PlusCircle className="size-4" aria-hidden="true" />
              <span>Create First Workspace</span>
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workspaces.map((ws) => {
          const isSelected = ws.id === activeWorkspaceId;
          const isAcademy = ws.kind === 'ACADEMY';

          return (
            <Card
              key={ws.id}
              className={cn(
                'flex flex-col justify-between rounded-2xl border transition-all hover:border-primary/50 hover:shadow-sm',
                isSelected && 'border-primary ring-2 ring-primary/20 bg-primary/[0.02]',
              )}
            >
              <CardHeader className="p-5 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {isAcademy ? (
                      <Building2 className="size-4" aria-hidden="true" />
                    ) : (
                      <User className="size-4" aria-hidden="true" />
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <Badge variant="secondary" className="text-[10px]">
                      {isAcademy ? 'Academy' : 'Personal'}
                    </Badge>
                    {ws.membership?.role && (
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {ws.membership.role}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1 pt-2">
                  <CardTitle className="text-base font-semibold truncate text-foreground">
                    {ws.name}
                  </CardTitle>
                  <CardDescription className="text-xs font-mono text-muted-foreground truncate">
                    /{ws.slug}
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="p-5 pt-0 space-y-4">
                {ws.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                    {ws.description}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
                  <Button
                    type="button"
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSelect(ws)}
                    className="w-full rounded-xl text-xs gap-1.5"
                  >
                    <span>Open Studio</span>
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
