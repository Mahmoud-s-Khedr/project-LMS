import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { FulfillmentService } from './fulfillment.service';

/** Full rotating keyset scan, including old purchases; no lookback that can lose an aged missed grant. */
@Injectable()
export class FulfillmentReconcileTask implements BackgroundTaskHandler<Record<string, never>> {
  readonly name = 'fulfillment.reconcile';
  readonly everyMs = 60_000;
  readonly payloadSchema = z.object({}).strict();
  private readonly logger = new Logger(FulfillmentReconcileTask.name);
  private readonly cursors: Partial<Record<'order' | 'subscription' | 'refund', string>> = {};
  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  async handle(): Promise<void> {
    for (const kind of ['order', 'subscription', 'refund'] as const) {
      const after = this.cursors[kind];
      const common = {
        where: { ...(after ? { id: { gt: after } } : {}) },
        orderBy: { id: 'asc' as const },
        take: 100,
        select: { id: true, workspaceId: true },
      };
      const rows =
        kind === 'order'
          ? await this.prisma.order.findMany({
              ...common,
              where: {
                ...common.where,
                paidAt: { not: null },
                status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
              },
            })
          : kind === 'subscription'
            ? await this.prisma.subscription.findMany(common)
            : await this.prisma.refund.findMany({
                ...common,
                where: { ...common.where, status: 'SUCCEEDED' },
              });
      for (const row of rows) {
        try {
          await this.prisma.$transaction(
            (tx) =>
              this.fulfillment[kind](
                tx,
                row.workspaceId,
                row.id,
                `fulfillment-reconcile:${row.id}`,
              ),
            { timeout: 60000 },
          );
        } catch {
          // One suspended tenant/malformed snapshot cannot prevent the next aggregate being repaired.
          // Do not log billing snapshots, user information, or provider errors.
          this.logger.error(`Fulfillment reconciliation failed: ${kind} ${row.id}`);
        }
      }
      this.cursors[kind] = rows.length === 100 ? rows[rows.length - 1]!.id : undefined;
    }
  }
}
