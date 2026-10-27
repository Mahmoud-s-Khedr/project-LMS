import type { Workspace, WorkspaceMember } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { TenancyService } from './tenancy.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PasswordService } from '../auth/password.service';
import { IdentityEvents } from '../auth/identity-events.service';
import { InvitationMailService } from './invitation-mail.service';
import { AuditService } from '../audit/audit.service';
import { tenancyEtag } from './tenancy.util';

describe('Tenancy command authorization', () => {
  const actor: AuthenticatedUser = {
    id: randomUUID(),
    email: 'admin@example.com',
    name: 'Admin',
    platformRole: 'SUPER_ADMIN',
    emailVerifiedAt: new Date(),
    sessionId: randomUUID(),
    familyId: randomUUID(),
  };
  const row: Workspace = {
    id: randomUUID(),
    ownerId: actor.id,
    kind: 'ACADEMY',
    status: 'ACTIVE',
    suspendedAt: null,
    suspensionReason: null,
    slug: 'academy',
    name: 'Academy',
    description: null,
    logoUrl: null,
    defaultCurrency: 'usd',
    timezone: 'UTC',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
  const membership: WorkspaceMember = {
    id: randomUUID(),
    workspaceId: row.id,
    userId: actor.id,
    role: 'ADMIN',
    status: 'ACTIVE',
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
  const tx = {
    $queryRaw: jest.fn(),
    user: { findFirst: jest.fn() },
    workspace: { findFirst: jest.fn(), update: jest.fn() },
    workspaceMember: { findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
    courseStaff: { deleteMany: jest.fn() },
  };
  const prisma = { $transaction: jest.fn() } as unknown as PrismaService;
  const events = { emit: jest.fn() };
  const audits = { append: jest.fn() };
  const service = new TenancyService(
    prisma,
    new PolicyService(prisma),
    {} as PasswordService,
    events as unknown as IdentityEvents,
    {} as InvitationMailService,
    audits as unknown as AuditService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    tx.user.findFirst.mockResolvedValue({ ...actor, status: 'ACTIVE', deletedAt: null });
    tx.workspace.findFirst.mockResolvedValue(row);
    tx.workspaceMember.findFirst.mockResolvedValue(membership);
  });
  it('ignores a stale platform role in the access token and uses the persisted user', async () => {
    tx.user.findFirst.mockResolvedValue({ ...actor, platformRole: 'STUDENT' });
    tx.workspaceMember.findFirst.mockResolvedValue(null);
    await expect(service.get(actor, row.id, 'request')).rejects.toMatchObject({ status: 404 });
    expect(audits.append).not.toHaveBeenCalled();
  });
  it('rejects a suspended actor even with a valid-looking token', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.get(actor, row.id, 'request')).rejects.toMatchObject({ status: 401 });
  });
  it('audits super-admin reads through the existing audit service', async () => {
    await service.get(actor, row.id, 'request');
    expect(audits.append).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'workspace.support_read',
        workspaceId: row.id,
        actorId: actor.id,
      }),
    );
  });
  it('returns 403 for an authenticated visible member attempting an admin action', async () => {
    tx.user.findFirst.mockResolvedValue({ ...actor, platformRole: 'STUDENT' });
    tx.workspaceMember.findFirst.mockResolvedValue({ ...membership, role: 'STUDENT' });
    await expect(
      service.update(actor, row.id, { name: 'No' }, tenancyEtag(row), 'request'),
    ).rejects.toMatchObject({ status: 403 });
    expect(tx.workspace.update).not.toHaveBeenCalled();
  });
  it('checks workspace state and scope in the query rather than trusting request hints', async () => {
    tx.workspace.findFirst.mockResolvedValue(null);
    await expect(service.get(actor, row.id, 'request')).rejects.toMatchObject({ status: 404 });
    expect(tx.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: row.id, status: 'ACTIVE', deletedAt: null },
    });
  });
  it('does not emit a successful change or write data when preconditions fail', async () => {
    await expect(
      service.update(actor, row.id, { name: 'Stale' }, '"stale"', 'request'),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.workspace.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
  it('prevents owner suspension before changing membership or assignments', async () => {
    await expect(
      service.updateMember(
        actor,
        row.id,
        membership.id,
        { status: 'SUSPENDED' },
        tenancyEtag(membership),
        'request',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OWNER_TRANSFER_REQUIRED' }),
    });
    expect(tx.workspaceMember.update).not.toHaveBeenCalled();
    expect(tx.courseStaff.deleteMany).not.toHaveBeenCalled();
  });
  it('rejects platform privileges in service inputs before starting a transaction', async () => {
    const raw = { email: 'target@example.com', role: 'SUPER_ADMIN' };
    await expect(service.invite(actor, row.id, raw as never, 'request')).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
