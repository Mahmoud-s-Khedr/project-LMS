import { Injectable } from '@nestjs/common';
import type { BackgroundTaskHandler } from '../events/background-task';
import { AssessmentAttemptsService } from './attempts.service';
/** Durable state is PostgreSQL. A bounded periodic sweep recovers expired attempts after worker outages. */
@Injectable()
export class AssessmentDeadlineTask implements BackgroundTaskHandler {
  readonly name = 'assessments.attempt-deadline';
  readonly everyMs = 10000;
  readonly maxAttempts = 5;
  constructor(private readonly attempts: AssessmentAttemptsService) {}
  async handle(): Promise<void> {
    const expired = await this.attempts.repo.prisma.assessmentAttempt.findMany({
      where: { status: 'IN_PROGRESS', deadlineAt: { lte: new Date() } },
      orderBy: { deadlineAt: 'asc' },
      take: 100,
      select: { id: true },
    });
    let failure: unknown;
    for (const a of expired) {
      try {
        await this.attempts.expire(a.id);
      } catch (error) {
        failure ??= error;
      }
    }
    if (failure) throw failure;
  }
}
