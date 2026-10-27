import 'reflect-metadata';
import { InvitationMailCleanupTask } from '../modules/tenancy/invitation-mail-cleanup.task';
import { InvitationMailConsumer } from '../modules/tenancy/invitation-mail.consumer';
import { InvitationMailModule } from '../modules/tenancy/invitation-mail.module';
import { MediaModule, MediaProcessingTask, PublicCoverTask } from '../modules/media';
import { AssessmentDeadlineTask } from '../modules/assessments';
import { CommerceReconcileTask } from '../modules/commerce';
import {
  AssessmentPublicationIntegrationModule,
  configuredCommerceModule,
} from '../integration/domain.module';
import {
  LearningModule,
  LearningCompletionConsumer,
  LearningCompletionBackstopTask,
} from '../modules/learning';
import {
  CertificatesModule,
  CertificateCompletionConsumer,
  CertificateRenderTask,
} from '../modules/certificates';
import {
  NotificationsModule,
  NotificationsConsumer,
  NotificationDeliveryTask,
  NotificationRemindersTask,
  NotificationReleasesTask,
} from '../modules/notifications';
import {
  AnalyticsModule,
  AnalyticsExportConsumer,
  AnalyticsExportTask,
  AnalyticsAggregateTask,
} from '../modules/analytics';
import { FulfillmentModule, FulfillmentConsumer, FulfillmentReconcileTask } from '../modules/fulfillment';
import { bootstrapWorker } from './bootstrap';
import type { WorkerBootstrapOptions } from './worker-app.module';

export const DEFAULT_WORKER_BOOTSTRAP_OPTIONS: WorkerBootstrapOptions = {
  imports: [
    InvitationMailModule,
    MediaModule,
    AssessmentPublicationIntegrationModule,
    configuredCommerceModule,
    LearningModule,
    CertificatesModule,
    NotificationsModule,
    AnalyticsModule,
    FulfillmentModule,
  ],
  consumers: [
    InvitationMailConsumer,
    LearningCompletionConsumer,
    CertificateCompletionConsumer,
    NotificationsConsumer,
    AnalyticsExportConsumer,
    FulfillmentConsumer,
  ],
  tasks: [
    InvitationMailCleanupTask,
    MediaProcessingTask,
    PublicCoverTask,
    AssessmentDeadlineTask,
    CommerceReconcileTask,
    LearningCompletionBackstopTask,
    CertificateRenderTask,
    NotificationDeliveryTask,
    NotificationRemindersTask,
    NotificationReleasesTask,
    AnalyticsExportTask,
    AnalyticsAggregateTask,
    FulfillmentReconcileTask,
  ],
};

if (require.main === module) {
  void bootstrapWorker(DEFAULT_WORKER_BOOTSTRAP_OPTIONS).catch((error: unknown) => {
    process.stderr.write(
      `Worker failed to start: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

export { bootstrapWorker };
