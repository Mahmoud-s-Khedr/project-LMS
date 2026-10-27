import { BookOpen, CheckCircle2, Clock, Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatSecondsToDuration } from '../types';
import type { StudentAnalytics } from '../types';

export interface OverviewStatsProps {
  analytics?: StudentAnalytics;
  isLoading?: boolean;
}

export function OverviewStats({ analytics, isLoading }: OverviewStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/60 shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const enrolled = analytics?.enrolledCourses ?? 0;
  const completed = analytics?.completedCourses ?? 0;
  const duration = formatSecondsToDuration(analytics?.learningSeconds);
  const streak = analytics?.currentStreakDays ?? 0;

  const stats = [
    {
      label: 'Enrolled Courses',
      value: enrolled.toString(),
      icon: BookOpen,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Completed Courses',
      value: completed.toString(),
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Time Learned',
      value: duration,
      icon: Clock,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Day Streak',
      value: `${streak} ${streak === 1 ? 'day' : 'days'}`,
      icon: Flame,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="overview-stats">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label} className="border-border/60 transition-colors hover:border-border">
            <CardContent className="flex items-center justify-between p-4 sm:p-5">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {stat.value}
                </p>
              </div>
              <div className={`rounded-xl p-2.5 sm:p-3 ${stat.bg} ${stat.color}`}>
                <Icon className="size-4 sm:size-5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
