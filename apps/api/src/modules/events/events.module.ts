import { type DynamicModule, Module, type Provider, type Type } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import type { AnyBackgroundTaskHandler } from './background-task';
import { BackgroundTaskSchedulerService } from './background-task-scheduler.service';
import { EventConsumerRegistry } from './consumer-registry';
import { EventConsumerRunnerService } from './event-consumer-runner.service';
import type { AnyEventConsumer } from './event-consumer';
import { type EventContracts, SharedEventContracts } from './event-contracts';
import { EventQueueService } from './event-queue.service';
import { EventReplayService } from './event-replay.service';
import { EventWorkerService } from './event-worker.service';
import {
  BACKGROUND_TASKS,
  EVENT_CONSUMERS,
  EVENT_CONTRACTS,
  EVENTS_OPTIONS,
  type EventsOptionsInput,
  resolveEventsOptions,
} from './events.options';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxReconcilerService } from './outbox-reconciler.service';
import { OutboxService } from './outbox.service';

export type ConsumerRegistration = Type<AnyEventConsumer> | AnyEventConsumer;
export type BackgroundTaskRegistration = Type<AnyBackgroundTaskHandler> | AnyBackgroundTaskHandler;

export interface EventsModuleForRootOptions {
  /** Feature modules that export dependencies required by consumer/task provider classes. */
  readonly imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  /** Explicit event consumer provider classes or instances. */
  readonly consumers?: readonly ConsumerRegistration[];
  /** Explicit background task handler provider classes or instances. */
  readonly tasks?: readonly BackgroundTaskRegistration[];
  /** Overrides for queue prefix, Redis URL, intervals, concurrency, autoStart, etc. */
  readonly options?: EventsOptionsInput;
  /** Optional custom event contracts adapter (defaults to `SharedEventContracts`). */
  readonly contracts?: EventContracts;
}

function isProviderClass<T>(item: Type<T> | T): item is Type<T> {
  return typeof item === 'function';
}

const CORE_SERVICES = [
  EventConsumerRegistry,
  OutboxService,
  EventQueueService,
  OutboxDispatcherService,
  EventConsumerRunnerService,
  EventWorkerService,
  OutboxReconcilerService,
  BackgroundTaskSchedulerService,
  EventReplayService,
];

/**
 * Lightweight producer-only module for HTTP feature modules that only need `OutboxService` and
 * `EVENT_CONTRACTS` without registering workers or starting background timers.
 */
@Module({
  providers: [{ provide: EVENT_CONTRACTS, useClass: SharedEventContracts }, OutboxService],
  exports: [OutboxService, EVENT_CONTRACTS],
})
export class EventsProducerModule {}

/**
 * Durable event bus module.
 * - Importing `EventsModule` directly in HTTP modules provides `OutboxService`, `EventReplayService` and
 *   `BackgroundTaskSchedulerService` with `autoStart: false` so HTTP processes never run worker loops.
 * - Use `EventsModule.forRoot(...)` (or `WorkerAppModule.forRoot(...)`) in worker processes and integration
 *   tests to register consumers/tasks and control `autoStart`.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    {
      provide: EVENTS_OPTIONS,
      useFactory: () => resolveEventsOptions({ autoStart: false }),
    },
    { provide: EVENT_CONTRACTS, useClass: SharedEventContracts },
    { provide: EVENT_CONSUMERS, useValue: [] },
    { provide: BACKGROUND_TASKS, useValue: [] },
    ...CORE_SERVICES,
  ],
  exports: [EVENTS_OPTIONS, EVENT_CONTRACTS, ...CORE_SERVICES],
})
export class EventsModule {
  static forProducer(): DynamicModule {
    return {
      module: EventsProducerModule,
      providers: [{ provide: EVENT_CONTRACTS, useClass: SharedEventContracts }, OutboxService],
      exports: [OutboxService, EVENT_CONTRACTS],
    };
  }

  static forRoot(config: EventsModuleForRootOptions = {}): DynamicModule {
    const consumers = config.consumers ?? [];
    const tasks = config.tasks ?? [];

    const consumerClasses = consumers.filter((item): item is Type<AnyEventConsumer> =>
      isProviderClass(item),
    );
    const taskClasses = tasks.filter((item): item is Type<AnyBackgroundTaskHandler> =>
      isProviderClass(item),
    );

    const providers: Provider[] = [
      ...consumerClasses,
      ...taskClasses,
      {
        provide: EVENTS_OPTIONS,
        useFactory: () => resolveEventsOptions(config.options),
      },
      config.contracts
        ? { provide: EVENT_CONTRACTS, useValue: config.contracts }
        : { provide: EVENT_CONTRACTS, useClass: SharedEventContracts },
      {
        provide: EVENT_CONSUMERS,
        inject: consumerClasses,
        useFactory: (...resolvedClasses: AnyEventConsumer[]): readonly AnyEventConsumer[] => {
          let classIdx = 0;
          return consumers.map((item) => {
            if (isProviderClass(item)) {
              const instance = resolvedClasses[classIdx];
              classIdx += 1;
              if (!instance) throw new Error(`Failed to resolve consumer ${item.name}`);
              return instance;
            }
            return item;
          });
        },
      },
      {
        provide: BACKGROUND_TASKS,
        inject: taskClasses,
        useFactory: (
          ...resolvedClasses: AnyBackgroundTaskHandler[]
        ): readonly AnyBackgroundTaskHandler[] => {
          let classIdx = 0;
          return tasks.map((item) => {
            if (isProviderClass(item)) {
              const instance = resolvedClasses[classIdx];
              classIdx += 1;
              if (!instance) throw new Error(`Failed to resolve background task ${item.name}`);
              return instance;
            }
            return item;
          });
        },
      },
      ...CORE_SERVICES,
    ];

    return {
      module: EventsModule,
      imports: [PrismaModule, AuditModule, ...(config.imports ?? [])],
      providers,
      exports: [
        EVENTS_OPTIONS,
        EVENT_CONTRACTS,
        EVENT_CONSUMERS,
        BACKGROUND_TASKS,
        ...CORE_SERVICES,
      ],
    };
  }
}
