'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import { siteConfig } from '@/features/marketing/site-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function InstructorOverviewPage() {

  return (
    <div className="space-y-6">
      {/* Title & Brand Intro */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {siteConfig.name} Instructor Studio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Deliver transformative cohort and self-paced learning, monitor learner engagement, and maintain academic standards.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Curriculum Builder</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Courses</div>
            <p className="text-xs text-muted-foreground mt-1">Sections, lessons, rich video & assets</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/instructor/courses" className="flex items-center gap-1 text-primary">
                  Manage curricula <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Course Roster</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Learners</div>
            <p className="text-xs text-muted-foreground mt-1">Access provenance & manual enrollment</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/instructor/learners" className="flex items-center gap-1 text-primary">
                  View roster <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Grading Queue</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Submissions</div>
            <p className="text-xs text-muted-foreground mt-1">Manual rubrics & assessment evaluations</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/instructor/grading" className="flex items-center gap-1 text-primary">
                  Grade attempts <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Studio Analytics</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Metrics</div>
            <p className="text-xs text-muted-foreground mt-1">Completions, drop-off & telemetry</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/instructor/analytics" className="flex items-center gap-1 text-primary">
                  Open reports <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Action Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              Roster & Student Access Control
            </CardTitle>
            <CardDescription className="text-xs">
              Directly manage student seats, track learning progression, and issue time-bounded scholarship grants.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/instructor/learners">
                Learner Roster & Provenance <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/instructor/cohorts">
                Live Cohort Schedules <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Engagement & Performance Analytics
            </CardTitle>
            <CardDescription className="text-xs">
              Deep telemetry on lesson completion rates, assessment pass percentages, and background export jobs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/instructor/analytics">
                Course Performance Overview <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/instructor/grading">
                Assessment Grading Backlog <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
