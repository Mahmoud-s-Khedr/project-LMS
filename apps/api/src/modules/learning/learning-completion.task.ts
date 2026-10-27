import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { LearningCompletionService } from './completion.service';

/**
 * Periodic backstop for completion that no event announces (live-session attendance corrected by staff) or
 * whose event was lost. It selects only enrollments with an authoritative qualifying fact and an incomplete
 * lesson, so converged enrollments leave the candidate set. Handlers re-verify state under lock.
 */
@Injectable()
export class LearningCompletionBackstopTask implements BackgroundTaskHandler<
  Record<string, never>
> {
  readonly name = 'learning.completion-backstop';
  readonly everyMs = 5 * 60 * 1000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly completion: LearningCompletionService,
  ) {}

  async handle(): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT e."id" FROM "Enrollment" e
      JOIN "Lesson" l ON l."workspaceId"=e."workspaceId" AND l."courseId"=e."courseId"
        AND l."deletedAt" IS NULL AND l."isPublished" AND l."completionRule" IN ('ASSESSMENT_PASS','ATTENDANCE')
      WHERE e."status"<>'REVOKED' AND e."completedAt" IS NULL
        AND NOT EXISTS (SELECT 1 FROM "LessonProgress" p
          WHERE p."enrollmentId"=e."id" AND p."lessonId"=l."id" AND p."completedAt" IS NOT NULL)
        AND (
          EXISTS (SELECT 1 FROM "Attendance" a JOIN "LiveSession" s ON s."id"=a."sessionId"
            WHERE a."enrollmentId"=e."id" AND a."status"='ATTENDED' AND s."lessonId"=l."id" AND s."deletedAt" IS NULL)
          OR EXISTS (SELECT 1 FROM "AssessmentAttempt" t JOIN "Assessment" x ON x."id"=t."assessmentId"
            WHERE t."enrollmentId"=e."id" AND t."status"='GRADED' AND t."passed" IS TRUE AND x."lessonId"=l."id")
        )
      LIMIT 200`;
    for (const { id } of rows) await this.completion.reconcile(id);
  }
}
