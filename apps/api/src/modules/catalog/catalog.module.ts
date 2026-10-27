import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { EventsProducerModule } from '../events/events.module';
import { CatalogService } from './catalog.service';
import {
  PublicCatalogController,
  CoursesController,
  CategoriesController,
} from './catalog.controller';
@Module({
  imports: [ContentModule, EventsProducerModule],
  providers: [CatalogService],
  controllers: [PublicCatalogController, CoursesController, CategoriesController],
  exports: [CatalogService],
})
export class CatalogModule {}
