'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { buildBreadcrumbs } from '../config/nav-config';

export interface DashboardBreadcrumbsProps {
  pathname?: string;
}

export function DashboardBreadcrumbs({ pathname: pathnameProp }: DashboardBreadcrumbsProps) {
  const currentPathname = usePathname();
  const activePath = pathnameProp ?? currentPathname ?? '/student';
  const crumbs = buildBreadcrumbs(activePath);

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.href}-${crumb.label}`} className="flex items-center gap-1.5 min-w-0">
            {index > 0 && (
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            {crumb.isCurrent ? (
              <span aria-current="page" className="truncate font-semibold text-foreground">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
