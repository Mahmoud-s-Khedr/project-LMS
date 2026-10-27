import { type DynamicModule, Module, type ModuleMetadata, type Provider } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthzModule } from '../../common/authz/authz.module';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { ASSESSMENT_PUBLISH_VALIDATOR } from './assessment-domain';
import { AssessmentRepository } from './assessment.repository';
import { AssessmentAuthoringService } from './authoring.service';
import { AssessmentAttemptsService } from './attempts.service';
import { AssessmentGradingService } from './grading.service';
import { AssessmentDeadlineTask } from './deadline.task';
import {
  AssessmentAuthoringController,
  AssessmentLearnerController,
  QuestionBanksController,
} from './assessment.controller';
@Module({
  imports: [PrismaModule, AuthzModule, AuditModule, EventsProducerModule],
  controllers: [
    QuestionBanksController,
    AssessmentAuthoringController,
    AssessmentLearnerController,
  ],
  providers: [
    AssessmentRepository,
    AssessmentAuthoringService,
    AssessmentAttemptsService,
    AssessmentGradingService,
    AssessmentDeadlineTask,
    { provide: ASSESSMENT_PUBLISH_VALIDATOR, useExisting: AssessmentAuthoringService },
  ],
  exports: [
    AssessmentAuthoringService,
    AssessmentAttemptsService,
    AssessmentDeadlineTask,
    ASSESSMENT_PUBLISH_VALIDATOR,
  ],
})
export class AssessmentsModule {
  /** Bind ASSESSMENT_ACCESS_POLICY to the shared AccessPolicy implementation exported by learning. */
  static withAccess(
    imports: NonNullable<ModuleMetadata['imports']>,
    provider: Provider,
  ): DynamicModule {
    return { module: AssessmentsModule, imports, providers: [provider] };
  }
}
