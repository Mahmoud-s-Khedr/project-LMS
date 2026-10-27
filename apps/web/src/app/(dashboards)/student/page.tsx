'use client';

import * as React from 'react';
import Link from 'next/link';
import { Award, BookOpen, Compass, GraduationCap, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMeQuery } from '@/features/auth';
import {
  ContinueLearningSection,
  OverviewStats,
  useMyEnrollmentsQuery,
  useStudentAnalyticsQuery,
} from '@/features/student';

export default function StudentOverviewPage() {
  const { data: me } = useMeQuery();
  const { data: analytics, isLoading: isAnalyticsLoading } = useStudentAnalyticsQuery();
  const { data: enrollmentsData, isLoading: isEnrollmentsLoading } = useMyEnrollmentsQuery();

  const userName = me?.name ? me.name.split(' ')[0] : 'Learner';
  const enrollments = enrollmentsData?.data || [];

  return (
    <div className="space-y-8 pb-10">
      {/* Welcome Banner */}
      <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card to-primary/5 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                <Sparkles className="size-3" />
                Student Workspace
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Welcome back, {userName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Track your course progression, resume lessons, and access verifiable completion
              certificates.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="sm">
              <Link href="/courses">
                <Compass className="mr-2 size-4" />
                Explore Courses
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/student/certificates">
                <Award className="mr-2 size-4" />
                My Certificates
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Overview Stats */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Learning Activity & Progression
        </h2>
        <OverviewStats analytics={analytics} isLoading={isAnalyticsLoading} />
      </div>

      {/* Continue Learning Section */}
      <ContinueLearningSection enrollments={enrollments} isLoading={isEnrollmentsLoading} />

      {/* Quick Navigation Cards */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace Hub
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="rounded-xl bg-primary/10 p-2.5 text-primary w-fit">
                <BookOpen className="size-5" />
              </div>
              <CardTitle className="text-base font-semibold pt-2">My Enrollments</CardTitle>
              <CardDescription className="text-xs">
                View curriculum outlines, access grants, and course history.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start px-0 text-xs text-primary"
              >
                <Link href="/student/enrollments">Manage Enrollments →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="rounded-xl bg-blue-500/10 p-2.5 text-blue-500 w-fit">
                <GraduationCap className="size-5" />
              </div>
              <CardTitle className="text-base font-semibold pt-2">Assessment Results</CardTitle>
              <CardDescription className="text-xs">
                Permanent grade history, rubrics, and instructor feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start px-0 text-xs text-blue-500"
              >
                <Link href="/student/results">View Gradebook →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-500 w-fit">
                <Award className="size-5" />
              </div>
              <CardTitle className="text-base font-semibold pt-2">Certificates</CardTitle>
              <CardDescription className="text-xs">
                Download private PDFs and copy public verification links.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start px-0 text-xs text-amber-500"
              >
                <Link href="/student/certificates">View Credentials →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
            <CardHeader className="p-5 pb-3">
              <div className="rounded-xl bg-muted p-2.5 text-muted-foreground w-fit">
                <Settings className="size-5" />
              </div>
              <CardTitle className="text-base font-semibold pt-2">Account Settings</CardTitle>
              <CardDescription className="text-xs">
                Profile timezone, sessions, password, and notifications.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="w-full justify-start px-0 text-xs text-muted-foreground"
              >
                <Link href="/student/settings">Manage Settings →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
