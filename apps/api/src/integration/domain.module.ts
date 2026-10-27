import { Global, Module } from '@nestjs/common';
import { AssessmentsModule } from '../modules/assessments';
import { ContentModule, CohortCapacityService } from '../modules/content';
import { CommerceModule, COHORT_RESERVATIONS } from '../modules/commerce';

export const configuredCommerceModule = CommerceModule.register({
  imports: [ContentModule],
  providers: [{ provide: COHORT_RESERVATIONS, useExisting: CohortCapacityService }],
});

/** Export the assessment validator into content's scope without a feature dependency cycle. */
@Global()
@Module({
  imports: [AssessmentsModule],
  exports: [AssessmentsModule],
})
export class AssessmentPublicationIntegrationModule {}
