'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, BookOpen, Compass, LayoutDashboard, Menu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { siteConfig } from '../site-config';

const PUBLIC_NAV_ITEMS = [
  { href: '/courses', label: 'Course Catalog' },
  { href: '/#value-props', label: 'For Creators & Academies' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/verify', label: 'Verify Certificate' },
] as const;

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/90 backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex h-20 max-w-[1440px] items-center justify-between px-4 sm:px-6 md:px-12 lg:px-20">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-lg"
            aria-label={`${siteConfig.name} home`}
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <span>
              {siteConfig.name}
              <span className="text-primary">.</span>
            </span>
          </Link>

          <nav aria-label="Primary public navigation" className="hidden items-center gap-1 lg:flex">
            {PUBLIC_NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/courses' ? pathname.startsWith('/courses') : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-2.5 md:flex">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="rounded-full px-4">
            <Link href="/student">
              <LayoutDashboard className="size-4" aria-hidden="true" />
              <span>Workspace</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-full px-4">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="rounded-full px-5">
            <Link href="/register">
              <span>Start learning</span>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open navigation menu"
                className="rounded-xl"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(88vw,340px)] p-6">
              <SheetHeader className="p-0 text-left">
                <SheetTitle className="flex items-center gap-2 text-lg font-bold">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BookOpen className="size-4" aria-hidden="true" />
                  </span>
                  <span>
                    {siteConfig.name}
                    <span className="text-primary">.</span>
                  </span>
                </SheetTitle>
                <SheetDescription>{siteConfig.tagline}</SheetDescription>
              </SheetHeader>

              <nav
                aria-label="Mobile public navigation"
                className="mt-6 flex flex-col gap-1.5 border-t border-border pt-6"
              >
                {PUBLIC_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <span>{item.label}</span>
                    <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
                <Link
                  href="/student"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <Compass className="size-4" aria-hidden="true" />
                    Dashboard Preview
                  </span>
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </nav>

              <div className="mt-auto flex flex-col gap-2.5 border-t border-border pt-6">
                <Button asChild variant="outline" className="w-full rounded-full">
                  <Link href="/login" onClick={() => setMobileOpen(false)}>
                    Sign in to your account
                  </Link>
                </Button>
                <Button asChild className="w-full rounded-full">
                  <Link href="/register" onClick={() => setMobileOpen(false)}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    <span>Create free account</span>
                  </Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
