import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type Workspace, type WorkspaceMember } from '@prisma/client';
import {
  workspaceCreateSchema,
  workspaceUpdateSchema,
  memberUpdateSchema,
  workspaceInvitationCreateSchema,
  transferOwnershipSchema,
  courseStaffUpsertSchema,
  membersQuerySchema,
  invitationsQuerySchema,
  cursorQuerySchema,
  invitationAcceptSchema,
  myWorkspaceSchema,
  type WorkspaceCreate,
  type WorkspaceUpdate,
  type MemberUpdate,
  type WorkspaceInvitationCreate,
  type TransferOwnership,
  type MembersQuery,
  type InvitationsQuery,
  type CursorQuery,
  type CourseStaffUpsert,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { PasswordService } from '../auth/password.service';
import { IdentityEvents } from '../auth/identity-events.service';
import { hashToken, newToken } from '../auth/token.util';
import { checkEtag, cursorWindow, nextUpdatedAt } from './tenancy.util';
import {
  presentWorkspace,
  presentMember,
  presentInvitation,
  presentStaff,
} from './tenancy.presenter';
import { InvitationMailService } from './invitation-mail.service';
import { AuditService } from '../audit/audit.service';

type Tx = Prisma.TransactionClient;
const ROLES = ['ADMIN', 'INSTRUCTOR', 'TEACHING_ASSISTANT', 'STUDENT'] as const;
const INVITATION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly passwords: PasswordService,
    private readonly events: IdentityEvents,
    private readonly invitationMail: InvitationMailService,
    private readonly audits: AuditService,
  ) {}

  // Every command, including callers outside HTTP, resolves persisted scope/actor again under this lock.
  private async lock(tx: Tx, workspaceId: string): Promise<void> {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`,
    );
  }
  private async actor(tx: Tx, actor: AuthenticatedUser) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actor.id}::uuid FOR SHARE`,
    );
    const current = await tx.user.findFirst({
      where: { id: actor.id, status: 'ACTIVE', deletedAt: null },
    });
    if (!current) throw new UnauthorizedException('Account is not active');
    return current;
  }
  private async access(tx: Tx, actor: AuthenticatedUser, workspaceId: string, admin = false) {
    const current = await this.actor(tx, actor);
    const workspace = await tx.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const member = await tx.workspaceMember.findFirst({
      where: { workspaceId, userId: actor.id, status: 'ACTIVE', deletedAt: null },
    });
    const superAdmin = this.policy.isPlatformAdmin(current);
    if (!superAdmin && !member) throw new NotFoundException('Workspace not found');
    if (admin && !superAdmin && member?.role !== 'ADMIN')
      throw new ForbiddenException('Workspace administrator required');
    return { workspace, current, member, superAdmin };
  }
  private async audit(
    tx: Tx,
    actorId: string,
    workspaceId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    requestId: string,
    changes: Prisma.InputJsonObject = {},
  ) {
    // Strict call-site allowlists: never pass request bodies, emails, tokens or hashes here.
    await this.audits.append(tx, {
      actorId,
      workspaceId,
      action,
      resourceType,
      resourceId,
      requestId,
      changes,
    });
  }
  private async changed(
    type: string,
    actor: AuthenticatedUser,
    workspaceId: string,
    resourceId: string,
  ) {
    await this.events.emit(type, { actorId: actor.id, workspaceId, resourceId });
  }
  private async member(tx: Tx, workspaceId: string, memberId: string) {
    const member = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, deletedAt: null },
    });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }
  private async invitation(tx: Tx, workspaceId: string, invitationId: string) {
    const invitation = await tx.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return invitation;
  }

  async create(actor: AuthenticatedUser, raw: WorkspaceCreate, requestId: string) {
    const input = workspaceCreateSchema.parse(raw);
    let workspace: Workspace;
    try {
      workspace = await this.prisma.$transaction(async (tx) => {
        await this.actor(tx, actor);
        const row = await tx.workspace.create({
          data: { ...input, settings: input.settings ?? {}, ownerId: actor.id },
        });
        await tx.workspaceMember.create({
          data: { workspaceId: row.id, userId: actor.id, role: 'ADMIN' },
        });
        await this.audit(
          tx,
          actor.id,
          row.id,
          'workspace.created',
          'Workspace',
          row.id,
          requestId,
          { kind: row.kind },
        );
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Workspace slug is reserved');
      throw error;
    }
    await this.changed('workspace.created', actor, workspace.id, workspace.id);
    return { row: workspace, data: presentWorkspace(workspace) };
  }
  async mine(actor: AuthenticatedUser, raw: CursorQuery) {
    const query = cursorQuerySchema.parse(raw);
    const page = cursorWindow(query, { resource: 'my-workspaces', userId: actor.id });
    // Keep the workspace/membership projection coherent if membership changes between relation queries.
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.workspace.findMany({
          where: {
            status: 'ACTIVE',
            deletedAt: null,
            members: {
              some: {
                userId: actor.id,
                status: 'ACTIVE',
                deletedAt: null,
                user: { status: 'ACTIVE', deletedAt: null },
              },
            },
            ...page.boundary,
          },
          include: {
            members: {
              where: { userId: actor.id, status: 'ACTIVE', deletedAt: null },
            },
          },
          orderBy: page.orderBy,
          take: page.take,
        });
        const result = page.page(rows);
        const taIds = result.data
          .filter((row) => row.members[0]?.role === 'TEACHING_ASSISTANT')
          .map((row) => row.id);
        // Aggregate in PostgreSQL: a workspace list must not load an unbounded assignment collection.
        const summaries = taIds.length
          ? await tx.$queryRaw<
              Array<{ workspaceId: string; edit: boolean; grade: boolean; learners: boolean }>
            >(Prisma.sql`
      SELECT s."workspaceId", bool_or(s."canEditContent") AS "edit",
        bool_or(s."canGrade") AS "grade", bool_or(s."canManageLearners") AS "learners"
      FROM "CourseStaff" s JOIN "Course" c ON c."workspaceId" = s."workspaceId" AND c."id" = s."courseId"
      WHERE s."userId" = ${actor.id}::uuid AND s."role" = 'TEACHING_ASSISTANT'
        AND c."deletedAt" IS NULL
        AND s."workspaceId" IN (${Prisma.join(taIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY s."workspaceId"`)
          : [];
        const flagsByWorkspace = new Map(
          summaries.map((summary) => [summary.workspaceId, summary]),
        );
        return {
          ...result,
          data: result.data.map((row) => {
            const member = row.members[0]!;
            const flags = flagsByWorkspace.get(row.id);
            const permissions =
              member.role === 'ADMIN'
                ? [
                    'workspace.manage',
                    'members.manage',
                    'courses.create',
                    'courses.edit',
                    'courses.grade',
                    'learners.manage',
                    'commerce.manage',
                    'analytics.read',
                  ]
                : member.role === 'INSTRUCTOR'
                  ? [
                      'courses.create',
                      'courses.edit',
                      'courses.grade',
                      'learners.manage',
                      'analytics.read',
                    ]
                  : member.role === 'TEACHING_ASSISTANT'
                    ? [
                        ...(flags?.edit ? ['courses.edit'] : []),
                        ...(flags?.grade ? ['courses.grade'] : []),
                        ...(flags?.learners ? ['learners.manage'] : []),
                        ...(flags ? ['analytics.read'] : []),
                      ]
                    : [];
            return myWorkspaceSchema.parse({
              ...presentWorkspace(row),
              membership: presentMember(member),
              permissions,
            });
          }),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async get(actor: AuthenticatedUser, workspaceId: string, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      const { workspace, superAdmin } = await this.access(tx, actor, workspaceId);
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.support_read',
          'Workspace',
          workspaceId,
          requestId,
        );
      return { row: workspace, data: presentWorkspace(workspace) };
    });
  }
  async update(
    actor: AuthenticatedUser,
    workspaceId: string,
    raw: WorkspaceUpdate,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const input = workspaceUpdateSchema.parse(raw);
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      const { workspace } = await this.access(tx, actor, workspaceId, true);
      checkEtag(workspace, ifMatch);
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: { ...input, updatedAt: nextUpdatedAt(workspace) },
      });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.updated',
        'Workspace',
        workspaceId,
        requestId,
        { fields: Object.keys(input) },
      );
      return updated;
    });
    await this.changed('workspace.updated', actor, workspaceId, row.id);
    return { row, data: presentWorkspace(row) };
  }
  async transfer(
    actor: AuthenticatedUser,
    workspaceId: string,
    raw: TransferOwnership,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const input = transferOwnershipSchema.parse(raw);
    // Argon2 outside transaction; confirm unchanged password and current actor again after taking the lock.
    const reauth = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!(await this.passwords.verify(reauth?.passwordHash, input.password)))
      throw new UnauthorizedException('Reauthentication failed');
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      const { workspace, current, superAdmin } = await this.access(tx, actor, workspaceId, true);
      if (current.passwordHash !== reauth?.passwordHash)
        throw new UnauthorizedException('Reauthentication expired');
      if (!superAdmin && workspace.ownerId !== actor.id)
        throw new ForbiddenException('Only the owner may transfer ownership');
      checkEtag(workspace, ifMatch);
      if (input.userId === workspace.ownerId)
        throw new ConflictException('User is already the owner');
      const target = await tx.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId: input.userId,
          role: 'ADMIN',
          status: 'ACTIVE',
          deletedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
      });
      if (!target) throw new NotFoundException('Active administrator not found');
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${target.userId}::uuid FOR SHARE`,
      );
      // Recheck following a concurrent user suspension/deletion.
      if (
        !(await tx.user.findFirst({
          where: { id: target.userId, status: 'ACTIVE', deletedAt: null },
        }))
      )
        throw new NotFoundException('Active administrator not found');
      const updated = await tx.workspace.update({
        where: { id: workspaceId },
        data: { ownerId: target.userId, updatedAt: nextUpdatedAt(workspace) },
      });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.ownership_transferred',
        'Workspace',
        workspaceId,
        requestId,
        { previousOwnerId: workspace.ownerId, ownerId: target.userId, reason: input.reason },
      );
      return updated;
    });
    await this.changed('workspace.ownership_transferred', actor, workspaceId, row.id);
    return { row, data: presentWorkspace(row) };
  }
  async members(
    actor: AuthenticatedUser,
    workspaceId: string,
    raw: MembersQuery,
    requestId: string,
  ) {
    const query = membersQuerySchema.parse(raw);
    const page = cursorWindow(query, {
      resource: 'members',
      workspaceId,
      role: query.role,
      status: query.status,
      search: query.search,
    });
    return this.prisma.$transaction(async (tx) => {
      const { superAdmin } = await this.access(tx, actor, workspaceId, true);
      const rows = await tx.workspaceMember.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          role: query.role,
          status: query.status,
          ...(query.search
            ? { user: { email: { contains: query.search, mode: 'insensitive' } } }
            : {}),
          ...page.boundary,
        },
        orderBy: page.orderBy,
        take: page.take,
      });
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.members_support_read',
          'Workspace',
          workspaceId,
          requestId,
        );
      const result = page.page(rows);
      return { ...result, data: result.data.map(presentMember) };
    });
  }
  async getMember(
    actor: AuthenticatedUser,
    workspaceId: string,
    memberId: string,
    requestId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { superAdmin } = await this.access(tx, actor, workspaceId, true);
      const row = await this.member(tx, workspaceId, memberId);
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.member_support_read',
          'WorkspaceMember',
          row.id,
          requestId,
        );
      return { row, data: presentMember(row) };
    });
  }
  private async protectAdmin(
    tx: Tx,
    workspace: Workspace,
    member: WorkspaceMember,
    role: string,
    status: string,
  ) {
    if (member.userId === workspace.ownerId && (role !== 'ADMIN' || status !== 'ACTIVE'))
      throw new ConflictException({
        code: 'OWNER_TRANSFER_REQUIRED',
        message: 'Transfer ownership first',
      });
    if (
      member.role === 'ADMIN' &&
      member.status === 'ACTIVE' &&
      (role !== 'ADMIN' || status !== 'ACTIVE')
    ) {
      const others = await tx.workspaceMember.count({
        where: {
          workspaceId: workspace.id,
          id: { not: member.id },
          role: 'ADMIN',
          status: 'ACTIVE',
          deletedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
      });
      if (!others)
        throw new ConflictException({
          code: 'LAST_ADMIN',
          message: 'At least one active administrator is required',
        });
    }
  }
  async updateMember(
    actor: AuthenticatedUser,
    workspaceId: string,
    memberId: string,
    raw: MemberUpdate,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const input = memberUpdateSchema.parse(raw);
    return this.changeMember(actor, workspaceId, memberId, input, ifMatch, requestId);
  }
  async removeMember(
    actor: AuthenticatedUser,
    workspaceId: string,
    memberId: string,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    await this.changeMember(actor, workspaceId, memberId, { status: 'LEFT' }, ifMatch, requestId);
  }
  private async changeMember(
    actor: AuthenticatedUser,
    workspaceId: string,
    memberId: string,
    input: { role?: MemberUpdate['role']; status?: 'ACTIVE' | 'SUSPENDED' | 'LEFT' },
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      const { workspace } = await this.access(tx, actor, workspaceId, true);
      const member = await this.member(tx, workspaceId, memberId);
      checkEtag(member, ifMatch);
      if (member.status === 'LEFT') throw new ConflictException('Invite the user to rejoin');
      const role = input.role ?? member.role;
      const status = input.status ?? member.status;
      await this.protectAdmin(tx, workspace, member, role, status);
      if (status === 'ACTIVE') {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${member.userId}::uuid FOR SHARE`,
        );
        if (
          !(await tx.user.findFirst({
            where: { id: member.userId, status: 'ACTIVE', deletedAt: null },
          }))
        )
          throw new ConflictException('Member account is not active');
      }
      const updated = await tx.workspaceMember.update({
        where: { id: member.id },
        data: { ...input, updatedAt: nextUpdatedAt(member) },
      });
      // Membership changes cannot leave a stale instructor assignment granting broader course rights.
      if (role !== member.role || status === 'LEFT')
        await tx.courseStaff.deleteMany({ where: { workspaceId, userId: member.userId } });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.member_updated',
        'WorkspaceMember',
        member.id,
        requestId,
        { previousRole: member.role, role, previousStatus: member.status, status },
      );
      return updated;
    });
    await this.changed('workspace.member_updated', actor, workspaceId, row.id);
    return { row, data: presentMember(row) };
  }

  async invitations(
    actor: AuthenticatedUser,
    workspaceId: string,
    raw: InvitationsQuery,
    requestId: string,
  ) {
    const query = invitationsQuerySchema.parse(raw);
    const page = cursorWindow(query, {
      resource: 'invitations',
      workspaceId,
      status: query.status,
    });
    const now = new Date();
    const status: Prisma.WorkspaceInvitationWhereInput =
      query.status === 'PENDING'
        ? { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } }
        : query.status === 'EXPIRED'
          ? { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } }
          : query.status === 'ACCEPTED'
            ? { acceptedAt: { not: null } }
            : query.status === 'REVOKED'
              ? { revokedAt: { not: null } }
              : {};
    return this.prisma.$transaction(async (tx) => {
      const { superAdmin } = await this.access(tx, actor, workspaceId, true);
      const rows = await tx.workspaceInvitation.findMany({
        where: { workspaceId, ...status, ...page.boundary },
        orderBy: page.orderBy,
        take: page.take,
      });
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.invitations_support_read',
          'Workspace',
          workspaceId,
          requestId,
        );
      const result = page.page(rows);
      return { ...result, data: result.data.map(presentInvitation) };
    });
  }
  async getInvitation(
    actor: AuthenticatedUser,
    workspaceId: string,
    invitationId: string,
    requestId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { superAdmin } = await this.access(tx, actor, workspaceId, true);
      const row = await this.invitation(tx, workspaceId, invitationId);
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.invitation_support_read',
          'WorkspaceInvitation',
          row.id,
          requestId,
        );
      return { row, data: presentInvitation(row) };
    });
  }
  async invite(
    actor: AuthenticatedUser,
    workspaceId: string,
    raw: WorkspaceInvitationCreate,
    requestId: string,
  ) {
    const input = workspaceInvitationCreateSchema.parse(raw);
    const token = newToken();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      await this.access(tx, actor, workspaceId, true);
      if (
        await tx.workspaceMember.findFirst({
          where: {
            workspaceId,
            deletedAt: null,
            status: { in: ['ACTIVE', 'SUSPENDED'] },
            user: { email: input.email },
          },
        })
      )
        throw new ConflictException('Already a member; manage the membership instead');
      await tx.workspaceInvitation.updateMany({
        where: { workspaceId, email: input.email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const invitation = await tx.workspaceInvitation.create({
        data: {
          workspaceId,
          ...input,
          invitedById: actor.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_LIFETIME),
        },
      });
      await this.invitationMail.enqueue(tx, invitation, token);
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.invitation_created',
        'WorkspaceInvitation',
        invitation.id,
        requestId,
        { role: input.role },
      );
      return invitation;
    });
    await this.changed('workspace.invitation_created', actor, workspaceId, row.id);
    return { row, data: presentInvitation(row) };
  }
  async revokeInvitation(
    actor: AuthenticatedUser,
    workspaceId: string,
    invitationId: string,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      await this.access(tx, actor, workspaceId, true);
      const invitation = await this.invitation(tx, workspaceId, invitationId);
      checkEtag(invitation, ifMatch);
      if (invitation.acceptedAt || invitation.revokedAt)
        throw new ConflictException('Invitation is no longer outstanding');
      await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date(), updatedAt: nextUpdatedAt(invitation) },
      });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.invitation_revoked',
        'WorkspaceInvitation',
        invitation.id,
        requestId,
      );
    });
    await this.changed('workspace.invitation_revoked', actor, workspaceId, invitationId);
  }
  async resendInvitation(
    actor: AuthenticatedUser,
    workspaceId: string,
    invitationId: string,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const token = newToken();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      await this.access(tx, actor, workspaceId, true);
      const invitation = await this.invitation(tx, workspaceId, invitationId);
      checkEtag(invitation, ifMatch);
      if (invitation.acceptedAt || invitation.revokedAt)
        throw new ConflictException('Invitation is no longer outstanding');
      const updated = await tx.workspaceInvitation.update({
        where: { id: invitation.id },
        data: {
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITATION_LIFETIME),
          invitedById: actor.id,
          updatedAt: nextUpdatedAt(invitation),
        },
      });
      await this.invitationMail.enqueue(tx, updated, token);
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.invitation_resent',
        'WorkspaceInvitation',
        invitation.id,
        requestId,
      );
      return updated;
    });
    await this.changed('workspace.invitation_resent', actor, workspaceId, row.id);
    return { row, data: presentInvitation(row) };
  }
  async accept(actor: AuthenticatedUser, token: string, requestId: string) {
    invitationAcceptSchema.parse({ token });
    const verifier = hashToken(token);
    // Only the unguessable verifier resolves scope; the client cannot supply workspace/user/role IDs.
    const hint = await this.prisma.workspaceInvitation.findUnique({
      where: { tokenHash: verifier },
      select: { workspaceId: true },
    });
    if (!hint) throw new NotFoundException('Invitation is invalid or unavailable');
    const row = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, hint.workspaceId);
      const current = await this.actor(tx, actor);
      const invitation = await tx.workspaceInvitation.findUnique({
        where: { tokenHash: verifier },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt.getTime() <= Date.now()
      )
        throw new ConflictException({
          code: 'INVITATION_UNAVAILABLE',
          message: 'Invitation is expired or already used',
        });
      if (!ROLES.some((role) => role === invitation.role))
        throw new ForbiddenException('Invalid invitation role');
      if (
        !current.emailVerifiedAt ||
        current.email.toLowerCase() !== invitation.email.toLowerCase()
      )
        throw new ForbiddenException('Verify the invited email before accepting');
      const workspace = await tx.workspace.findFirst({
        where: { id: invitation.workspaceId, status: 'ACTIVE', deletedAt: null },
      });
      if (!workspace) throw new NotFoundException('Workspace not found');
      const member = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: current.id } },
      });
      if (member && member.status !== 'LEFT')
        throw new ConflictException(
          'Already a member; ask an administrator to manage the membership',
        );
      const consumed = await tx.workspaceInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash: verifier,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date(), updatedAt: nextUpdatedAt(invitation) },
      });
      if (consumed.count !== 1) throw new ConflictException('Invitation is no longer available');
      if (member)
        await tx.courseStaff.deleteMany({
          where: { workspaceId: workspace.id, userId: current.id },
        });
      const joined = await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: current.id } },
        create: { workspaceId: workspace.id, userId: current.id, role: invitation.role },
        update: {
          role: invitation.role,
          status: 'ACTIVE',
          deletedAt: null,
          joinedAt: new Date(),
          ...(member ? { updatedAt: nextUpdatedAt(member) } : {}),
        },
      });
      await this.audit(
        tx,
        actor.id,
        workspace.id,
        'workspace.invitation_accepted',
        'WorkspaceInvitation',
        invitation.id,
        requestId,
        { memberId: joined.id, role: invitation.role },
      );
      return joined;
    });
    await this.changed('workspace.invitation_accepted', actor, row.workspaceId, row.id);
    return { row, data: presentMember(row) };
  }

  private async courseAccess(
    tx: Tx,
    actor: AuthenticatedUser,
    workspaceId: string,
    courseId: string,
  ) {
    const access = await this.access(tx, actor, workspaceId);
    const course = await tx.course.findFirst({
      where: { workspaceId, id: courseId, deletedAt: null },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (!access.superAdmin && access.member?.role !== 'ADMIN') {
      const assigned = await tx.courseStaff.findFirst({
        where: { workspaceId, courseId, userId: actor.id, role: 'INSTRUCTOR' },
      });
      if (access.member?.role !== 'INSTRUCTOR' || !assigned)
        throw new ForbiddenException('Assigned instructor required');
    }
    return access;
  }
  async staff(
    actor: AuthenticatedUser,
    workspaceId: string,
    courseId: string,
    raw: CursorQuery,
    requestId: string,
  ) {
    const query = cursorQuerySchema.parse(raw);
    const page = cursorWindow(query, { resource: 'course-staff', workspaceId, courseId });
    return this.prisma.$transaction(async (tx) => {
      const { superAdmin } = await this.courseAccess(tx, actor, workspaceId, courseId);
      const rows = await tx.courseStaff.findMany({
        where: { workspaceId, courseId, ...page.boundary },
        include: { member: { select: { id: true } } },
        orderBy: page.orderBy,
        take: page.take,
      });
      if (superAdmin)
        await this.audit(
          tx,
          actor.id,
          workspaceId,
          'workspace.staff_support_read',
          'Course',
          courseId,
          requestId,
        );
      const result = page.page(rows);
      return { ...result, data: result.data.map((row) => presentStaff(row, row.member.id)) };
    });
  }
  async upsertStaff(
    actor: AuthenticatedUser,
    workspaceId: string,
    courseId: string,
    userId: string,
    raw: CourseStaffUpsert,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    const input = courseStaffUpsertSchema.parse(raw);
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      await this.courseAccess(tx, actor, workspaceId, courseId);
      const member = await tx.workspaceMember.findFirst({
        where: {
          workspaceId,
          userId,
          status: 'ACTIVE',
          deletedAt: null,
          user: { status: 'ACTIVE', deletedAt: null },
        },
      });
      if (!member) throw new NotFoundException('Active workspace member not found');
      if (
        input.role === 'INSTRUCTOR'
          ? !['ADMIN', 'INSTRUCTOR'].includes(member.role)
          : member.role !== 'TEACHING_ASSISTANT'
      )
        throw new ForbiddenException('Staff role does not match workspace membership');
      const existing = await tx.courseStaff.findUnique({
        where: { courseId_userId: { courseId, userId } },
      });
      if (existing) checkEtag(existing, ifMatch);
      const row = await tx.courseStaff.upsert({
        where: { courseId_userId: { courseId, userId } },
        create: { workspaceId, courseId, userId, ...input },
        update: { ...input, ...(existing ? { updatedAt: nextUpdatedAt(existing) } : {}) },
      });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.staff_updated',
        'CourseStaff',
        row.id,
        requestId,
        { userId, ...input },
      );
      return { row, data: presentStaff(row, member.id) };
    });
    await this.changed('workspace.staff_updated', actor, workspaceId, result.row.id);
    return result;
  }
  async removeStaff(
    actor: AuthenticatedUser,
    workspaceId: string,
    courseId: string,
    userId: string,
    ifMatch: string | undefined,
    requestId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, workspaceId);
      await this.courseAccess(tx, actor, workspaceId, courseId);
      const row = await tx.courseStaff.findFirst({ where: { workspaceId, courseId, userId } });
      if (!row) throw new NotFoundException('Staff assignment not found');
      checkEtag(row, ifMatch);
      await tx.courseStaff.delete({ where: { id: row.id } });
      await this.audit(
        tx,
        actor.id,
        workspaceId,
        'workspace.staff_removed',
        'CourseStaff',
        row.id,
        requestId,
        { userId },
      );
    });
    await this.changed('workspace.staff_removed', actor, workspaceId, userId);
  }
}
