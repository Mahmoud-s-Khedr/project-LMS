import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { PolicyService } from './policy.service';

@Global()
@Module({
  imports: [PrismaModule, JwtModule.register({})],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    PolicyService,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, PolicyService],
})
export class AuthzModule {}
