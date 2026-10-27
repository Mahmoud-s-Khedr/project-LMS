import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerAppModule, type WorkerBootstrapOptions } from './worker-app.module';

/**
 * Creates and initializes a standalone Nest application context for the worker process with explicit
 * processor registrations and shutdown hooks enabled.
 */
export async function createWorkerContext(
  options: WorkerBootstrapOptions = {},
): Promise<INestApplicationContext> {
  const context = await NestFactory.createApplicationContext(WorkerAppModule.forRoot(options), {
    logger: ['error', 'warn', 'log'],
  });
  context.enableShutdownHooks();
  await context.init();
  return context;
}

/**
 * Boots the standalone worker process and attaches SIGTERM/SIGINT handlers to drain in-flight jobs and
 * close database/Redis connections cleanly.
 */
export async function bootstrapWorker(
  options: WorkerBootstrapOptions = {},
): Promise<INestApplicationContext> {
  const context = await createWorkerContext(options);
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      await context.close();
    } finally {
      process.removeListener('SIGTERM', onSignal);
      process.removeListener('SIGINT', onSignal);
    }
  };
  const onSignal = () => {
    void shutdown();
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);
  return context;
}
