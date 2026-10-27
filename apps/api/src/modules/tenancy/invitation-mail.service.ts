import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, type WorkspaceInvitation } from '@prisma/client';
import { domainEventSchema, mailCapabilitySchema, z } from '@lms/shared';
import { OutboxService } from '../events/outbox.service';

export const INVITATION_MAIL_EVENT = 'workspace.invitation.created.v1';
const mailContentsSchema = z.strictObject({
  invitationId: z.uuid(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export type MailCapability = z.infer<typeof mailCapabilitySchema>;

/** Mail-only authenticated envelope. No raw capability leaves the SMTP consumer. */
@Injectable()
export class InvitationMailService {
  constructor(
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
  ) {}

  private key(keyId: string): Buffer {
    const currentId = this.config.get<string>('TENANCY_MAIL_KEY_ID') ?? 'v1';
    let encoded: unknown =
      keyId === currentId ? this.config.get<string>('TENANCY_MAIL_KEY') : undefined;
    if (!encoded) {
      try {
        const previous: unknown = JSON.parse(
          this.config.get<string>('TENANCY_MAIL_PREVIOUS_KEYS') ?? '{}',
        );
        if (previous && typeof previous === 'object')
          encoded = (previous as Record<string, unknown>)[keyId];
      } catch {
        throw new ServiceUnavailableException('Invitation mail encryption is not configured');
      }
    }
    if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
      throw new ServiceUnavailableException('Invitation mail encryption is not configured');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32)
      throw new ServiceUnavailableException('Invitation mail encryption is not configured');
    return key;
  }
  seal(
    invitation: Pick<WorkspaceInvitation, 'id' | 'workspaceId' | 'expiresAt'>,
    token: string,
  ): MailCapability {
    const keyId = this.config.get<string>('TENANCY_MAIL_KEY_ID') ?? 'v1';
    const expiresAt = invitation.expiresAt.toISOString();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(keyId), iv);
    cipher.setAAD(
      Buffer.from(
        `${INVITATION_MAIL_EVENT}:${invitation.workspaceId}:${invitation.id}:${keyId}:${expiresAt}`,
      ),
    );
    const plaintext = JSON.stringify(
      mailContentsSchema.parse({ invitationId: invitation.id, token }),
    );
    const ciphertext = Buffer.concat([
      iv,
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString('base64url');
    return mailCapabilitySchema.parse({ keyId, ciphertext, expiresAt });
  }
  open(
    workspaceId: string,
    invitationId: string,
    raw: unknown,
  ): { invitationId: string; token: string } {
    const capability = mailCapabilitySchema.parse(raw);
    if (Date.parse(capability.expiresAt) <= Date.now())
      throw new Error('Invitation capability expired');
    const bytes = Buffer.from(capability.ciphertext, 'base64url');
    if (bytes.length < 29) throw new Error('Invalid invitation capability');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(capability.keyId),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(
      Buffer.from(
        `${INVITATION_MAIL_EVENT}:${workspaceId}:${invitationId}:${capability.keyId}:${capability.expiresAt}`,
      ),
    );
    decipher.setAuthTag(bytes.subarray(-16));
    const plaintext = Buffer.concat([
      decipher.update(bytes.subarray(12, -16)),
      decipher.final(),
    ]).toString('utf8');
    const contents = mailContentsSchema.parse(JSON.parse(plaintext));
    if (contents.invitationId !== invitationId)
      throw new Error('Invitation capability scope mismatch');
    return contents;
  }
  async enqueue(
    tx: Prisma.TransactionClient,
    invitation: WorkspaceInvitation,
    token: string,
  ): Promise<void> {
    const capability = this.seal(invitation, token);
    // Validate with the shared versioned envelope before using the existing outbox writer.
    const parsed = domainEventSchema.safeParse({
      id: randomUUID(),
      type: INVITATION_MAIL_EVENT,
      workspaceId: invitation.workspaceId,
      schemaVersion: 1,
      aggregateType: 'WorkspaceInvitation',
      aggregateId: invitation.id,
      sequence: '0',
      timestamp: new Date().toISOString(),
      payload: { invitationId: invitation.id, mailCapability: capability },
    });
    if (!parsed.success)
      throw new ServiceUnavailableException('Invitation mail event contract is not registered');
    await this.outbox.append(tx, parsed.data);
  }

  /** Bounded backstop for expired capabilities, including failed/dead-lettered deliveries. Worker schedules it. */
  async purgeExpired(tx: Prisma.TransactionClient, limit = 100): Promise<number> {
    const batchSize = z.number().int().min(1).max(1000).parse(limit);
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "OutboxEvent"
      WHERE "type" = ${INVITATION_MAIL_EVENT}
        AND "payload" ? 'mailCapability'
        AND ("payload" #>> '{mailCapability,expiresAt}')::timestamptz <= now()
      ORDER BY "sequence" LIMIT ${batchSize} FOR UPDATE SKIP LOCKED`);
    for (const row of rows) await this.outbox.scrubMailCapability(tx, row.id);
    return rows.length;
  }
}
