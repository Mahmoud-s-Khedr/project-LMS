'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Award,
  BookOpen,
  Building2,
  Check,
  ChevronDown,
  GraduationCap,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  Video,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useCatalogCoursesQuery, CourseCard } from '@/features/catalog';
import { FAQ_ITEMS, VALUE_PROP_GROUPS } from '@/features/marketing/data/mock-data';
import type { ValuePropPersona } from '@/features/marketing/data/types';
import { siteConfig, type SiteConfig } from '../site-config';

const PERSONA_ICONS: Record<ValuePropPersona, React.ComponentType<{ className?: string }>> = {
  instructors: Video,
  academies: Building2,
  students: GraduationCap,
};

export interface LandingPageProps {
  config?: SiteConfig;
}

export function LandingPage({ config = siteConfig }: LandingPageProps = {}) {
  const [openFaqId, setOpenFaqId] = React.useState<string | null>(FAQ_ITEMS[0]?.id ?? null);

  // Live queries backed by the real public catalog and product APIs
  const {
    data: catalogData,
    isLoading: isLoadingCourses,
    isError: isCourseError,
    refetch: refetchCourses,
  } = useCatalogCoursesQuery({ limit: 4, sort: 'publishedAt' });

  const featuredCourses = catalogData?.data ?? [];

  return (
    <div className="mx-auto max-w-[1440px] px-4 sm:px-6 md:px-12 lg:px-20">
      {/* 1. HERO SECTION */}
      <section className="grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:py-24">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/70 px-3.5 py-1.5 text-xs font-medium text-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            <span>Where rigorous craft meets modern cohort learning</span>
          </div>

          <h1 className="max-w-2xl text-4xl leading-[1.07] font-semibold tracking-[-0.045em] text-foreground sm:text-5xl xl:text-6xl">
            Depth for learners. <span className="font-serif italic text-primary">Sovereignty</span>{' '}
            for educators.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {config.name} unites self-paced studio courses, live cohort bootcamps, rubric-graded
            assignments, and verifiable credentials inside one calm, distraction-free workspace.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-7">
              <Link href="/courses">
                <span>Explore Course Catalog</span>
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <Link href="/register?role=instructor">Launch Creator Studio</Link>
            </Button>
          </div>

          {config.stats && config.stats.length > 0 && (
            <dl
              className={cn(
                'mt-10 grid gap-4 border-t border-border/80 pt-7 sm:gap-8',
                config.stats.length === 1 && 'grid-cols-1',
                config.stats.length === 2 && 'grid-cols-2',
                config.stats.length >= 3 && 'grid-cols-3',
              )}
            >
              {config.stats.map((stat, idx) => (
                <div key={stat.id ?? `${stat.label}-${idx}`}>
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* Illustrative Product Preview */}
        <div
          className="relative mx-auto w-full max-w-xl"
          aria-label={`Preview of the ${config.name} learning and cohort workspace`}
        >
          <div
            className="absolute -inset-3 rounded-[2.25rem] bg-secondary/60 blur-sm dark:bg-secondary/30"
            aria-hidden="true"
          />
          <div className="relative rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-4">
              <div className="flex items-center gap-2">
                <Badge className="rounded-md bg-primary/15 text-primary hover:bg-primary/20">
                  STUDIO WORKSPACE
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">
                  Interactive Course Delivery
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Multi-Modal Learning
              </span>
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-border/80 bg-[#dce7d5] p-5 text-[#223428] dark:bg-[#223225] dark:text-[#e4efe4]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider uppercase opacity-80">
                    Course Curriculum &amp; Modules
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">
                    Modular Lesson &amp; Cohort Delivery
                  </h2>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-md">
                  <Play className="ml-0.5 size-4 fill-current" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-5 space-y-2.5">
                <div className="flex items-center gap-2.5 rounded-lg bg-background/40 px-3 py-2 text-xs font-medium backdrop-blur-xs">
                  <BookOpen className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span className="truncate">Structured Video Lessons</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg bg-background/40 px-3 py-2 text-xs font-medium backdrop-blur-xs">
                  <Layers className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  <span className="truncate">Cohorts &amp; Release Scheduling</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border/80 bg-muted/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Layers className="size-4 text-primary" aria-hidden="true" />
                  <span>Rubric Lab Submissions</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Structured assessment criteria with instructor feedback.
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-muted/40 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Award className="size-4 text-primary" aria-hidden="true" />
                  <span>Verifiable Credentials</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Automated PDF certificate with public verification on completion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. VALUE PROPS FOR INSTRUCTORS, ACADEMIES, AND STUDENTS */}
      <section
        id="value-props"
        aria-labelledby="value-props-heading"
        className="scroll-mt-24 border-t border-border py-16 md:py-24"
      >
        <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Built for every side of the classroom
            </p>
            <h2
              id="value-props-heading"
              className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              One architecture. Three tailored workspaces.
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            No bloated university hierarchies. Clean, high-throughput workflows built for
            independent creators, multi-seat academies, and serious learners.
          </p>
        </div>

        <Tabs defaultValue="instructors" className="w-full">
          <TabsList className="mb-8 grid w-full grid-cols-3 rounded-full bg-secondary p-1">
            {VALUE_PROP_GROUPS.map((group) => {
              const Icon = PERSONA_ICONS[group.id];
              return (
                <TabsTrigger
                  key={group.id}
                  value={group.id}
                  className="gap-2 rounded-full py-2.5 text-xs font-semibold sm:text-sm"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{group.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {VALUE_PROP_GROUPS.map((group) => (
            <TabsContent key={group.id} value={group.id}>
              <div className="rounded-3xl border border-border bg-card p-6 sm:p-10">
                <div className="max-w-2xl">
                  <h3 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {group.headline}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                    {group.description}
                  </p>
                </div>

                <div className="mt-8 grid gap-6 md:grid-cols-3">
                  {group.points.map((point) => (
                    <div
                      key={point.title}
                      className="rounded-2xl border border-border/80 bg-background/50 p-5"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Check className="size-4" aria-hidden="true" />
                        </span>
                        <div>
                          <h4 className="text-base font-semibold text-foreground">{point.title}</h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                            {point.detail}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      {/* 3. FEATURED COURSES - REAL API SOURCED WITH GRACEFUL EMPTY STATE */}
      <section
        aria-labelledby="featured-courses-heading"
        className="border-t border-border py-16 md:py-24"
      >
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Curated Studio Curriculum
            </p>
            <h2
              id="featured-courses-heading"
              className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Featured Courses &amp; Live Cohorts
            </h2>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/courses">
              <span>View all courses</span>
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {isLoadingCourses ? (
          <div
            className="grid gap-6 md:grid-cols-2"
            aria-busy="true"
            aria-label="Loading featured courses"
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col rounded-2xl border border-border/60 bg-card p-5 space-y-4"
              >
                <Skeleton className="aspect-[16/9] w-full rounded-xl" />
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : isCourseError ? (
          <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
            <p className="text-sm font-semibold text-foreground">
              Curriculum catalog is currently syncing
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Explore our full catalog directory to discover live and self-paced programs.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button size="sm" variant="outline" onClick={() => refetchCourses()}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
              <Button size="sm" asChild>
                <Link href="/courses">Browse Catalog</Link>
              </Button>
            </div>
          </div>
        ) : featuredCourses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 bg-card p-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="font-serif text-xl font-bold tracking-tight">
              Upcoming Studio Courses in Preparation
            </h3>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto">
              Our instructors and partner academies are authoring new curriculum modules and cohort
              schedules. Check back shortly or browse upcoming course categories.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild size="sm" variant="default" className="rounded-full">
                <Link href="/courses">Browse Course Categories</Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="rounded-full">
                <Link href="/register?role=instructor">Become an Instructor</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {featuredCourses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      {/* 5. TESTIMONIALS (rendered only when provided by config) */}
      {config.testimonials && config.testimonials.length > 0 && (
        <section
          id="testimonials"
          aria-labelledby="testimonials-heading"
          className="border-t border-border py-16 md:py-24"
        >
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Community Stories
            </p>
            <h2
              id="testimonials-heading"
              className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Trusted by creators and learners.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {config.testimonials.map((t) => (
              <figure
                key={t.id}
                className="flex flex-col justify-between rounded-3xl border border-border bg-card p-6 sm:p-7"
              >
                {t.rating && (
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="size-4 fill-current" aria-hidden="true" />
                    ))}
                  </div>
                )}
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-border/80 pt-4">
                  {t.initials && (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-xs text-foreground">
                      {t.initials}
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.authorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.authorTitle}
                      {t.organization ? ` · ${t.organization}` : ''}
                    </div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* 6. ACCESSIBLE FAQ ACCORDION */}
      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="border-t border-border py-16 md:py-24"
      >
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Frequently Asked Questions
            </p>
            <h2
              id="faq-heading"
              className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
            >
              Everything you need to know about {config.name}.
            </h2>
          </div>

          <div className="mt-12 space-y-3">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openFaqId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-card transition-colors"
                >
                  <h3>
                    <button
                      type="button"
                      id={`faq-btn-${item.id}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${item.id}`}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      className="flex w-full items-center justify-between p-5 text-left text-sm font-semibold text-foreground sm:text-base"
                    >
                      <span>{item.question}</span>
                      <ChevronDown
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          isOpen && 'rotate-180 text-foreground',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </h3>
                  {isOpen && (
                    <div
                      id={`faq-panel-${item.id}`}
                      role="region"
                      aria-labelledby={`faq-btn-${item.id}`}
                      className="border-t border-border/70 px-5 pt-3 pb-5 text-sm leading-relaxed text-muted-foreground"
                    >
                      {item.answer}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 7. BOTTOM CTA */}
      <section className="mb-16 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-secondary/40 to-background p-8 text-center sm:p-14">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Start learning with dedicated practitioners today.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Explore studio courses, live cohorts, and comprehensive learning paths designed for real
          mastery.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-full px-8">
            <Link href="/courses">Browse Catalog</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8">
            <Link href="/register">Create Free Account</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
