'use client';

import * as React from 'react';
import type { Me } from '@lms/shared';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen,
  Compass,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';
import { useLogoutMutation } from '@/features/auth';
import {
  DASHBOARD_NAV_CONFIG,
  extractEffectiveRoles,
  getAccessibleAreas,
  getNavSectionsForArea,
  isNavItemActive,
  resolveAreaFromPathname,
  type DashboardAreaId,
  type NavItemConfig,
} from '../config/nav-config';
import { WorkspaceSwitcher } from '@/features/workspaces';
import { DashboardBreadcrumbs } from './breadcrumbs';
import { NavIcon } from './nav-icon';
import { DashboardSessionGuard } from './dashboard-session-guard';
import { NotificationBell } from './notification-bell';
import { siteConfig } from '@/features/marketing/site-config';

export interface DashboardShellProps {
  children: React.ReactNode;
  /** Optional custom nav items injected by feature packages. */
  extraNavItems?: Partial<Record<DashboardAreaId, readonly NavItemConfig[]>>;
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <DashboardSessionGuard>
      {(me) => <DashboardShellContent {...props} me={me} />}
    </DashboardSessionGuard>
  );
}

function DashboardShellContent({ children, extraNavItems, me }: DashboardShellProps & { me: Me }) {
  const pathname = usePathname() || '/student';
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  const logoutMutation = useLogoutMutation();

  const effectiveRoles = React.useMemo(() => extractEffectiveRoles(me), [me]);

  const currentAreaId = resolveAreaFromPathname(pathname);
  const currentArea = DASHBOARD_NAV_CONFIG[currentAreaId];
  const accessibleAreas = React.useMemo(() => getAccessibleAreas(effectiveRoles), [effectiveRoles]);

  const navSections = React.useMemo(
    () => getNavSectionsForArea(currentAreaId, effectiveRoles, extraNavItems?.[currentAreaId]),
    [currentAreaId, effectiveRoles, extraNavItems],
  );

  const displayUser = {
    name: me.name,
    email: me.email,
    primaryRole:
      me.platformRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : (me.memberships?.[0]?.role ?? 'STUDENT'),
    initials: me.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  };

  async function handleSignOut() {
    await logoutMutation.mutateAsync();
    router.push('/login');
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      router.push(`/courses?search=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to workspace content
      </a>

      {/* Desktop Collapsible Sidebar */}
      <aside
        aria-label={`${currentArea.label} navigation`}
        className={cn(
          'hidden shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex',
          sidebarCollapsed ? 'w-[76px]' : 'w-68',
        )}
      >
        {/* Brand + Collapse Button */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 overflow-hidden font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none rounded-lg"
            aria-label={`${siteConfig.name} home`}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <BookOpen className="size-4" aria-hidden="true" />
            </span>
            {!sidebarCollapsed && (
              <span className="truncate text-lg">
                learnspace<span className="text-primary">.</span>
              </span>
            )}
          </Link>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Role-Aware Workspace Area Switcher */}
        {!sidebarCollapsed && accessibleAreas.length > 1 && (
          <div className="border-b border-sidebar-border p-3">
            <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              Switch Workspace Area
            </p>
            <div
              role="navigation"
              aria-label="Workspace area switcher"
              className="grid grid-cols-3 gap-1 rounded-xl bg-sidebar-accent/70 p-1"
            >
              {accessibleAreas.map((area) => {
                const active = area.id === currentAreaId;
                return (
                  <Link
                    key={area.id}
                    href={area.basePath}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-center text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                      active
                        ? 'bg-background text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {area.shortLabel}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <nav
          aria-label="Primary workspace navigation"
          className="flex-1 space-y-6 overflow-y-auto px-3 py-4"
        >
          {navSections.map((section) => (
            <div key={section.id}>
              {!sidebarCollapsed && (
                <h2 className="mb-2 px-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {section.title}
                </h2>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        title={sidebarCollapsed ? item.label : undefined}
                        aria-label={sidebarCollapsed ? item.label : undefined}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center justify-between gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
                          active
                            ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-2xs'
                            : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                          sidebarCollapsed && 'justify-center px-0',
                        )}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <NavIcon name={item.iconName} className="size-4 shrink-0" />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </span>
                        {!sidebarCollapsed && item.badge && (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                              active
                                ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground'
                                : 'bg-sidebar-accent text-sidebar-accent-foreground',
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-sidebar-border p-3">
          <Link
            href="/courses"
            title={sidebarCollapsed ? 'Public Course Catalog' : undefined}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border border-sidebar-border bg-background/60 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-sidebar-accent',
              sidebarCollapsed && 'justify-center px-0',
            )}
          >
            <Compass className="size-4 shrink-0 text-primary" aria-hidden="true" />
            {!sidebarCollapsed && <span>Browse Public Catalog</span>}
          </Link>
        </div>
      </aside>

      {/* Main Content Area (Top Bar + Viewport) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile Drawer Trigger */}
            <div className="md:hidden">
              <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Open workspace navigation drawer"
                    className="rounded-xl"
                  >
                    <Menu className="size-4" aria-hidden="true" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[min(88vw,320px)] p-5">
                  <SheetHeader className="p-0 text-left">
                    <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                        <BookOpen className="size-4" aria-hidden="true" />
                      </span>
                      <span>
                        learnspace<span className="text-primary">.</span>
                      </span>
                    </SheetTitle>
                    <SheetDescription>{currentArea.label}</SheetDescription>
                  </SheetHeader>

                  {/* Mobile Area Switcher */}
                  <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
                    {accessibleAreas.map((area) => {
                      const active = area.id === currentAreaId;
                      return (
                        <Link
                          key={area.id}
                          href={area.basePath}
                          onClick={() => setMobileDrawerOpen(false)}
                          className={cn(
                            'rounded-lg px-2 py-1.5 text-center text-xs font-semibold',
                            active
                              ? 'bg-background text-foreground shadow-2xs'
                              : 'text-muted-foreground',
                          )}
                        >
                          {area.shortLabel}
                        </Link>
                      );
                    })}
                  </div>

                  {/* Mobile Nav Sections */}
                  <nav
                    aria-label="Mobile workspace navigation"
                    className="mt-4 flex-1 space-y-5 overflow-y-auto"
                  >
                    {navSections.map((section) => (
                      <div key={section.id}>
                        <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                          {section.title}
                        </p>
                        <ul className="space-y-1">
                          {section.items.map((item) => {
                            const active = isNavItemActive(pathname, item);
                            return (
                              <li key={item.id}>
                                <Link
                                  href={item.href}
                                  onClick={() => setMobileDrawerOpen(false)}
                                  className={cn(
                                    'flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium',
                                    active
                                      ? 'bg-primary text-primary-foreground'
                                      : 'text-foreground hover:bg-muted',
                                  )}
                                >
                                  <span className="flex items-center gap-2.5">
                                    <NavIcon name={item.iconName} className="size-4" />
                                    <span>{item.label}</span>
                                  </span>
                                  {item.badge && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {item.badge}
                                    </Badge>
                                  )}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>
            </div>

            <WorkspaceSwitcher className="hidden sm:flex" />
            <DashboardBreadcrumbs pathname={pathname} />
          </div>

          {/* Right Top Bar Controls: Search, Notifications, Theme Toggle, User Menu */}
          <div className="flex items-center gap-2 sm:gap-3">
            <form
              role="search"
              onSubmit={handleSearchSubmit}
              className="relative hidden sm:block sm:w-52 lg:w-68"
            >
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search workspace and courses"
                placeholder="Search courses or modules..."
                className="h-9 rounded-full pl-8.5 text-xs"
              />
            </form>

            <NotificationBell />

            <ThemeToggle />

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Open user account menu"
                  className="gap-2 rounded-full pl-1.5 pr-3"
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
                    aria-hidden="true"
                  >
                    {displayUser.initials}
                  </span>
                  <span className="hidden max-w-28 truncate text-xs font-medium lg:inline">
                    {displayUser.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
                <DropdownMenuLabel className="px-2.5 py-2">
                  <p className="text-xs font-semibold text-foreground">{displayUser.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{displayUser.email}</p>
                  <Badge variant="secondary" className="mt-1.5 rounded-md text-[10px]">
                    {displayUser.primaryRole}
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/student" className="cursor-pointer rounded-lg">
                      <UserIcon className="size-4" aria-hidden="true" />
                      <span>Student Workspace</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/instructor" className="cursor-pointer rounded-lg">
                      <Sparkles className="size-4" aria-hidden="true" />
                      <span>Instructor Studio</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer rounded-lg">
                      <Compass className="size-4" aria-hidden="true" />
                      <span>Admin Console</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleSignOut}
                  className="cursor-pointer rounded-lg"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main id="dashboard-main" className="flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
