import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { parse } from 'dotenv';
import { AssessmentAttemptsService } from '../assessments/attempts.service';
import { AssessmentsModule } from '../assessments/assessments.module';
import { ContentModule } from '../content/content.module';
import { ContentService } from '../content/content.service';
import { MediaModule } from '../media/media.module';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { LearnerAccessPolicy } from './learner-access-policy';
import { LearningModule } from './learning.module';
import { LEARNING_ACCESS_POLICY, LEARNING_ASSESSMENT_RESULTS } from './learning.support';
import { EnrollmentGrantService } from './enrollment-grant.service';
import { LearningCompletionConsumer } from './learning-completion.consumer';

/** DI-only check (no database connection): the one learner AccessPolicy is shared by every consumer module. */
describe('LearningModule wiring', () => {
  it('binds one LearnerAccessPolicy to the shared token for content, media and assessments', async () => {
    const env = parse(readFileSync(resolve('../../.env.example')));
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ...env, JWT_ACCESS_SECRET: 'wiring-test-secret-at-least-32-chars!!' })],
        }),
        ContentModule,
        MediaModule,
        AssessmentsModule,
        LearningModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    const policy = moduleRef.get(LEARNING_ACCESS_POLICY, { strict: false });
    expect(policy).toBeInstanceOf(LearnerAccessPolicy);
    expect(moduleRef.get(LearnerAccessPolicy, { strict: false })).toBe(policy);
    const accessOf = (service: unknown) => (service as { access?: unknown }).access;
    expect(accessOf(moduleRef.get(ContentService, { strict: false }))).toBe(policy);
    expect(accessOf(moduleRef.get(MediaService, { strict: false }))).toBe(policy);
    expect(accessOf(moduleRef.get(AssessmentAttemptsService, { strict: false }))).toBe(policy);
    expect(moduleRef.get(LEARNING_ASSESSMENT_RESULTS, { strict: false })).toBe(
      moduleRef.get(AssessmentAttemptsService, { strict: false }),
    );
    expect(moduleRef.get(EnrollmentGrantService, { strict: false })).toBeDefined();
    expect(moduleRef.get(LearningCompletionConsumer, { strict: false })).toBeDefined();
    expect(moduleRef.get(ConfigService)).toBeDefined();
    await moduleRef.close();
  });
});
