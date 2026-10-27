import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { LearningModule } from '../learning/learning.module';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentConsumer } from './fulfillment.consumer';
import { FulfillmentReconcileTask } from './fulfillment-reconcile.task';
@Module({
  imports: [PrismaModule, LearningModule],
  providers: [FulfillmentService, FulfillmentConsumer, FulfillmentReconcileTask],
  exports: [FulfillmentService, FulfillmentConsumer, FulfillmentReconcileTask],
})
export class FulfillmentModule {}
