import type { Prisma } from '@prisma/client';
import {
  buildEventJobId,
  buildTaskJobId,
  EventConsumerRegistry,
  EventContractViolation,
  type EventConsumer,
  jitteredBackoff,
  OutboxService,
  redisConnectionFromUrl,
  SharedEventContracts,
  TimeoutError,
  withTimeout,
} from './index';

describe('Events contracts, outbox validation and helpers', () => {
  const contracts = new SharedEventContracts();
  const outbox = new OutboxService(contracts);

  const createdEvents: Array<Record<string, unknown>> = [];
  let executedRawCount = 0;

  const mockTx = {
    outboxEvent: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        createdEvents.push(data);
        return {
          id: String(data.id),
          sequence: BigInt(createdEvents.length),
        };
      }),
    },
    $executeRaw: jest.fn(async () => {
      executedRawCount += 1;
      return 1;
    }),
  } as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    createdEvents.length = 0;
    executedRawCount = 0;
    jest.clearAllMocks();
  });

  describe('OutboxService.append & scrubMailCapability', () => {
    it('appends allowlisted global identity/security events with workspaceId=null before any workspace exists', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';
      const appended = await outbox.append(mockTx, {
        type: 'identity.registered.v1',
        workspaceId: null,
        aggregateType: 'User',
        aggregateId: userId,
        payload: {
          userId,
          mailCapability: {
            keyId: 'v1',
            ciphertext: 'base64url-aes-gcm-ciphertext',
            expiresAt: '2026-10-27T10:00:00.000Z',
          },
        },
      });

      expect(appended.type).toBe('identity.registered.v1');
      expect(appended.sequence).toBe('1');
      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0]?.workspaceId).toBeNull();
      expect(createdEvents[0]?.schemaVersion).toBe(1);

      const scrubbed = await outbox.scrubMailCapability(mockTx, appended.id);
      expect(scrubbed).toBe(true);
      expect(executedRawCount).toBe(1);
    });

    it('rejects global identity events when a tenant workspaceId is supplied', async () => {
      const userId = '11111111-1111-4111-8111-111111111111';
      const workspaceId = '22222222-2222-4222-8222-222222222222';
      await expect(
        outbox.append(mockTx, {
          type: 'identity.password-reset.requested.v1',
          workspaceId: workspaceId as unknown as null,
          aggregateType: 'User',
          aggregateId: userId,
          payload: { userId },
        }),
      ).rejects.toThrow(EventContractViolation);
    });

    it('requires workspaceId on all business domain events and rejects null workspace scope', async () => {
      const workspaceId = '22222222-2222-4222-8222-222222222222';
      const orderId = '33333333-3333-4333-8333-333333333333';

      const appended = await outbox.append(mockTx, {
        type: 'order.paid.v1',
        workspaceId,
        aggregateType: 'Order',
        aggregateId: orderId,
        payload: { orderId },
      });
      expect(appended.type).toBe('order.paid.v1');
      expect(createdEvents[0]?.workspaceId).toBe(workspaceId);

      await expect(
        outbox.append(mockTx, {
          type: 'order.paid.v1',
          workspaceId: null as unknown as string,
          aggregateType: 'Order',
          aggregateId: orderId,
          payload: { orderId },
        }),
      ).rejects.toThrow(/requires a workspaceId/);
    });

    it('rejects unknown event types, extra payload keys and plaintext secret/answer/capability material', async () => {
      const workspaceId = '22222222-2222-4222-8222-222222222222';
      const courseId = '44444444-4444-4444-8444-444444444444';

      await expect(
        outbox.append(mockTx, {
          type: 'course.nonexistent.v1' as 'course.published.v1',
          workspaceId,
          aggregateType: 'Course',
          aggregateId: courseId,
          payload: { courseId },
        }),
      ).rejects.toThrow(/Unknown event type/);

      await expect(
        outbox.append(mockTx, {
          type: 'course.published.v1',
          workspaceId,
          aggregateType: 'Course',
          aggregateId: courseId,
          payload: {
            courseId,
            extraField: 'not-allowed',
          } as unknown as { courseId: string },
        }),
      ).rejects.toThrow(EventContractViolation);

      await expect(
        outbox.append(mockTx, {
          type: 'course.published.v1',
          workspaceId,
          aggregateType: 'Course',
          aggregateId: courseId,
          payload: {
            courseId,
            answerKey: { correctOptionKeys: ['a'] },
          } as unknown as { courseId: string },
        }),
      ).rejects.toThrow(/secret\/answer\/capability/);

      await expect(
        outbox.append(mockTx, {
          type: 'course.published.v1',
          workspaceId,
          aggregateType: 'Course',
          aggregateId: courseId,
          payload: {
            courseId: 'https://s3.local/bucket/file?X-Amz-Signature=deadbeef',
          },
        }),
      ).rejects.toThrow(/secret\/answer\/capability/);
    });
  });

  describe('EventConsumerRegistry & deterministic job IDs', () => {
    it('registers valid consumers and rejects duplicate names or unknown event types', () => {
      const consumerA: EventConsumer<'order.paid.v1'> = {
        name: 'fulfillment.order-paid',
        eventTypes: ['order.paid.v1'],
        handle: async () => undefined,
      };
      const consumerB: EventConsumer<'order.paid.v1' | 'refund.succeeded.v1'> = {
        name: 'notifications.commerce',
        eventTypes: ['order.paid.v1', 'refund.succeeded.v1'],
        handle: async () => undefined,
      };

      const registry = new EventConsumerRegistry([consumerA, consumerB], contracts);
      expect(registry.forType('order.paid.v1')).toHaveLength(2);
      expect(registry.forType('refund.succeeded.v1')).toHaveLength(1);
      expect(registry.subscribes('fulfillment.order-paid', 'order.paid.v1')).toBe(true);
      expect(registry.subscribes('fulfillment.order-paid', 'refund.succeeded.v1')).toBe(false);

      expect(() => new EventConsumerRegistry([consumerA, consumerA], contracts)).toThrow(
        /Duplicate event consumer name/,
      );
      expect(
        () =>
          new EventConsumerRegistry(
            [
              {
                name: 'INVALID_UPPERCASE',
                eventTypes: ['order.paid.v1'],
                handle: async () => undefined,
              },
            ],
            contracts,
          ),
      ).toThrow(/Invalid event consumer name/);
    });

    it('builds colon-free deterministic BullMQ job IDs for events and background tasks', () => {
      const eventId = '55555555-5555-4555-8555-555555555555';
      const eventJobId = buildEventJobId(eventId, 'fulfillment.order-paid');
      expect(eventJobId).toBe(`event__${eventId}__fulfillment.order-paid`);
      expect(eventJobId).not.toContain(':');

      const taskJobId = buildTaskJobId('assessments.attempt-deadline', `attempt:${eventId}`);
      expect(taskJobId).toBe(`task__assessments.attempt-deadline__attempt_c_${eventId}`);
      expect(taskJobId).not.toContain(':');
    });

    it('configures Redis connections and bounded jittered backoff', () => {
      const producerOpts = redisConnectionFromUrl('redis://localhost:56379/9', 'producer');
      expect(producerOpts.db).toBe(9);
      expect(producerOpts.maxRetriesPerRequest).toBe(1);
      expect(producerOpts.enableOfflineQueue).toBe(false);

      const workerOpts = redisConnectionFromUrl('redis://localhost:56379/9', 'worker');
      expect(workerOpts.db).toBe(9);
      expect(workerOpts.maxRetriesPerRequest).toBeNull();
      expect(workerOpts.enableOfflineQueue).toBe(true);

      expect(jitteredBackoff(1, 1000, 10_000, () => 0)).toBe(500);
      expect(jitteredBackoff(1, 1000, 10_000, () => 1)).toBe(1000);
      expect(jitteredBackoff(5, 1000, 10_000, () => 1)).toBe(10_000);
    });

    it('rejects timed-out operations via withTimeout', async () => {
      const neverResolves = new Promise<void>(() => undefined);
      await expect(withTimeout(neverResolves, 20, 'test-op')).rejects.toThrow(TimeoutError);
    });
  });
});
