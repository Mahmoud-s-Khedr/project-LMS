import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BackgroundTaskSchedulerService } from '../events/background-task-scheduler.service';
import type { DeliveredEvent, EventConsumer } from '../events/event-consumer';
/** Idempotent queue wakeup; persisted PENDING rows remain recoverable independently of Redis. */
@Injectable()
export class AnalyticsExportConsumer implements EventConsumer<'analytics.export.requested.v1'> {
  readonly name = 'analytics.export-requested';
  readonly eventTypes = ['analytics.export.requested.v1'] as const;
  constructor(private readonly scheduler: BackgroundTaskSchedulerService) {}
  async handle(
    event: DeliveredEvent<'analytics.export.requested.v1'>,
    tx: Prisma.TransactionClient,
  ) {
    const report = await tx.reportExport.findFirst({
      where: { id: event.payload.operationId, workspaceId: event.workspaceId, status: 'PENDING' },
      select: { id: true },
    });
    if (!report) return;
    await this.scheduler.schedule({
      taskName: 'analytics.exports',
      businessKey: report.id,
      payload: { operationId: report.id },
    });
  }
}
