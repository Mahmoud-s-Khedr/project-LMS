import { ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../infrastructure/storage/storage.module';
import { IdentitySupportModule } from '../auth/identity-support.module';
import { ContentModule } from '../content/content.module';
import { MediaService } from './media.service';
import { MediaStorageService } from './media-storage.service';
import { MediaController } from './media.controller';
import { PublicCoverTask } from './public-cover.task';
import { MediaProcessingTask, ClamAvScanner, MEDIA_SCANNER } from './media-processing.task';
@Module({
  imports: [ContentModule, StorageModule, IdentitySupportModule, AuditModule],
  providers: [
    MediaService,
    MediaStorageService,
    MediaProcessingTask,
    PublicCoverTask,
    {
      provide: MEDIA_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get('MEDIA_SCANNER_MODE') === 'development-bypass') {
          if (config.get('NODE_ENV') === 'production') throw new Error('Development scanner mode is forbidden in production');
          return { scan: async () => 'CLEAN' as const };
        }
        return new ClamAvScanner();
      },
    },
  ],
  controllers: [MediaController],
  exports: [MediaService, MediaStorageService, MEDIA_SCANNER, MediaProcessingTask, PublicCoverTask],
})
export class MediaModule {}
