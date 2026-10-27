import Link from 'next/link';
import { BookOpen, Globe2, ShieldCheck, Sparkles } from 'lucide-react';
import { siteConfig } from '../site-config';

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card/50 text-foreground">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-6 md:px-12 lg:px-20">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight"
              aria-label={`${siteConfig.name} home`}
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <BookOpen className="size-5" aria-hidden="true" />
              </span>
              <span>
                {siteConfig.name}
                <span className="text-primary">.</span>
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              An editorial learning platform and creator commerce studio. Built for practitioners,
              independent instructors, and multi-instructor academies.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                Verifiable QR Certificates
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1">
                <Globe2 className="size-3.5 text-primary" aria-hidden="true" />
                Multi-currency & Multilingual
              </span>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Catalog & Learning
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/courses" className="transition-colors hover:text-foreground">
                  Browse All Courses
                </Link>
              </li>
              <li>
                <Link
                  href="/courses?deliveryMode=COHORT"
                  className="transition-colors hover:text-foreground"
                >
                  Live Cohort Studios
                </Link>
              </li>
              <li>
                <Link
                  href="/courses?price=FREE"
                  className="transition-colors hover:text-foreground"
                >
                  Free Open Courses
                </Link>
              </li>
              <li>
                <Link href="/products" className="transition-colors hover:text-foreground">
                  Browse Products
                </Link>
              </li>
              <li>
                <Link href="/verify" className="transition-colors hover:text-foreground">
                  Verify a Certificate
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Workspaces
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/student" className="transition-colors hover:text-foreground">
                  Student Workspace
                </Link>
              </li>
              <li>
                <Link href="/instructor" className="transition-colors hover:text-foreground">
                  Instructor Studio
                </Link>
              </li>
              <li>
                <Link href="/admin" className="transition-colors hover:text-foreground">
                  Academy & Platform Admin
                </Link>
              </li>
              <li>
                <Link
                  href="/register?role=instructor"
                  className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                >
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  Become an Instructor
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
              Account & Access
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>
                <Link href="/login" className="transition-colors hover:text-foreground">
                  Sign In
                </Link>
              </li>
              <li>
                <Link href="/register" className="transition-colors hover:text-foreground">
                  Create Account
                </Link>
              </li>
              <li>
                <Link href="/forgot-password" className="transition-colors hover:text-foreground">
                  Reset Password
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="transition-colors hover:text-foreground">
                  Help & FAQ
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()} {siteConfig.footerLegalName}. Crafted for deliberate
            learning.
          </p>
          <div className="flex flex-wrap gap-6">
            <span>WCAG 2.2 AA Accessible</span>
            <span>Privacy & GDPR Ready</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
