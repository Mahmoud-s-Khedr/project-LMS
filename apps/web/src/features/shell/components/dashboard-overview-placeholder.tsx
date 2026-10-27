import Link from 'next/link';
import { ArrowUpRight, Layers, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardAreaId } from '../config/nav-config';

interface AreaOverviewSpec {
  badge: string;
  title: string;
  subtitle: string;
  primaryCta: { label: string; href: string };
  metrics: { label: string; value: string; delta: string }[];
  skeletonSections: {
    title: string;
    description: string;
    packageTag: string;
  }[];
}

const AREA_OVERVIEW_SPECS: Record<DashboardAreaId, AreaOverviewSpec> = {
  student: {
    badge: 'STUDENT WORKSPACE',
    title: 'Continue your learning journey',
    subtitle:
      'Your enrolled courses, upcoming cohort sessions, pending assignments, and verifiable certificates.',
    primaryCta: { label: 'Explore Course Catalog', href: '/courses' },
    metrics: [
      { label: 'Active Courses', value: '3', delta: '2 self-paced · 1 live cohort' },
      { label: 'Weekly Study Streak', value: '5.4 hrs', delta: '+1.2 hrs vs last week' },
      { label: 'Assignments Due', value: '1', delta: 'Module 2 Outbox Lab · 4 days left' },
      { label: 'Earned Certificates', value: '2', delta: 'QR verification active' },
    ],
    skeletonSections: [
      {
        title: 'Resume Playback & Active Enrollments',
        description: 'Synced HLS video progress, chapter markers, and drip schedule status.',
        packageTag: 'P2-FE-PLAYER',
      },
      {
        title: 'Upcoming Quizzes & Rubric Feedback',
        description: 'Timed assessments and instructor/TA rubric evaluations.',
        packageTag: 'P3-FE-ASSESS',
      },
    ],
  },
  instructor: {
    badge: 'INSTRUCTOR STUDIO',
    title: 'Creator & Cohort Command Center',
    subtitle:
      'Manage published curricula, schedule cohort drip releases, review TA grading queues, and track net revenue.',
    primaryCta: { label: 'Preview Public Catalog', href: '/courses' },
    metrics: [
      { label: 'Active Learners', value: '2,480', delta: '+142 enrolled this month' },
      { label: 'Cohort Completion Rate', value: '78.4%', delta: 'Cohort #11 Autumn Studio' },
      { label: 'Pending Grading Queue', value: '7', delta: 'Avg turnaround: 6.5 hrs' },
      {
        label: 'Net Studio Revenue (30d)',
        value: '$18,420',
        delta: 'Next payout scheduled Friday',
      },
    ],
    skeletonSections: [
      {
        title: 'Curriculum Authoring & Media Transcoding Pipeline',
        description: 'Course versions, section/lesson ordering, and HLS asset status.',
        packageTag: 'P2-FE-CATALOG',
      },
      {
        title: 'Submission Grading Queue & Revenue Analytics',
        description: 'Rubric scoring workflow, coupon redemptions, and retention heatmaps.',
        packageTag: 'P3-FE-ASSESS · P3-FE-COMMERCE',
      },
    ],
  },
  admin: {
    badge: 'PLATFORM & ACADEMY ADMIN',
    title: 'Governance, Moderation & Financial Ledger',
    subtitle:
      'Oversee multi-instructor workspaces, review submitted course publications, inspect orders, and audit privileged actions.',
    primaryCta: { label: 'Inspect Public Site', href: '/' },
    metrics: [
      { label: 'Total Platform Users', value: '24,610', delta: '99.4% active accounts' },
      { label: 'Courses Awaiting Review', value: '2', delta: 'SLA target: < 24 hours' },
      {
        label: 'Gross Merchandise Volume',
        value: '$142.8k',
        delta: '0 reconciliation discrepancies',
      },
      { label: 'Audit Trail Integrity', value: '100%', delta: 'All privileged mutations logged' },
    ],
    skeletonSections: [
      {
        title: 'Course Publication Moderation Queue',
        description: 'Approve or reject instructor course versions with structured review notes.',
        packageTag: 'P2-FE-CATALOG',
      },
      {
        title: 'User Governance, Ledger Refunds & Immutable Audit Logs',
        description: 'Role assignments, Stripe webhook ledger reconciliation, and security events.',
        packageTag: 'P3-FE-COMMERCE · P4-FE-OPS',
      },
    ],
  },
};

export interface DashboardOverviewPlaceholderProps {
  area: DashboardAreaId;
}

export function DashboardOverviewPlaceholder({ area }: DashboardOverviewPlaceholderProps) {
  const spec = AREA_OVERVIEW_SPECS[area];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-end">
        <div>
          <Badge variant="secondary" className="rounded-md font-semibold">
            <Sparkles className="size-3 text-primary" aria-hidden="true" />
            <span>{spec.badge}</span>
          </Badge>
          <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {spec.title}
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{spec.subtitle}</p>
        </div>

        <Button asChild variant="outline" className="shrink-0 rounded-full">
          <Link href={spec.primaryCta.href}>
            <span>{spec.primaryCta.label}</span>
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <section
        aria-label="Workspace key metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {spec.metrics.map((metric) => (
          <Card key={metric.label} className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs font-medium">{metric.label}</CardDescription>
              <CardTitle className="text-2xl font-bold tracking-tight sm:text-3xl">
                {metric.value}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs font-medium text-primary">{metric.delta}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Skeleton Placeholder Cards for Downstream Feature Packages */}
      <section aria-label="Workspace module placeholders" className="grid gap-6 lg:grid-cols-2">
        {spec.skeletonSections.map((section) => (
          <Card key={section.title} className="rounded-3xl">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Layers className="size-4 text-primary" aria-hidden="true" />
                  <span>{section.title}</span>
                </CardTitle>
                <Badge variant="outline" className="rounded-md font-mono text-[10px]">
                  {section.packageTag}
                </Badge>
              </div>
              <CardDescription className="text-xs">{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Skeleton Item 1 */}
              <div
                aria-busy="true"
                aria-label="Loading module data placeholder"
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4 max-w-[240px]" />
                    <Skeleton className="h-3 w-1/2 max-w-[160px]" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
              </div>

              {/* Skeleton Item 2 */}
              <div
                aria-busy="true"
                aria-label="Loading module data placeholder"
                className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <Skeleton className="size-11 shrink-0 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-2/3 max-w-[210px]" />
                    <Skeleton className="h-3 w-2/5 max-w-[140px]" />
                  </div>
                </div>
                <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
              </div>

              {/* Skeleton Progress Bar Footer */}
              <div className="space-y-2 pt-1">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
