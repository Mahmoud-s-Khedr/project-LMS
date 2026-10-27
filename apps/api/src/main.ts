import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import type { Environment } from './config/env';
import { configureSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService<Environment, true>);
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
    exposedHeaders: ['x-request-id', 'ETag'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(app.get(ApiExceptionFilter));
  app.enableShutdownHooks();

  configureSwagger(app, config.get('SWAGGER_ENABLED', { infer: true }));
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`API ready at http://localhost:${port}/api/v1`);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
