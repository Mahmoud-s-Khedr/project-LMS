import { Injectable } from '@nestjs/common';
import { emptyInputSchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { InvitationMailService } from './invitation-mail.service';

/** Explicitly registered worker backstop; bounded to 1,000 expired capabilities per minute/run. */
@Injectable()
export class InvitationMailCleanupTask implements BackgroundTaskHandler<Record<string, never>> {
  readonly name = 'tenancy.invitation-capability-cleanup';
  readonly everyMs = 60_000;
  readonly payloadSchema = emptyInputSchema;

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: InvitationMailService,
  ) {}

  async handle(): Promise<void> {
    for (let batch = 0; batch < 10; batch++) {
      const count = await this.prisma.$transaction((tx) => this.capabilities.purgeExpired(tx, 100));
      if (count < 100) return;
    }
  }
}
