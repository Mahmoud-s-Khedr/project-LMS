import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { IdentitySupportModule } from './identity-support.module';
import { AuthController, ProfileSecurityController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard } from './csrf.guard';

@Module({
  imports: [IdentitySupportModule, UsersModule],
  controllers: [AuthController, ProfileSecurityController],
  providers: [AuthService, CsrfGuard],
  exports: [AuthService],
})
export class AuthModule {}
