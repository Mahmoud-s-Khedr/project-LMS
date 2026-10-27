'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Globe,
  Lock,
  PlayCircle,
  Radio,
  ShieldCheck,
  Users,
  Video,
  Award,
  HelpCircle,
  ClipboardList,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useMeQuery } from '@/features/auth';
import { ApiError } from '@/lib/api';
import type { FreeEnrollment } from '@lms/shared';
import type { PublicCourseDetail, PublicOutlineLesson, CatalogPrice } from '../types';
import {
  formatDateRange,
  formatDurationMinutes,
  formatDeliveryMode,
  formatLevel,
  formatPriceMinor,
  getEnrollmentErrorMessage,
} from '../types';
import {
  useCatalogCohortsQuery,
  useCourseEnrollmentQuery,
  useEnrollFreeCourseMutation,
} from '../hooks';
import { fetchMyCourseEnrollments } from '../api';
import { RichTextRenderer } from './rich-text-renderer';
import { PreviewLessonModal } from './preview-lesson-modal';

interface CourseDetailProps {
  course: PublicCourseDetail;
}

function getLessonIcon(type: string) {
  switch (type) {
    case 'VIDEO':
      return <Video className="h-4 w-4 text-primary" />;
    case 'TEXT':
      return <FileText className="h-4 w-4 text-primary" />;
    case 'DOCUMENT':
      return <BookOpen className="h-4 w-4 text-primary" />;
    case 'INTERACTIVE':
      return <PlayCircle className="h-4 w-4 text-primary" />;
    case 'QUIZ':
      return <HelpCircle className="h-4 w-4 text-amber-500" />;
    case 'ASSIGNMENT':
      return <ClipboardList className="h-4 w-4 text-amber-500" />;
    case 'EXAM':
      return <Award className="h-4 w-4 text-rose-500" />;
    case 'LIVE_SESSION':
      return <Radio className="h-4 w-4 text-blue-500 animate-pulse" />;
    default:
      return <BookOpen className="h-4 w-4 text-primary" />;
  }
}

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return {
      push: () => {},
      replace: () => {},
      back: () => {},
      prefetch: () => {},
      forward: () => {},
      refresh: () => {},
    };
  }
}

