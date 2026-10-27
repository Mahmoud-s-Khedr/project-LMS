import { Module, type DynamicModule, type ModuleMetadata, type Provider } from '@nestjs/common';
import { IdentitySupportModule } from '../auth/identity-support.module';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthzModule } from '../../common/authz/authz.module';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { PAYMENT_PROVIDER, StripePaymentProvider } from './payment-provider';
import { CommerceAdminService } from './commerce-admin.service';
import { CheckoutService } from './checkout.service';
import { BillingService } from './billing.service';
import { CommerceWorkerService, CommerceReconcileTask } from './commerce-worker.service';
import {
  CommerceController,
  CommerceSelfController,
  CommercePublicController,
  StripeWebhookController,
} from './commerce.controller';
import { CommerceCatalogService } from './commerce-catalog.service';
@Module({
  imports: [IdentitySupportModule, PrismaModule, AuthzModule, AuditModule, EventsProducerModule],
  providers: [
    { provide: PAYMENT_PROVIDER, useClass: StripePaymentProvider },
    CommerceAdminService,
    CheckoutService,
    BillingService,
    CommerceWorkerService,
    CommerceCatalogService,
    CommerceReconcileTask,
  ],
  controllers: [
    CommerceController,
    CommerceSelfController,
    CommercePublicController,
    StripeWebhookController,
  ],
  exports: [CheckoutService, BillingService, CommerceWorkerService, CommerceReconcileTask],
})
export class CommerceModule {
  static register(options: {
    imports?: ModuleMetadata['imports'];
    providers?: Provider[];
  }): DynamicModule {
    return {
      module: CommerceModule,
      imports: options.imports ?? [],
      providers: options.providers ?? [],
    };
  }
}
