import { Inject, Injectable } from '@nestjs/common';
import type { EventType } from '@lms/shared';
import { CONSUMER_NAME_MAX, CONSUMER_NAME_PATTERN, EVENT_CONSUMERS, EVENT_CONTRACTS } from './events.options';
import type { EventContracts } from './event-contracts';
import type { AnyEventConsumer, EventConsumer } from './event-consumer';

/**
 * Immutable set of explicitly registered consumers, validated at bootstrap: unique stable names, known
 * event types, at least one subscription. Unknown/duplicate registration fails fast.
 */
@Injectable()
export class EventConsumerRegistry {
  private readonly byName = new Map<string, EventConsumer>();
  private readonly byType = new Map<string, EventConsumer[]>();

  constructor(
    @Inject(EVENT_CONSUMERS) consumers: readonly AnyEventConsumer[],
    @Inject(EVENT_CONTRACTS) contracts: EventContracts,
  ) {
    for (const rawConsumer of consumers) {
      const consumer = rawConsumer as EventConsumer;
      const { name } = consumer;
      if (!CONSUMER_NAME_PATTERN.test(name) || name.length > CONSUMER_NAME_MAX) {
        throw new Error(`Invalid event consumer name "${name}"`);
      }
      if (this.byName.has(name)) throw new Error(`Duplicate event consumer name "${name}"`);
      if (consumer.eventTypes.length === 0) throw new Error(`Event consumer "${name}" subscribes to no types`);
      if (consumer.maxAttempts !== undefined && (!Number.isInteger(consumer.maxAttempts) || consumer.maxAttempts < 1)) {
        throw new Error(`Event consumer "${name}" has invalid maxAttempts`);
      }
      const types = new Set<string>(consumer.eventTypes);
      for (const type of types) {
        if (!contracts.isKnownType(type)) throw new Error(`Event consumer "${name}" subscribes to unknown type ${type}`);
        const list = this.byType.get(type) ?? [];
        list.push(consumer);
        this.byType.set(type, list);
      }
      this.byName.set(name, consumer);
    }
  }

  get(name: string): EventConsumer | undefined {
    return this.byName.get(name);
  }

  forType(type: string): readonly EventConsumer[] {
    return this.byType.get(type) ?? [];
  }

  subscribedTypes(): readonly string[] {
    return [...this.byType.keys()];
  }

  all(): readonly EventConsumer[] {
    return [...this.byName.values()];
  }

  subscribes(name: string, type: string): boolean {
    return this.byName.get(name)?.eventTypes.includes(type as EventType) ?? false;
  }
}
