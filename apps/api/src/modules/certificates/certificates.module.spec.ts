import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CertificatesModule } from './certificates.module';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { CertificatesService } from './certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
it('resolves real feature modules and exported consumer/task dependencies', async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            JWT_ACCESS_SECRET: 'module-test-secret',
            CONTENT_HOST_KEY: 'module-test-host-key',
          }),
        ],
      }),
      ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
      CertificatesModule,
    ],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .overrideProvider(StorageService)
    .useValue({ privateBucket: 'test' })
    .overrideProvider(MailService)
    .useValue({ send: jest.fn() })
    .compile();
  expect(module.get(CertificatesService)).toBeInstanceOf(CertificatesService);
  expect(module.get(NotificationsService)).toBeInstanceOf(NotificationsService);
  await module.close();
});
