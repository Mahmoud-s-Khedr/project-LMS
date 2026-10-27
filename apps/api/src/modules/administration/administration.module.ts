import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthzModule } from '../../common/authz/authz.module';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { AdministrationService } from './administration.service';
import {
  PlatformAdministrationController,
  WorkspaceOperationsController,
} from './administration.controller';

@Module({
  imports: [PrismaModule, AuthzModule, AuditModule, EventsModule],
  controllers: [PlatformAdministrationController, WorkspaceOperationsController],
  providers: [AdministrationService],
  exports: [AdministrationService],
})
export class AdministrationModule {}
