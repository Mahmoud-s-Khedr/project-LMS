import { siteConfig } from '@/features/marketing/site-config';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Award, BookOpen, ShieldCheck, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 md:px-12">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-lg"
          aria-label={`${siteConfig.name} home`}
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-5" aria-hidden="true" />
          </span>
          <span>
            learnspace<span className="text-primary">.</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/courses"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
          >
            Explore Catalog
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto grid w-full max-w-[1280px] flex-1 items-center gap-10 px-4 py-8 sm:px-6 md:py-12 lg:grid-cols-[1fr_460px] lg:gap-16 lg:px-12"
      >
        {/* Left Editorial Panel (Desktop) */}
        <section
          aria-label={`${siteConfig.name} platform highlights`}
          className="hidden flex-col justify-between rounded-3xl border border-border bg-card p-10 shadow-sm lg:flex"
        >
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-foreground">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              Editorial Learning &amp; Creator Studio
            </span>
            <h2 className="mt-6 text-3xl leading-tight font-semibold tracking-tight text-foreground xl:text-4xl">
              A calm, rigorous home for{' '}
              <span className="font-serif italic text-primary">meaningful</span> mastery.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Whether you are studying distributed systems, submitting a design systems capstone, or
              running a 60-seat cohort, your progress and credentials stay in sync across every
              device.
            </p>
          </div>

          <div className="my-8 grid gap-4 border-y border-border/80 py-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Session Rotation &amp; Role-Scoped Workspaces
                </h3>
                <p className="text-xs text-muted-foreground">
                  Protected by short-lived access tokens, HttpOnly refresh rotation, and granular
                  Student, Instructor, and Admin permissions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Award className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Tamper-Evident QR Certificates
                </h3>
                <p className="text-xs text-muted-foreground">
                  Complete all lessons and graded rubrics to automatically unlock public
                  verification links.
                </p>
              </div>
            </div>
          </div>

          <blockquote className="text-xs leading-relaxed text-muted-foreground">
            “It feels like reading a beautifully typeset book rather than fighting a noisy video
            portal.”
            <footer className="mt-1.5 font-semibold text-foreground">
              — Maya Lin-Soto, Senior Full-Stack Engineer
            </footer>
          </blockquote>
        </section>

        {/* Right Form Card */}
        <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-md sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