export function CourseDetail({ course }: CourseDetailProps) {
  const router = useSafeRouter();
  const isFree = course.isFree;
  const isCohort = course.deliveryMode === 'COHORT';

  const { data: currentUser } = useMeQuery({ enabled: isFree });
  const isSignedIn = Boolean(currentUser?.id);

  const { data: existingEnrollment, refetch: refetchEnrollment } = useCourseEnrollmentQuery(
    course.id,
    { enabled: isFree && isSignedIn },
  );

  const [conflictEnrollment, setConflictEnrollment] = useState(false);
  const isAlreadyEnrolled = Boolean(existingEnrollment) || conflictEnrollment;

  const [selectedCohortId, setSelectedCohortId] = useState<string>('');
  const [enrollError, setEnrollError] = useState<{
    status?: number;
    message: string;
    is409?: boolean;
  } | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const enrollMutation = useEnrollFreeCourseMutation();
  const isEnrolling = enrollMutation.isPending;

  const [selectedPreviewLesson, setSelectedPreviewLesson] = useState<PublicOutlineLesson | null>(
    null,
  );
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(
    course.prices[0]?.priceId ?? null,
  );
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    // Expand all sections by default
    const map: Record<string, boolean> = {};
    for (const section of course.outline) {
      map[section.sectionId] = true;
    }
    return map;
  });

  const { data: cohortsData } = useCatalogCohortsQuery(course.id, {
    enabled: isCohort || course.outline.length > 0,
  });
  const cohorts = cohortsData?.data ?? [];

  const handleEnroll = async (isRetry = false) => {
    if (isCohort && !selectedCohortId) {
      setEnrollError({
        status: 400,
        message: 'Please select a cohort to enroll.',
      });
      return;
    }

    let key = idempotencyKeyRef.current;
    if (!isRetry || !key) {
      key = crypto.randomUUID();
      idempotencyKeyRef.current = key;
    }

    setEnrollError(null);

    try {
      const body: FreeEnrollment = isCohort ? { cohortId: selectedCohortId } : {};
      const enrollment = await enrollMutation.mutateAsync({
        courseId: course.id,
        body,
        idempotencyKey: key,
      });

      idempotencyKeyRef.current = null;
      router.push(`/learn/${enrollment.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const is409 = err.status === 409;
        if (is409) {
          setConflictEnrollment(true);
          void refetchEnrollment();
        }
        setEnrollError({
          status: err.status,
          message: getEnrollmentErrorMessage(err),
          is409,
        });
      } else if (err instanceof Error) {
        setEnrollError({ message: err.message });
      } else {
        setEnrollError({ message: 'An unexpected error occurred during enrollment.' });
      }
    }
  };

  const handleGoToCourse = async () => {
    if (existingEnrollment?.id) {
      router.push(`/learn/${existingEnrollment.id}`);
      return;
    }
    try {
      const found = await fetchMyCourseEnrollments(course.id);
      if (found?.id) {
        router.push(`/learn/${found.id}`);
        return;
      }
    } catch {
      // fallback
    }
    router.push('/student/courses');
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const expandAll = () => {
    const map: Record<string, boolean> = {};
    for (const s of course.outline) map[s.sectionId] = true;
    setExpandedSections(map);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  const selectedPrice: CatalogPrice | undefined =
    course.prices.find((p) => p.priceId === selectedPriceId) ?? course.prices[0];

  const totalLessons = course.outline.reduce((acc, sec) => acc + sec.lessons.length, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumbs */}
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-xs text-muted-foreground"
      >
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/courses" className="hover:text-foreground">
          Courses
        </Link>
        <span>/</span>
        <span className="truncate max-w-[250px] font-medium text-foreground">{course.title}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-3">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-10">
          {/* Header Info */}
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant={isCohort ? 'default' : 'secondary'}>
                {formatDeliveryMode(course.deliveryMode)}
              </Badge>
              {course.level && <Badge variant="outline">{formatLevel(course.level)}</Badge>}
              {course.language && (
                <Badge variant="outline" className="uppercase">
                  <Globe className="mr-1 h-3 w-3 inline" />
                  {course.language}
                </Badge>
              )}
              {course.isFree && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                >
                  Free Enrollment
                </Badge>
              )}
            </div>

            <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              {course.title}
            </h1>

            {course.summary && (
              <p className="mt-4 text-lg text-muted-foreground leading-relaxed">{course.summary}</p>
            )}

            {/* Quick Stats Bar */}
            <div className="mt-6 flex flex-wrap items-center gap-6 border-y border-border/70 py-4 text-sm text-muted-foreground">
              {course.estimatedMinutes > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{formatDurationMinutes(course.estimatedMinutes)} total content</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span>
                  {course.outline.length} {course.outline.length === 1 ? 'module' : 'modules'} •{' '}
                  {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
                </span>
              </div>
              {isCohort && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span>Scheduled cohort releases</span>
                </div>
              )}
            </div>
          </div>

          {/* Course Description */}
          {course.description && (
            <div className="space-y-4">
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                About this course
              </h2>
              <div className="rounded-xl border border-border/60 bg-card p-6 shadow-xs">
                <RichTextRenderer content={course.description} />
              </div>
            </div>
          )}

          {/* Curriculum Outline Accordion */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                  Curriculum & Syllabus
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Safe outline projection with approved free previews.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  Expand all
                </Button>
                <span className="text-border">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  Collapse all
                </Button>
              </div>
            </div>

            {course.outline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                <p>Curriculum outline is being finalized by the instructor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {course.outline.map((section, sIdx) => {
                  const isExpanded = expandedSections[section.sectionId] ?? true;
                  return (
                    <div
                      key={section.sectionId}
                      className="overflow-hidden rounded-xl border border-border/70 bg-card transition-colors"
                    >
                      {/* Section Header */}
                      <button
                        type="button"
                        onClick={() => toggleSection(section.sectionId)}
                        className="flex w-full items-center justify-between p-4 text-left font-medium transition-colors hover:bg-muted/40"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {sIdx + 1}
                          </span>
                          <span className="font-semibold text-foreground text-sm sm:text-base">
                            {section.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {section.lessons.length}{' '}
                            {section.lessons.length === 1 ? 'lesson' : 'lessons'}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {/* Section Lessons */}
                      {isExpanded && (
                        <div className="border-t border-border/60 divide-y divide-border/40 bg-muted/10">
                          {section.lessons.map((lesson) => {
                            const isProtected = [
                              'QUIZ',
                              'ASSIGNMENT',
                              'EXAM',
                              'LIVE_SESSION',
                            ].includes(lesson.type);

                            return (
                              <div
                                key={lesson.lessonId}
                                className="flex items-center justify-between p-3.5 px-4 text-sm hover:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-center gap-3 min-w-0 pr-4">
                                  {getLessonIcon(lesson.type)}
                                  <span className="truncate text-foreground font-medium text-xs sm:text-sm">
                                    {lesson.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                  {lesson.estimatedMinutes > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatDurationMinutes(lesson.estimatedMinutes)}
                                    </span>
                                  )}

                                  {lesson.isPreview ? (
                                    <Button
                                      size="sm"
                                      variant="secondary"
                                      onClick={() => setSelectedPreviewLesson(lesson)}
                                      className="h-7 gap-1 px-2.5 text-xs font-semibold text-primary"
                                    >
                                      <PlayCircle className="h-3 w-3" />
                                      Preview
                                    </Button>
                                  ) : isProtected ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] text-muted-foreground gap-1 border-muted"
                                    >
                                      <Lock className="h-2.5 w-2.5" />
                                      Enrolled only
                                    </Badge>
                                  ) : (
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cohorts Schedule (if cohort course or cohorts available) */}
          {cohorts.length > 0 && (
            <div className="space-y-4">
              <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                Upcoming Cohort Schedules
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                {cohorts.map((cohort) => (
                  <Card key={cohort.id} className="border-border/70 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-sm">{cohort.name}</span>
                      {cohort.seatsAvailable !== null && (
                        <Badge
                          variant={cohort.seatsAvailable > 0 ? 'secondary' : 'destructive'}
                          className="text-xs"
                        >
                          {cohort.seatsAvailable > 0
                            ? `${cohort.seatsAvailable} seats left`
                            : 'Cohort Full'}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        Dates: {formatDateRange(cohort.startsAt, cohort.endsAt)}
                      </p>
                      {cohort.enrollmentClosesAt && (
                        <p className="text-[11px] text-muted-foreground/80">
                          Registration closes{' '}
                          {new Date(cohort.enrollmentClosesAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Sticky Pricing & Action Card */}
        <div className="space-y-6">
          <Card className="sticky top-20 border border-border/80 shadow-xl overflow-hidden bg-card">
            {/* Media Banner or Cover */}
            {course.coverUrl && (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={course.coverUrl}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <CardHeader className="p-6 pb-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tuition & Access
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    {course.isFree ? (
                      <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                        Free
                      </span>
                    ) : selectedPrice ? (
                      <span className="text-3xl font-extrabold text-foreground">
                        {formatPriceMinor(
                          selectedPrice.amount,
                          selectedPrice.currency,
                          selectedPrice.interval,
                          selectedPrice.intervalCount,
                        )}
                      </span>
                    ) : (
                      <span className="text-xl font-bold text-foreground">Free Access</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Price Selector if multiple prices exist */}
              {course.prices.length > 1 && (
                <div className="mt-4 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Select a plan:
                  </label>
                  <div className="space-y-1.5">
                    {course.prices.map((p) => (
                      <button
                        key={p.priceId}
                        type="button"
                        onClick={() => setSelectedPriceId(p.priceId)}
                        className={`w-full rounded-md border p-2.5 text-left text-xs transition-all ${
                          selectedPriceId === p.priceId
                            ? 'border-primary bg-primary/5 font-semibold text-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span>
                            {p.interval ? `${p.interval.toLowerCase()}ly plan` : 'One-time access'}
                          </span>
                          <span>
                            {formatPriceMinor(p.amount, p.currency, p.interval, p.intervalCount)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-6 pt-0 space-y-6">
              {/* Free Course Enrollment Flow */}
              {isFree ? (
                <div className="space-y-4">
                  {/* Cohort Selector when Delivery Mode Requires One */}
                  {isCohort && !isAlreadyEnrolled && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="cohort-select"
                        className="text-xs font-medium text-foreground"
                      >
                        Select Cohort <span className="text-destructive">*</span>
                      </label>
                      <select
                        id="cohort-select"
                        value={selectedCohortId}
                        onChange={(e) => {
                          setSelectedCohortId(e.target.value);
                          idempotencyKeyRef.current = null;
                          setEnrollError(null);
                        }}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Choose an upcoming cohort</option>
                        {cohorts.map((cohort) => {
                          const isFull =
                            cohort.seatsAvailable !== null && cohort.seatsAvailable <= 0;
                          return (
                            <option key={cohort.id} value={cohort.id} disabled={isFull}>
                              {cohort.name} ({formatDateRange(cohort.startsAt, cohort.endsAt)})
                              {cohort.seatsAvailable !== null
                                ? ` - ${cohort.seatsAvailable > 0 ? `${cohort.seatsAvailable} seats left` : 'Full'}`
                                : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Inline Error Message */}
                  {enrollError && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-2"
                    >
                      <p>{enrollError.message}</p>
                      {!enrollError.is409 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleEnroll(true)}
                          disabled={isEnrolling}
                          className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/20"
                        >
                          Try again
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Enrollment Action Buttons */}
                  <div className="space-y-2">
                    {!isSignedIn ? (
                      <Button
                        asChild
                        size="lg"
                        className="w-full text-base font-semibold shadow-md"
                      >
                        <Link href={`/login?redirect=/courses/${course.slug}`}>
                          Sign in to enroll
                        </Link>
                      </Button>
                    ) : isAlreadyEnrolled ? (
                      existingEnrollment?.id ? (
                        <Button
                          asChild
                          size="lg"
                          className="w-full text-base font-semibold shadow-md"
                        >
                          <Link href={`/learn/${existingEnrollment.id}`}>Go to course</Link>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="lg"
                          className="w-full text-base font-semibold shadow-md"
                          onClick={handleGoToCourse}
                        >
                          Go to course
                        </Button>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="lg"
                        className="w-full text-base font-semibold shadow-md"
                        onClick={() => handleEnroll(false)}
                        disabled={isEnrolling}
                      >
                        {isEnrolling ? 'Enrolling...' : 'Enroll for free'}
                      </Button>
                    )}

                    <p className="text-center text-[11px] text-muted-foreground">
                      {isAlreadyEnrolled
                        ? 'You have active access to this course'
                        : 'Instant access upon enrollment • 100% Free'}
                    </p>
                  </div>
                </div>
              ) : (
                /* Paid Course Existing Checkout Flow Unchanged */
                <div className="space-y-2">
                  <Button asChild size="lg" className="w-full text-base font-semibold shadow-md">
                    <Link href={`/register?redirect=/courses/${course.slug}`}>Enroll Now</Link>
                  </Button>

                  <p className="text-center text-[11px] text-muted-foreground">
                    Instant access upon enrollment • Secure checkout
                  </p>
                </div>
              )}

              {/* Course Inclusions Checklist */}
              <div className="space-y-3 border-t border-border/70 pt-5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    {isCohort
                      ? 'Live cohort sessions & instructor access'
                      : 'Full lifetime access to course contents'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Interactive quizzes and guided exercises</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Verified certificate of completion</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Accessible on desktop, tablet, and mobile</span>
                </div>
              </div>

              {/* Trust Badge */}
              <div className="rounded-lg bg-muted/40 p-3 flex items-center gap-3 text-xs text-muted-foreground border border-border/40">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <span>Protected by 30-day money-back guarantee. Zero risk.</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Free Preview Modal */}
      <PreviewLessonModal
        courseId={course.id}
        lesson={selectedPreviewLesson}
        isOpen={Boolean(selectedPreviewLesson)}
        onClose={() => setSelectedPreviewLesson(null)}
      />
    </div>
  );
}
