import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma, WorkspaceInvitation } from '@prisma/client';
import { InvitationMailService } from './invitation-mail.service';
import { OutboxService } from '../events/outbox.service';
import { SharedEventContracts } from '../events/event-contracts';

describe('Invitation encrypted mail capabilities', () => {
  const key = randomBytes(32).toString('base64');
  const row: WorkspaceInvitation = {
    id: randomUUID(),
    workspaceId: randomUUID(),
    email: 'invited@example.com',
    role: 'ADMIN',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 86400000),
    acceptedAt: null,
    revokedAt: null,
    invitedById: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const token = 'a'.repeat(64);
  const outbox = new OutboxService(new SharedEventContracts());
  const service = new InvitationMailService(
    new ConfigService({ TENANCY_MAIL_KEY: key, TENANCY_MAIL_KEY_ID: 'key-1' }),
    outbox,
  );
  it('round-trips authenticated ciphertext bound to tenant, invitation, key ID and expiry', () => {
    const sealed = service.seal(row, token);
    expect(JSON.stringify(sealed)).not.toContain(token);
    expect(service.open(row.workspaceId, row.id, sealed)).toEqual({ invitationId: row.id, token });
    expect(() => service.open(randomUUID(), row.id, sealed)).toThrow();
    expect(() => service.open(row.workspaceId, randomUUID(), sealed)).toThrow();
    expect(() =>
      service.open(row.workspaceId, row.id, {
        ...sealed,
        expiresAt: new Date(Date.now() + 100000).toISOString(),
      }),
    ).toThrow();
    const bytes = Buffer.from(sealed.ciphertext, 'base64url');
    bytes[15] = bytes[15]! ^ 1;
    expect(() =>
      service.open(row.workspaceId, row.id, { ...sealed, ciphertext: bytes.toString('base64url') }),
    ).toThrow();
  });
  it('supports decryption across key rotation and rejects missing, expired or malformed keys', () => {
    const sealed = service.seal(row, token);
    const rotated = new InvitationMailService(
      new ConfigService({
        TENANCY_MAIL_KEY: randomBytes(32).toString('base64'),
        TENANCY_MAIL_KEY_ID: 'key-2',
        TENANCY_MAIL_PREVIOUS_KEYS: JSON.stringify({ 'key-1': key }),
      }),
      outbox,
    );
    expect(rotated.open(row.workspaceId, row.id, sealed).token).toBe(token);
    const missing = new InvitationMailService(new ConfigService({ TENANCY_MAIL_KEY: '' }), outbox);
    expect(() => missing.seal(row, token)).toThrow('not configured');
    expect(() =>
      service.open(row.workspaceId, row.id, { ...sealed, expiresAt: '2020-01-01T00:00:00.000Z' }),
    ).toThrow('expired');
  });
  it('uses the shared strict event schema and existing transaction-aware OutboxService', async () => {
    const create = jest.fn().mockResolvedValue({ id: randomUUID(), sequence: 1n });
    const tx = { outboxEvent: { create } } as unknown as Prisma.TransactionClient;
    await service.enqueue(tx, row, token);
    expect(create).toHaveBeenCalledTimes(1);
    const input = create.mock.calls[0]![0].data;
    expect(input).toMatchObject({
      workspaceId: row.workspaceId,
      type: 'workspace.invitation.created.v1',
      aggregateId: row.id,
    });
    expect(input.payload.mailCapability).toMatchObject({ keyId: 'key-1' });
    expect(JSON.stringify(input)).not.toContain(token);
    expect(service.open(row.workspaceId, row.id, input.payload.mailCapability).token).toBe(token);
  });
});
