import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { IdentitySupportModule } from '../auth/identity-support.module';
import { AdminUsersController, UsersController } from './users.controller';
import { UserPresenter } from './user.presenter';
import { UsersService } from './users.service';

@Module({
  imports: [IdentitySupportModule, AuditModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, UserPresenter],
  exports: [UsersService, UserPresenter],
})
export class UsersModule {}
