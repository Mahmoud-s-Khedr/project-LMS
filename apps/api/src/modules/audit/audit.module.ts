import { type DynamicModule, Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuditQueryService } from './audit-query.service';
import { AUDIT_OPTIONS, type AuditModuleOptions } from './audit.options';
import { AuditService } from './audit.service';

/**
 * Append-only, redacted audit log. Imports PrismaModule so standalone tests can override PrismaService.
 * Import `AuditModule` (env-configured) or `AuditModule.forRoot(options)` explicitly.
 */
@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditQueryService],
  exports: [AuditService, AuditQueryService],
})
export class AuditModule {
  static forRoot(options: AuditModuleOptions): DynamicModule {
    return {
      module: AuditModule,
      imports: [PrismaModule],
      providers: [{ provide: AUDIT_OPTIONS, useValue: options }, AuditService, AuditQueryService],
      exports: [AuditService, AuditQueryService],
    };
  }
}
