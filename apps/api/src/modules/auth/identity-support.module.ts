import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthzModule } from '../../common/authz/authz.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { PasswordService } from './password.service';
import { IdentityEvents } from './identity-events.service';

@Module({
  imports: [
    AuthzModule,
    MailModule,
    StorageModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: process.env.NODE_ENV === 'test' ? 1000 : 100,
      },
    ]),
  ],
  providers: [PasswordService, IdentityEvents],
  exports: [
    AuthzModule,
    PasswordService,
    IdentityEvents,
    ThrottlerModule,
    MailModule,
    StorageModule,
  ],
})
export class IdentitySupportModule {}
