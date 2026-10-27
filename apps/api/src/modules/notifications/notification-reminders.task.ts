import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { LearnerAccessPolicy } from '../learning/learner-access-policy';
import { NotificationsService } from './notifications.service';
/** Database-backed reminder backstop; stable session/start keys survive queue loss and rescheduling.
 * Rechecks each session and enrollment in the write transaction. Never persists meeting URLs. */
@Injectable()
export class NotificationRemindersTask implements BackgroundTaskHandler {
  readonly name = 'notifications.reminders';
  readonly everyMs = 60000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly access: LearnerAccessPolicy,
  ) {}
  async handle() {
    const now = new Date();
    let sessionCursor: string | undefined;
    for (;;) {
      const sessions = await this.prisma.liveSession.findMany({
        where: {
          status: 'SCHEDULED',
          deletedAt: null,
          startsAt: { gt: now, lte: new Date(now.getTime() + 3600000) },
          workspace: { status: 'ACTIVE', deletedAt: null },
          ...(sessionCursor ? { id: { gt: sessionCursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
      });
      for (const session of sessions) {
        let after: string | undefined;
        for (;;) {
          const learners = await this.prisma.enrollment.findMany({
            where: {
              workspaceId: session.workspaceId,
              courseId: session.courseId,
              status: 'ACTIVE',
              ...(session.cohortId ? { cohortId: session.cohortId } : {}),
              ...(after ? { id: { gt: after } } : {}),
            },
            orderBy: { id: 'asc' },
            take: 100,
          });
          for (const learner of learners)
            await this.prisma.$transaction(async (tx) => {
              const current = await tx.liveSession.findFirst({
                where: {
                  id: session.id,
                  workspaceId: session.workspaceId,
                  status: 'SCHEDULED',
                  startsAt: session.startsAt,
                  deletedAt: null,
                },
              });
              if (!current || current.startsAt <= new Date()) return;
              const eligible = await this.access.evaluateNow(
                {
                  workspaceId: session.workspaceId,
                  enrollmentId: learner.id,
                  userId: learner.userId,
                  lessonId: session.lessonId,
                },
                tx,
              );
              if (!eligible.allowed) return;
              await this.notifications.create(tx, {
                workspaceId: session.workspaceId,
                userId: learner.userId,
                type: 'live.reminder',
                dedupeKey: `live:${session.id}:${session.startsAt.toISOString()}:${learner.id}`,
                title: 'Live session starts soon',
                body: 'A live session in your course starts within the hour. Open your course for details.',
                data: {
                  courseId: session.courseId,
                  lessonId: session.lessonId,
                  enrollmentId: learner.id,
                  path: `/learn/${learner.id}/lessons/${session.lessonId}`,
                },
              });
            });
          if (learners.length < 100) break;
          after = learners.at(-1)!.id;
        }
      }
      if (sessions.length < 100) break;
      sessionCursor = sessions.at(-1)!.id;
    }
  }
}
