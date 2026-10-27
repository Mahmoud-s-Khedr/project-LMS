import { LearningAccessModule } from '../learning/learning.module';
import { NotificationReleasesTask } from './notification-releases.task';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { ContentModule } from '../content/content.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsConsumer } from './notifications.consumer';
import { NotificationDeliveryTask } from './notification-delivery.task';
import { NotificationRemindersTask } from './notification-reminders.task';
@Module({
  imports: [PrismaModule, MailModule, ContentModule, LearningAccessModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsConsumer,
    NotificationDeliveryTask,
    NotificationRemindersTask,
    NotificationReleasesTask,
  ],
  exports: [
    NotificationsService,
    NotificationsConsumer,
    NotificationDeliveryTask,
    NotificationRemindersTask,
    NotificationReleasesTask,
  ],
})
export class NotificationsModule {}
