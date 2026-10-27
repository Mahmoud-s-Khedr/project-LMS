import { Module } from '@nestjs/common';
import { IdentitySupportModule } from '../auth/identity-support.module';
import { TenancyModule } from './tenancy.module';
import { InvitationMailConsumer } from './invitation-mail.consumer';
import { InvitationMailCleanupTask } from './invitation-mail-cleanup.task';

/** Worker-only: register the exported consumer explicitly with P1-E's worker bootstrap. */
@Module({
  imports: [TenancyModule, IdentitySupportModule],
  providers: [InvitationMailConsumer, InvitationMailCleanupTask],
  exports: [
    InvitationMailConsumer,
    InvitationMailCleanupTask,
    TenancyModule,
    IdentitySupportModule,
  ],
})
export class InvitationMailModule {}
