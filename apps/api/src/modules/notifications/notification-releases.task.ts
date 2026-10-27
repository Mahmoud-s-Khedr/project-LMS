import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { releaseWindow } from '../content/content.support';
import { NotificationsService } from './notifications.service';
import type { BackgroundTaskHandler } from '../events/background-task';
/** Reconcile scheduled content releases from authoritative records, including cohort/relative offsets.
 * Stable release keys avoid duplicate messages on repeated scans; a Redis outage loses no schedule. */
@Injectable()
export class NotificationReleasesTask implements BackgroundTaskHandler {
  readonly name = 'notifications.releases';
  readonly everyMs = 300000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly access: LearnerAccessPolicy,
  ) {}
  async handle() {
    let after: string | undefined;
    for (;;) {
      const batch = await this.prisma.enrollment.findMany({
        where: {
          status: 'ACTIVE',
          workspace: { status: 'ACTIVE', deletedAt: null },
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
        include: { cohort: true },
      });
      for (const enrollment of batch) {
        const lessons = await this.prisma.lesson.findMany({
          where: {
            workspaceId: enrollment.workspaceId,
            courseId: enrollment.courseId,
            isPublished: true,
            deletedAt: null,
            section: { deletedAt: null },
          },
          include: {
            cohortLessonReleases: {
              where: { cohortId: enrollment.cohortId ?? '00000000-0000-4000-8000-000000000000' },
            },
          },
        });
        for (const lesson of lessons) {
          const window = releaseWindow(
            lesson,
            enrollment.enrolledAt,
            enrollment.cohort?.startsAt ?? null,
            lesson.cohortLessonReleases[0],
          );
          if (
            !window.opensAt ||
            window.opensAt > new Date() ||
            window.opensAt < enrollment.enrolledAt
          )
            continue;
          await this.prisma.$transaction(async (tx) => {
            const currentEnrollment = await tx.enrollment.findFirst({
              where: { id: enrollment.id, workspaceId: enrollment.workspaceId },
              include: { cohort: true },
            });
            if (!currentEnrollment) return;
            const currentLesson = await tx.lesson.findFirst({
              where: {
                id: lesson.id,
                workspaceId: enrollment.workspaceId,
                courseId: enrollment.courseId,
              },
              include: {
                cohortLessonReleases: {
                  where: {
                    cohortId: currentEnrollment.cohortId ?? '00000000-0000-4000-8000-000000000000',
                  },
                },
              },
            });
            if (!currentLesson) return;
            const currentWindow = releaseWindow(
              currentLesson,
              currentEnrollment.enrolledAt,
              currentEnrollment.cohort?.startsAt ?? null,
              currentLesson.cohortLessonReleases[0],
            );
            if (currentWindow.opensAt?.getTime() !== window.opensAt!.getTime()) return;

            const access = await this.access.evaluateNow(
              {
                workspaceId: enrollment.workspaceId,
                enrollmentId: enrollment.id,
                userId: enrollment.userId,
                lessonId: lesson.id,
              },
              tx,
            );
            if (!access.allowed) return;
            await this.notifications.create(tx, {
              workspaceId: enrollment.workspaceId,
              userId: enrollment.userId,
              type: 'course.released',
              dedupeKey: `release:${enrollment.id}:${lesson.id}:${window.opensAt!.toISOString()}`,
              title: 'New course content available',
              body: 'A scheduled lesson is now available in your course.',
              data: {
                courseId: enrollment.courseId,
                lessonId: lesson.id,
                enrollmentId: enrollment.id,
                path: `/learn/${enrollment.id}/lessons/${lesson.id}`,
              },
            });
          });
        }
      }
      if (batch.length < 100) break;
      after = batch.at(-1)!.id;
    }
  }
}
