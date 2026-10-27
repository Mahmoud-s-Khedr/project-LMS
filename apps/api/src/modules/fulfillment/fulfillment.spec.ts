import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { FulfillmentConsumer, type FulfillmentEvent } from './fulfillment.consumer';
import { FulfillmentService, expiryFromPaidAt, snapshotCourses } from './fulfillment.service';
import type { EventDeliveryContext } from '../events/event-consumer';

describe('fulfillment snapshot and event boundary', () => {
  it('anchors exact UTC-day expiry to paidAt and preserves unlimited access', () => {
    const paid = new Date('2026-03-28T23:30:00Z');
    expect(expiryFromPaidAt(paid, 2)?.toISOString()).toBe('2026-03-30T23:30:00.000Z');
    expect(expiryFromPaidAt(paid, null)).toBeNull();
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER, Infinity, NaN])(
    'rejects invalid duration %s',
    (duration) => {
      expect(() => expiryFromPaidAt(new Date(), duration)).toThrow('duration');
    },
  );
  it.each([{}, [], { courses: [] }, { courses: [{ courseId: 'foreign' }] }])(
    'rejects malformed snapshots %j',
    (value) => {
      expect(() => snapshotCourses(value)).toThrow('snapshot');
    },
  );
  it('rejects duplicate courses and normalizes legacy missing duration', () => {
    const course = { courseId: randomUUID(), cohortId: null };
    expect(snapshotCourses({ courses: [course] })[0]?.accessDurationDays).toBeNull();
    expect(() => snapshotCourses({ courses: [course, course] })).toThrow('snapshot');
  });
  const context: EventDeliveryContext = {
    consumer: 'fulfillment.billing',
    attempt: 1,
    maxAttempts: 8,
    jobId: 'test',
    requestId: 'test',
  };
  function event(): FulfillmentEvent {
    const id = randomUUID();
    return {
      id: randomUUID(),
      workspaceId: randomUUID(),
      type: 'order.paid.v1',
      schemaVersion: 1,
      aggregateType: 'Order',
      aggregateId: id,
      sequence: '1',
      timestamp: new Date().toISOString(),
      payload: { orderId: id },
    };
  }
  it('rejects mismatched aggregate identity before invoking commands', async () => {
    const command = jest.fn();
    const consumer = new FulfillmentConsumer({ order: command } as unknown as FulfillmentService);
    const e = event();
    e.aggregateId = randomUUID();
    await expect(consumer.handle(e, {} as Prisma.TransactionClient, context)).rejects.toThrow(
      'aggregate',
    );
    expect(command).not.toHaveBeenCalled();
  });
  it('rejects replacement payload fields using the shared strict event schema', async () => {
    const command = jest.fn();
    const consumer = new FulfillmentConsumer({ order: command } as unknown as FulfillmentService);
    const e = event();
    Object.assign(e.payload, { userId: randomUUID() });
    await expect(consumer.handle(e, {} as Prisma.TransactionClient, context)).rejects.toThrow(
      'Invalid',
    );
    expect(command).not.toHaveBeenCalled();
  });
});
