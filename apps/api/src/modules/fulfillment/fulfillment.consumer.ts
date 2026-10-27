import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { domainEventSchema } from '@lms/shared';
import {
  PermanentEventError,
  type DeliveredEvent,
  type EventConsumer,
  type EventDeliveryContext,
} from '../events/event-consumer';
import { FulfillmentService } from './fulfillment.service';
const types = [
  'order.paid.v1',
  'refund.succeeded.v1',
  'subscription.entitlements.changed.v1',
] as const;
export type FulfillmentEvent = DeliveredEvent<(typeof types)[number]>;
@Injectable()
export class FulfillmentConsumer implements EventConsumer<(typeof types)[number]> {
  readonly name = 'fulfillment.billing';
  readonly eventTypes = types;
  readonly transactionTimeoutMs = 60000;
  constructor(private readonly fulfillment: FulfillmentService) {}
  async handle(
    event: FulfillmentEvent,
    tx: Prisma.TransactionClient,
    context: EventDeliveryContext,
  ): Promise<void> {
    const parsed = domainEventSchema.safeParse(event);
    if (!parsed.success || !event.workspaceId)
      throw new PermanentEventError('Invalid fulfillment event');
    const [aggregate, id] =
      event.type === 'order.paid.v1'
        ? ['Order', event.payload.orderId]
        : event.type === 'refund.succeeded.v1'
          ? ['Refund', event.payload.refundId]
          : ['Subscription', event.payload.subscriptionId];
    if (event.aggregateType !== aggregate || event.aggregateId !== id)
      throw new PermanentEventError('Mismatched billing aggregate');
    if (event.type === 'order.paid.v1')
      await this.fulfillment.order(tx, event.workspaceId, id!, context.requestId);
    else if (event.type === 'refund.succeeded.v1')
      await this.fulfillment.refund(tx, event.workspaceId, id!, context.requestId);
    else await this.fulfillment.subscription(tx, event.workspaceId, id!, context.requestId);
  }
}
