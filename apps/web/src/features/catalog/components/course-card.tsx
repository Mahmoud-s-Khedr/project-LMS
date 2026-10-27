import Link from 'next/link';
import { BookOpen, Calendar, Clock, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import type { PublicCourse } from '../types';
import { formatDurationMinutes, formatDeliveryMode, formatLevel } from '../types';

interface CourseCardProps {
  course: PublicCourse & { workspaceSlug?: string; workspace?: { slug?: string } };
  workspaceSlug?: string;
  className?: string;
}

export function CourseCard({ course, workspaceSlug, className = '' }: CourseCardProps) {
  const isCohort = course.deliveryMode === 'COHORT';
  const effectiveWorkspace = workspaceSlug ?? course.workspaceSlug ?? course.workspace?.slug;

  const courseHref = effectiveWorkspace
    ? `/courses/${encodeURIComponent(course.slug)}?workspace=${encodeURIComponent(effectiveWorkspace)}`
    : `/courses/${encodeURIComponent(course.slug)}`;

  return (
    <Card
      className={`group flex flex-col overflow-hidden border border-border/70 bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${className}`}
      data-testid={`course-card-${course.id}`}
    >
      {/* Cover / Media Area */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-gradient-to-br from-muted via-muted/60 to-accent/20">
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverUrl}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-muted-foreground/60">
            {isCohort ? (
              <Users className="h-12 w-12 text-primary/40" />
            ) : (
              <BookOpen className="h-12 w-12 text-primary/40" />
            )}
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
          <Badge
            variant={isCohort ? 'default' : 'secondary'}
            className="flex items-center gap-1 shadow-sm backdrop-blur-md"
          >
            {isCohort ? (
              <>
                <Calendar className="h-3 w-3" />
                <span>{formatDeliveryMode(course.deliveryMode)}</span>
              </>
            ) : (
              <>
                <Clock className="h-3 w-3" />
                <span>{formatDeliveryMode(course.deliveryMode)}</span>
              </>
            )}
          </Badge>

          {course.isFree ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400"
            >
              Free
            </Badge>
          ) : (
            course.level && (
              <Badge variant="outline" className="bg-background/80 backdrop-blur-xs">
                {formatLevel(course.level)}
              </Badge>
            )
          )}
        </div>
      </div>

      {/* Card Content */}
      <CardHeader className="flex-1 p-5 pb-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          {course.language && (
            <span className="uppercase tracking-wider font-semibold">{course.language}</span>
          )}
          {course.level && !course.isFree && (
            <>
              <span>•</span>
              <span>{formatLevel(course.level)}</span>
            </>
          )}
          {course.estimatedMinutes > 0 && (
            <>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDurationMinutes(course.estimatedMinutes)}
              </span>
            </>
          )}
        </div>

        <h3 className="line-clamp-2 font-serif text-lg font-bold tracking-tight text-card-foreground group-hover:text-primary transition-colors">
          <Link
            href={courseHref}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            {course.title}
          </Link>
        </h3>

        {course.summary && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{course.summary}</p>
        )}
      </CardHeader>

      <CardContent className="px-5 py-0" />

      {/* Footer Info */}
      <CardFooter className="flex items-center justify-between border-t border-border/50 p-5 pt-3 text-sm">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          {course.isFree ? (
            <span className="text-emerald-600 dark:text-emerald-400">Free Access</span>
          ) : (
            <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Enrollment Open</span>
            </span>
          )}
        </div>

        <Link
          href={courseHref}
          className="inline-flex items-center text-xs font-semibold text-primary hover:underline underline-offset-4"
        >
          View Course &rarr;
        </Link>
      </CardFooter>
    </Card>
  );
}
