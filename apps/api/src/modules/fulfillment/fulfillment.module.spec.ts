import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { parse } from 'dotenv';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { FulfillmentModule } from './fulfillment.module';
import { FulfillmentConsumer } from './fulfillment.consumer';
import { FulfillmentReconcileTask } from './fulfillment-reconcile.task';
import { EnrollmentGrantService } from '../learning/enrollment-grant.service';

describe('FulfillmentModule dependency wiring', () => {
  it('resolves consumer, periodic reconciler and shared learning commands without a second grant implementation', async () => {
    const env = parse(readFileSync(resolve('../../.env.example')));
    const ref = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({ ...env, JWT_ACCESS_SECRET: 'fulfillment-wiring-test-at-least-32-chars' }),
          ],
        }),
        FulfillmentModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    try {
      expect(ref.get(FulfillmentConsumer)).toBeInstanceOf(FulfillmentConsumer);
      expect(ref.get(FulfillmentReconcileTask)).toBeInstanceOf(FulfillmentReconcileTask);
      expect(ref.get(EnrollmentGrantService)).toBeInstanceOf(EnrollmentGrantService);
    } finally {
      await ref.close();
    }
  });
});
