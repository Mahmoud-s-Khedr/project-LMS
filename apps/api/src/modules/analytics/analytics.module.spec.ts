import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MediaStorageService } from '../media/media-storage.service';
import { AnalyticsModule } from './analytics.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsExportTask } from './analytics-export.task';
import { AnalyticsAggregateTask } from './analytics-aggregate.task';
describe('AnalyticsModule', () => {
  it('resolves actual production providers without worker loops in the HTTP module', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              JWT_ACCESS_SECRET: 'analytics-test-secret-at-least-32-characters',
              SMTP_HOST: 'localhost',
              SMTP_PORT: 51025,
              SMTP_FROM: 'noreply@example.test',
            }),
          ],
        }),
        AnalyticsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(StorageService)
      .useValue({})
      .overrideProvider(MediaStorageService)
      .useValue({})
      .compile();
    expect(module.get(AnalyticsService)).toBeInstanceOf(AnalyticsService);
    expect(module.get(AnalyticsExportTask)).toBeInstanceOf(AnalyticsExportTask);
    expect(module.get(AnalyticsAggregateTask)).toBeInstanceOf(AnalyticsAggregateTask);
    await module.close();
  });
});
