'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Me } from '@lms/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useMeQuery } from '@/features/auth/hooks';
import {
  canAccessArea,
  extractEffectiveRoles,
  resolveAreaFromPathname,
  resolveDefaultDashboardPath,
} from '../config/nav-config';

export function DashboardSessionGuard({ children }: { children: (me: Me) => ReactNode }) {
  const pathname = usePathname() || '/student';
  const router = useRouter();
  // The existing client handles a missing/expired access token with its shared,
  // browser-coordinated refresh, then retries /me. Never rotate outside it.
  const { data: me, isPending, isError } = useMeQuery();
  const authenticated = !isPending && !isError && me?.status === 'ACTIVE';
  const roles = extractEffectiveRoles(me);
  const allowed = authenticated && canAccessArea(resolveAreaFromPathname(pathname), roles);
  const defaultPath = resolveDefaultDashboardPath(roles);

  useEffect(() => {
    if (isPending) return;
    if (!authenticated) {
      const params = new URLSearchParams({ redirect: `${pathname}${window.location.search}` });
      router.replace(`/login?${params.toString()}`);
    } else if (!allowed) {
      router.replace(defaultPath);
    }
  }, [isPending, authenticated, allowed, defaultPath, pathname, router]);

  if (!allowed || !me) {
    return (
      <div role="status" aria-label="Loading your workspace" className="space-y-6 p-8">
        <span className="sr-only">Loading your workspace</span>
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return children(me);
}
