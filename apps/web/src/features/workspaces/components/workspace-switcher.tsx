'use client';

import * as React from 'react';
import Link from 'next/link';
import { Building2, Check, ChevronsUpDown, PlusCircle, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActiveWorkspace } from '../hooks';

export interface WorkspaceSwitcherProps {
  className?: string;
}

export function WorkspaceSwitcher({ className }: WorkspaceSwitcherProps) {
  const { activeWorkspace, activeWorkspaceId, setActiveWorkspaceId, workspaces, isLoading } =
    useActiveWorkspace();

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Skeleton className="h-9 w-36 rounded-xl sm:w-44" />
      </div>
    );
  }

  if (!workspaces || workspaces.length === 0) {
    return (
      <div className={cn('flex items-center', className)}>
        <Button asChild variant="outline" size="sm" className="gap-2 rounded-xl text-xs">
          <Link href="/onboarding">
            <PlusCircle className="size-3.5" aria-hidden="true" />
            <span>Create Workspace</span>
          </Link>
        </Button>
      </div>
    );
  }

  const isAcademy = activeWorkspace?.kind === 'ACADEMY';

  return (
    <div className={cn('flex items-center', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Current workspace: ${activeWorkspace?.name ?? 'Select workspace'}`}
            className="flex h-9 items-center gap-2 rounded-xl px-2.5 text-xs font-medium hover:bg-accent"
          >
            <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {isAcademy ? (
                <Building2 className="size-3.5" aria-hidden="true" />
              ) : (
                <User className="size-3.5" aria-hidden="true" />
              )}
            </div>

            <span className="max-w-28 truncate sm:max-w-36 text-left">
              {activeWorkspace?.name ?? 'Select workspace'}
            </span>

            {activeWorkspace && (
              <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] px-1.5 py-0">
                {activeWorkspace.kind === 'ACADEMY' ? 'Academy' : 'Personal'}
              </Badge>
            )}

            <ChevronsUpDown
              className="size-3.5 text-muted-foreground shrink-0 opacity-70"
              aria-hidden="true"
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 rounded-2xl p-2 shadow-lg">
          <DropdownMenuLabel className="flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground font-semibold">
            <span>Workspaces</span>
            <Badge variant="outline" className="text-[10px]">
              {workspaces.length}
            </Badge>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuGroup className="space-y-1">
            {workspaces.map((ws) => {
              const isSelected = ws.id === activeWorkspaceId;
              const isItemAcademy = ws.kind === 'ACADEMY';

              return (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => setActiveWorkspaceId(ws.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-xl p-2 cursor-pointer transition-colors',
                    isSelected && 'bg-accent text-accent-foreground font-semibold',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {isItemAcademy ? (
                        <Building2 className="size-3.5" aria-hidden="true" />
                      ) : (
                        <User className="size-3.5" aria-hidden="true" />
                      )}
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-xs text-foreground font-medium">
                        {ws.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span>{ws.kind === 'ACADEMY' ? 'Academy' : 'Personal'}</span>
                        <span>&bull;</span>
                        <span className="capitalize">
                          {ws.membership?.role?.toLowerCase() ?? 'member'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild className="rounded-xl p-2 cursor-pointer text-xs">
            <Link href="/onboarding" className="flex items-center gap-2">
              <PlusCircle className="size-4 text-primary" aria-hidden="true" />
              <span>Create New Workspace</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
