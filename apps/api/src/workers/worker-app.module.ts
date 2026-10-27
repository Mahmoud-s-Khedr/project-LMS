import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from '../config/env';
import { PrismaModule } from '../infrastructure/prisma/prisma.module';
import { AuditModule } from '../modules/audit/audit.module';
import type { AuditModuleOptions } from '../modules/audit/audit.options';
import type { EventContracts } from '../modules/events/event-contracts';
import {
  type BackgroundTaskRegistration,
  type ConsumerRegistration,
  EventsModule,
} from '../modules/events/events.module';
import type { EventsOptionsInput } from '../modules/events/events.options';

export interface WorkerBootstrapOptions {
  /**
   * Feature modules that provide dependencies required by the explicitly registered consumers/tasks.
   * No unfinished feature module is imported by default; P5-I registers concrete modules here.
   */
  readonly imports?: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>>;
  /** Explicitly registered event consumers (provider classes or instances). */
  readonly consumers?: readonly ConsumerRegistration[];
  /** Explicitly registered delayed/periodic background task handlers (provider classes or instances). */
  readonly tasks?: readonly BackgroundTaskRegistration[];
  /** Overrides for queue prefix, Redis URL, concurrency, lease duration, autoStart, etc. */
  readonly options?: EventsOptionsInput;
  /** Optional AuditModule configuration overrides. */
  readonly auditOptions?: AuditModuleOptions;
  /** Optional custom event contracts adapter (defaults to `SharedEventContracts`). */
  readonly contracts?: EventContracts;
  /**
   * Whether to include the global `ConfigModule` and `PrismaModule` infrastructure (default `true`).
   * Set to `false` in unit tests that supply a stubbed `PrismaService`.
   */
  readonly includeInfrastructure?: boolean;
}

/**
 * Worker process root module. Contains no imports of incomplete feature modules and performs no runtime
 * directory scanning; all processors (`consumers` and `tasks`) are registered explicitly.
 */
@Module({})
export class WorkerAppModule {
  static forRoot(config: WorkerBootstrapOptions = {}): DynamicModule {
    const includeInfrastructure = config.includeInfrastructure ?? true;
    const infrastructureImports: Array<Type<unknown> | DynamicModule | Promise<DynamicModule>> =
      includeInfrastructure
        ? [
            ConfigModule.forRoot({
              isGlobal: true,
              envFilePath: ['.env', '../../.env'],
              validate: validateEnvironment,
              cache: true,
            }),
            PrismaModule,
          ]
        : [];

    const auditImport = config.auditOptions
      ? AuditModule.forRoot(config.auditOptions)
      : AuditModule;

    const eventsImport = EventsModule.forRoot({
      imports: config.imports,
      consumers: config.consumers,
      tasks: config.tasks,
      options: config.options,
      contracts: config.contracts,
    });

    return {
      module: WorkerAppModule,
      imports: [...infrastructureImports, auditImport, eventsImport],
      exports: [auditImport, eventsImport],
    };
  }
}
