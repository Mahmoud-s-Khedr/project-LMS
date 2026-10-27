import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eventPayloadSchemas } from '@lms/shared';
import type { Prisma } from '@prisma/client';
import type { DeliveredEvent, EventConsumer } from '../events/event-consumer';
import { OutboxService } from '../events/outbox.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { hashToken } from '../auth/token.util';
import { InvitationMailService, INVITATION_MAIL_EVENT } from './invitation-mail.service';

const payloadSchema = eventPayloadSchemas[INVITATION_MAIL_EVENT];
/** Explicit worker registration only. SMTP is at-least-once; the event receipt prevents normal duplicates. */
@Injectable()
export class InvitationMailConsumer implements EventConsumer<typeof INVITATION_MAIL_EVENT> {
  readonly name = 'tenancy.invitation-mail';
  readonly transactionTimeoutMs = 15000;
  readonly eventTypes = [INVITATION_MAIL_EVENT] as const;
  constructor(
    private readonly capabilities: InvitationMailService,
    private readonly outbox: OutboxService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}
  async handle(
    event: DeliveredEvent<typeof INVITATION_MAIL_EVENT>,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (event.type !== INVITATION_MAIL_EVENT || !event.workspaceId)
      throw new Error('Unexpected invitation event');
    const payload = payloadSchema.parse(event.payload);
    // Read authoritative outbox material, not an old queue envelope after a prior purge.
    const stored = await tx.outboxEvent.findFirst({
      where: { id: event.id, workspaceId: event.workspaceId },
    });
    const currentPayload = stored ? payloadSchema.parse(stored.payload) : undefined;
    if (!currentPayload?.mailCapability) return;
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${event.workspaceId}::uuid FOR UPDATE`;
    const invitation = await tx.workspaceInvitation.findFirst({
      where: {
        id: payload.invitationId,
        workspaceId: event.workspaceId,
        workspace: { status: 'ACTIVE', deletedAt: null },
      },
    });
    const capability = currentPayload.mailCapability;
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.expiresAt.getTime() <= Date.now() ||
      Date.parse(capability.expiresAt) <= Date.now()
    ) {
      await this.outbox.scrubMailCapability(tx, event.id);
      return;
    }
    const contents = this.capabilities.open(event.workspaceId, invitation.id, capability);
    // A resend changes the verifier, making queued old email capabilities obsolete.
    if (hashToken(contents.token) !== invitation.tokenHash) {
      await this.outbox.scrubMailCapability(tx, event.id);
      return;
    }
    const origin = this.config.get<string>('WEB_ORIGIN');
    if (!origin) throw new Error('WEB_ORIGIN is required');
    const url = new URL('/accept-invitation', origin);
    url.searchParams.set('token', contents.token);
    await this.mail.send({
      to: invitation.email,
      subject: 'You are invited to an LMS workspace',
      text: `Accept your workspace invitation: ${url.toString()}\nThis link expires in seven days. Verify the invited email before accepting.`,
    });
    await this.outbox.scrubMailCapability(tx, event.id);
  }
}
