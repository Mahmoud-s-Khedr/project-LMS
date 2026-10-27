import { Module } from '@nestjs/common';
import { AuthzModule } from '../../common/authz';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { LearningAccessModule } from '../learning/learning.module';
import { MediaModule } from '../media/media.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsReportsService } from './analytics-reports.service';
import { AnalyticsExportTask } from './analytics-export.task';
import { AnalyticsAggregateTask } from './analytics-aggregate.task';
@Module({
  imports: [
    PrismaModule,
    AuthzModule,
    StorageModule,
    AuditModule,
    EventsProducerModule,
    LearningAccessModule,
    MediaModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsReportsService,
    AnalyticsExportTask,
    AnalyticsAggregateTask,
  ],
  exports: [AnalyticsService, AnalyticsReportsService, AnalyticsExportTask, AnalyticsAggregateTask],
})
export class AnalyticsModule {}
