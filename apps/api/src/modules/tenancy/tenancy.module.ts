import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentitySupportModule } from '../auth/identity-support.module';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { TenancyService } from './tenancy.service';
import { InvitationMailService } from './invitation-mail.service';
import {
  CourseStaffController,
  InvitationAcceptanceController,
  MyWorkspacesController,
  WorkspaceInvitationsController,
  WorkspaceMembersController,
  WorkspacesController,
} from './tenancy.controller';

@Module({
  imports: [PrismaModule, IdentitySupportModule, AuditModule, EventsProducerModule],
  controllers: [
    MyWorkspacesController,
    WorkspacesController,
    WorkspaceMembersController,
    WorkspaceInvitationsController,
    InvitationAcceptanceController,
    CourseStaffController,
  ],
  providers: [TenancyService, InvitationMailService],
  exports: [TenancyService, InvitationMailService, EventsProducerModule],
})
export class TenancyModule {}
