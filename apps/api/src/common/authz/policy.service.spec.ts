import type { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from './policy.service';
const actor = { id: 'user', platformRole: 'STUDENT' as const };
const course = { id: 'course', workspaceId: 'workspace' };
function setup() {
  const db = {
    workspace: { findFirst: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    course: { findFirst: jest.fn().mockResolvedValue({ id: 'course' }) },
    workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
    courseStaff: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  return { db, policy: new PolicyService(db as unknown as PrismaService) };
}
describe('PolicyService', () => {
  it('constrains academy roles to both user and resolved workspace', async () => {
    const { policy, db } = setup();
    await expect(policy.hasWorkspaceRole(actor, 'workspace', ['ADMIN'])).resolves.toBe(false);
    expect(db.workspaceMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user',
          workspaceId: 'workspace',
          status: 'ACTIVE',
          deletedAt: null,
          role: { in: ['ADMIN'] },
        }),
      }),
    );
  });
  it('does not authorize course creator IDs without an active scoped staff assignment', async () => {
    const { policy } = setup();
    await expect(policy.canManageCourse(actor, course)).resolves.toBe(false);
  });
  it('rejects forged cross-workspace course scope', async () => {
    const { policy, db } = setup();
    db.course.findFirst.mockResolvedValue(null);
    await expect(
      policy.canManageCourse({ ...actor, platformRole: 'SUPER_ADMIN' }, course),
    ).resolves.toBe(false);
  });
  it('requires active membership even for an existing staff assignment', async () => {
    const { policy, db } = setup();
    db.courseStaff.findUnique.mockResolvedValue({ role: 'INSTRUCTOR', workspaceId: 'workspace' });
    await expect(policy.canManageCourse(actor, course)).resolves.toBe(false);
    expect(db.courseStaff.findUnique).not.toHaveBeenCalled();
  });
  it('TA grade capability does not grant edit/publish/roster permission', async () => {
    const { policy, db } = setup();
    db.workspaceMember.findFirst.mockImplementation(
      async ({ where }: { where: { role: { in: string[] } } }) =>
        where.role.in.includes('TEACHING_ASSISTANT') ? { id: 'member' } : null,
    );
    db.courseStaff.findUnique.mockResolvedValue({
      role: 'TEACHING_ASSISTANT',
      workspaceId: 'workspace',
      canEditContent: false,
      canGrade: true,
      canManageLearners: false,
    });
    await expect(policy.canManageCourse(actor, course, 'grade')).resolves.toBe(true);
    await expect(policy.canManageCourse(actor, course, 'edit')).resolves.toBe(false);
    await expect(policy.canManageCourse(actor, course, 'publish')).resolves.toBe(false);
    await expect(policy.canManageCourse(actor, course, 'manageLearners')).resolves.toBe(false);
  });
  it('suspended workspaces deny staff access', async () => {
    const { policy, db } = setup();
    db.workspace.findFirst.mockResolvedValue({ status: 'SUSPENDED' });
    db.workspaceMember.findFirst.mockResolvedValue({ id: 'admin' });
    await expect(policy.hasWorkspaceRole(actor, 'workspace', ['ADMIN'])).resolves.toBe(false);
  });
  it('ownership never grants super-admin access to another learner record', () => {
    const { policy } = setup();
    expect(policy.isOwner({ ...actor, platformRole: 'SUPER_ADMIN' }, { userId: 'another' })).toBe(
      false,
    );
  });
});
