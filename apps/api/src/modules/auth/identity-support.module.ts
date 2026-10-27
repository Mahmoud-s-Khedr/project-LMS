import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthzModule } from '../../common/authz/authz.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { PasswordService } from './password.service';
import { ConfigService } from '@nestjs/config';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { IdentityEvents } from './identity-events.service';

@Module({
  providers: [
    {
      provide: 'THROTTLE_REDIS',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('THROTTLE_STORAGE') === 'memory'
          ? null
          : new RedisThrottlerStorage(config.get<string>('REDIS_URL') ?? 'redis://localhost:56379'),
    },
  ],
  exports: ['THROTTLE_REDIS'],
})
class ThrottleStorageModule {}

@Module({
  imports: [
    AuthzModule,
    MailModule,
    StorageModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [ThrottleStorageModule],
      inject: ['THROTTLE_REDIS'],
      useFactory: (storage: RedisThrottlerStorage | null) => ({
        throttlers: [{ ttl: 60000, limit: process.env.NODE_ENV === 'test' ? 1000 : 100 }],
        ...(storage ? { storage } : {}),
      }),
    }),
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
