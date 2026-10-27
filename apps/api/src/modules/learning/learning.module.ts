import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { AuthzModule } from '../../common/authz';
import { AuditModule } from '../audit/audit.module';
import { EventsProducerModule } from '../events/events.module';
import { ContentModule } from '../content/content.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AssessmentAttemptsService } from '../assessments/attempts.service';
import { LearningCompletionService } from './completion.service';
import { EnrollmentGrantService } from './enrollment-grant.service';
import { EnrollmentService } from './enrollment.service';
import { LearnerAccessPolicy } from './learner-access-policy';
import { LearnerService } from './learner.service';
import { LearningCompletionConsumer } from './learning-completion.consumer';
import { LearningCompletionBackstopTask } from './learning-completion.task';
import { LearnerController, RosterController } from './learning.controller';
import { LEARNING_ACCESS_POLICY, LEARNING_ASSESSMENT_RESULTS } from './learning.support';

/**
 * Binds the concrete learner AccessPolicy to `Symbol.for('lms.learning.AccessPolicy')` for every module
 * (content, media, assessments resolve it optionally). It depends only on persistence, so assessments can
 * consume it without an import cycle with LearningModule (which itself imports AssessmentsModule).
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    LearnerAccessPolicy,
    { provide: LEARNING_ACCESS_POLICY, useExisting: LearnerAccessPolicy },
  ],
  exports: [LearnerAccessPolicy, LEARNING_ACCESS_POLICY],
})
export class LearningAccessModule {}

@Module({
  imports: [
    PrismaModule,
    AuthzModule,
    AuditModule,
    EventsProducerModule,
    ContentModule,
    AssessmentsModule,
    LearningAccessModule,
  ],
  controllers: [LearnerController, RosterController],
  providers: [
    { provide: LEARNING_ASSESSMENT_RESULTS, useExisting: AssessmentAttemptsService },
    EnrollmentGrantService,
    LearningCompletionService,
    LearnerService,
    EnrollmentService,
    LearningCompletionConsumer,
    LearningCompletionBackstopTask,
  ],
  exports: [
    LearningAccessModule,
    EnrollmentGrantService,
    LearningCompletionService,
    LearningCompletionConsumer,
    LearningCompletionBackstopTask,
  ],
})
export class LearningModule {}
