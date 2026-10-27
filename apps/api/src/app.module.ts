import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnvironment, type Environment } from './config/env';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { QueueModule } from './infrastructure/queue/queue.module';
import { StorageModule } from './infrastructure/storage/storage.module';
import { MailModule } from './infrastructure/mail/mail.module';
import { HealthModule } from './health/health.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { UsersModule } from './modules/users/users.module';

import { AdministrationModule } from './modules/administration';
import { FulfillmentModule } from './modules/fulfillment';
import { LearningModule } from './modules/learning';
import { CertificatesModule } from './modules/certificates';
import { NotificationsModule } from './modules/notifications';
import { AnalyticsModule } from './modules/analytics';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ContentModule } from './modules/content';
import { MediaModule } from './modules/media';
import {
  AssessmentPublicationIntegrationModule,
  configuredCommerceModule,
} from './integration/domain.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnvironment,
      cache: true,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (request, response) => {
            const incoming = request.headers['x-request-id'];
            const id =
              typeof incoming === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(incoming)
                ? incoming
                : randomUUID();
            response.setHeader('x-request-id', id);
            return id;
          },
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          serializers: {
            req: (request) => ({
              id: request.id,
              method: request.method,
              url: typeof request.url === 'string' ? request.url.split('?')[0] : request.url,
            }),
          },
          customProps: (request) => ({ requestId: request.id }),
        },
      }),
    }),
    PrismaModule,
    QueueModule,
    StorageModule,
    MailModule,
    HealthModule,
    AuditModule,
    EventsModule,
    AuthModule,
    UsersModule,
    TenancyModule,
    AssessmentPublicationIntegrationModule,
    CatalogModule,
    ContentModule,
    MediaModule,
    configuredCommerceModule,
    LearningModule,
    CertificatesModule,
    NotificationsModule,
    AnalyticsModule,
    AdministrationModule,
    FulfillmentModule,
  ],
  providers: [ApiExceptionFilter],
})
export class AppModule {}
