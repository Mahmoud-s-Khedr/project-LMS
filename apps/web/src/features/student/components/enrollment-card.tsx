import Link from 'next/link';
import { ArrowRight, BookOpen, Calendar, Lock, ShieldAlert, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import type { Enrollment } from '../types';
import { formatDateString, formatAccessReason, isAccessAllowed } from '../types';

export interface EnrollmentCardProps {
  enrollment: Enrollment;
  courseTitle?: string;
}

export function EnrollmentCard({ enrollment, courseTitle }: EnrollmentCardProps) {
  const allowed = isAccessAllowed(enrollment.access);
  const completionPercent = Math.min(
    100,
    Math.max(0, parseFloat(enrollment.completionPercent) || 0),
  );
  const isCompleted = Boolean(enrollment.completedAt) || completionPercent >= 100;
  const isSuspended = enrollment.status === 'SUSPENDED';

  // Latest grant info
  const activeGrant = enrollment.grants[0];
  const grantExpiry = activeGrant?.expiresAt ? formatDateString(activeGrant.expiresAt) : null;

  const displayTitle = courseTitle || `Course ${enrollment.courseId.slice(0, 8)}…`;

  return (
    <Card className="flex flex-col justify-between overflow-hidden border-border/60 transition-shadow hover:shadow-md">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Status Badge */}
          <div className="flex items-center gap-1.5">
            {isCompleted ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              >
                Completed
              </Badge>
            ) : isSuspended ? (
              <Badge variant="destructive" className="bg-destructive/10 text-destructive">
                Suspended
              </Badge>
            ) : (
              <Badge variant="secondary">In Progress</Badge>
            )}

            {/* Access State Badge */}
            {!allowed && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                <Lock className="mr-1 size-3" />
                {!enrollment.access.allowed
                  ? formatAccessReason(enrollment.access.reason)
                  : 'Restricted'}
              </Badge>
            )}
          </div>

          {/* Grant badge */}
          {activeGrant && (
            <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
              {activeGrant.source === 'FREE' && 'Free Enrollment'}
              {activeGrant.source === 'ORDER_ITEM' && 'Purchased'}
              {activeGrant.source === 'SUBSCRIPTION' && 'Subscription'}
              {activeGrant.source === 'MANUAL' && 'Manual Grant'}
            </Badge>
          )}
        </div>

        <div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
            <Link
              href={`/student/enrollments/${enrollment.id}`}
              className="hover:text-primary hover:underline"
            >
              {displayTitle}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            <span>Enrolled {formatDateString(enrollment.enrolledAt)}</span>
            {grantExpiry && <span>• Access until {grantExpiry}</span>}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 py-2">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">{completionPercent.toFixed(0)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full transition-all duration-300 ${
                isCompleted ? 'bg-emerald-500' : 'bg-primary'
              }`}
              style={{ width: `${completionPercent}%` }}
              role="progressbar"
              aria-valuenow={completionPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>

        {/* Access Warning banner if expired / locked */}
        {!allowed && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <span className="font-medium">Historical records preserved.</span> Course player is
                restricted (
                {!enrollment.access.allowed
                  ? formatAccessReason(enrollment.access.reason)
                  : 'Restricted'}
                ).
                {!enrollment.access.allowed && enrollment.access.unlockAt && (
                  <span className="block mt-0.5">
                    Unlocks: {formatDateString(enrollment.access.unlockAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground">
          <Link href={`/student/enrollments/${enrollment.id}`}>
            <BookOpen className="mr-1.5 size-3.5" />
            Curriculum & Grants
          </Link>
        </Button>

        {allowed ? (
          <Button size="sm" asChild className="text-xs">
            <Link href={`/learn/${enrollment.id}`}>
              Continue
              <ArrowRight className="ml-1.5 size-3.5" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link href={`/student/results/${enrollment.id}`}>
              <Sparkles className="mr-1.5 size-3.5" />
              View Results
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
