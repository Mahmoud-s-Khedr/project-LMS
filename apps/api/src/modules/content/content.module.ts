import { ContentRequestContext, ContentRequestInterceptor } from './content-request-context';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthzModule } from '../../common/authz';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { ContentPublicationService } from './publication.service';
import {
  ContentSupport,
  ContentPagination,
  CONTENT_PUBLICATION_VALIDATOR,
} from './content.support';
import { CohortCapacityService } from './cohort-capacity.service';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { PublicCohortsController } from './public-cohorts.controller';
@Module({
  imports: [PrismaModule, AuthzModule, AuditModule, EventsProducerModule],
  providers: [
    ContentRequestContext,
    ContentRequestInterceptor,
    ContentPublicationService,
    { provide: CONTENT_PUBLICATION_VALIDATOR, useExisting: ContentPublicationService },
    ContentSupport,
    ContentPagination,
    CohortCapacityService,
    ContentService,
  ],
  controllers: [ContentController, PublicCohortsController],
  exports: [
    ContentRequestContext,
    ContentRequestInterceptor,
    ContentPublicationService,
    ContentSupport,
    ContentPagination,
    CohortCapacityService,
  ],
})
export class ContentModule {}
