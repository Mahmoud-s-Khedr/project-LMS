import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { DeliveredEvent, EventConsumer } from '../events/event-consumer';
import { LearningCompletionService } from './completion.service';

const TYPES = ['assessment.result.changed.v1', 'assessment.graded.v1'] as const;

/**
 * Derives ASSESSMENT_PASS lesson completion (and therefore course completion) from the assessments' effective
 * result. Registered explicitly in the worker bootstrap. The event is only a trigger: the handler re-reads
 * the authoritative result, stamps completion once and never un-completes after a regrade.
 */
@Injectable()
export class LearningCompletionConsumer implements EventConsumer<(typeof TYPES)[number]> {
  readonly name = 'learning.completion';
  readonly eventTypes = TYPES;
  readonly transactionTimeoutMs = 30000;
  constructor(private readonly completion: LearningCompletionService) {}

  async handle(
    event: DeliveredEvent<(typeof TYPES)[number]>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!event.workspaceId) return;
    let enrollmentId: string | null = null;
    if (event.type === 'assessment.graded.v1') {
      const attempt = await tx.assessmentAttempt.findFirst({
        where: { id: event.payload.attemptId, workspaceId: event.workspaceId },
        select: { enrollmentId: true },
      });
      enrollmentId = attempt?.enrollmentId ?? null;
    } else {
      const enrollment = await tx.enrollment.findFirst({
        where: { id: event.payload.enrollmentId, workspaceId: event.workspaceId },
        select: { id: true },
      });
      enrollmentId = enrollment?.id ?? null;
    }
    if (!enrollmentId) return;
    await this.completion.reconcileInTx(tx, enrollmentId);
  }
}
