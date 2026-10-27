'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle, Award, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEnrollment, useEnrollmentResults } from '@/features/player';
import { siteConfig } from '@/features/marketing/site-config';
import { ThemeToggle } from '@/components/theme-toggle';

export default function CourseResultsPage() {
  const params = useParams();
  const enrollmentId = String(params?.enrollmentId ?? '');

  const {
    data: enrollment,
    isLoading: isEnrollmentLoading,
    error: enrollmentError,
  } = useEnrollment(enrollmentId);

  const {
    data: results,
    isLoading: isResultsLoading,
  } = useEnrollmentResults(enrollmentId);

  if (isEnrollmentLoading || isResultsLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading course results...</p>
        </div>
      </div>
    );
  }

  if (enrollmentError || !enrollment) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-3" />
        <h2 className="text-lg font-bold text-foreground">Results Unavailable</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">
          {enrollmentError?.message || 'Unable to load enrollment results.'}
        </p>
        <Button size="sm" variant="outline" asChild className="mt-6">
          <Link href="/student">Back to My Courses</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href={`/learn/${enrollmentId}`}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Course Player</span>
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-xs font-semibold text-muted-foreground">
            {siteConfig.name}
          </span>
        </div>

        <ThemeToggle />
      </header>

      {/* Main Viewport */}
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b pb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
                Assessment Results & Grades
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Official released evaluation records for this course enrollment
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {!results || results.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
                No assessment grades have been published for this enrollment yet.
              </div>
            ) : (
              results.map((res) => {
                const percentNum = parseFloat(res.percent);
                const awardedNum = parseFloat(res.awardedPoints);
                const totalNum = parseFloat(res.totalPoints);

                return (
                  <div
                    key={res.attemptId}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border bg-muted/10 p-4 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          res.passed
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {res.passed ? (
                          <CheckCircle2 className="h-5 w-5" />
                        ) : (
                          <XCircle className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">
                            Attempt #{res.number}
                          </span>
                          <Badge
                            variant={res.passed ? 'default' : 'destructive'}
                            className="text-[10px]"
                          >
                            {res.passed ? 'PASSED' : 'FAILED'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Graded on {new Date(res.gradedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:text-right">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                          Score
                        </span>
                        <p className="text-base font-bold text-foreground">
                          {percentNum.toFixed(0)}%
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                          Points
                        </span>
                        <p className="text-sm font-semibold text-foreground">
                          {awardedNum.toFixed(1)} / {totalNum.toFixed(1)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
