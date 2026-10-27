import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuthzModule } from '../../common/authz';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { ContentModule } from '../content/content.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { CertificatesService } from './certificates.service';
import { CertificateRenderer } from './certificate-renderer';
import { CertificateCompletionConsumer, CertificateRenderTask } from './certificates.tasks';
import {
  CertificateStaffController,
  MyCertificatesController,
  CertificateVerificationController,
} from './certificates.controller';
@Module({
  imports: [
    PrismaModule,
    AuthzModule,
    AuditModule,
    EventsProducerModule,
    StorageModule,
    ContentModule,
    AssessmentsModule,
    NotificationsModule,
  ],
  controllers: [
    CertificateStaffController,
    MyCertificatesController,
    CertificateVerificationController,
  ],
  providers: [
    CertificatesService,
    CertificateRenderer,
    CertificateCompletionConsumer,
    CertificateRenderTask,
  ],
  exports: [
    CertificatesService,
    CertificateRenderer,
    CertificateCompletionConsumer,
    CertificateRenderTask,
  ],
})
export class CertificatesModule {}
