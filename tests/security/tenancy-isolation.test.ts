import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import {
  createAndLoginTestUser,
  createTestWorkspace,
  generateTestEmail,
  type TestUser,
} from '../fixtures/auth';

describe('Security: Multi-Tenancy Isolation and RBAC Boundaries', () => {
  let userA: TestUser;
  let userB: TestUser;
  let workspaceA: { id: string; name: string; slug: string };
  let workspaceB: { id: string; name: string; slug: string };

  beforeAll(async () => {
    const probe = new TestApiClient();
    const health = await probe.get('/health/live');
    expect(health.status).toBe(200);

    userA = await createAndLoginTestUser({ email: generateTestEmail('tenant-a'), direct: true });
    workspaceA = await createTestWorkspace(userA.client, 'Tenant A Academy');

    userB = await createAndLoginTestUser({ email: generateTestEmail('tenant-b'), direct: true });
    workspaceB = await createTestWorkspace(userB.client, 'Tenant B Academy');
  });

  it('prevents tenant enumeration: accessing another tenant workspace returns 404', async () => {
    // User B attempts to access Workspace A
    const crossAccessRes = await userB.client.get(`/workspaces/${workspaceA.id}`);
    expect(crossAccessRes.status).toBe(404);

    // User B attempts to list members of Workspace A
    const crossMembersRes = await userB.client.get(`/workspaces/${workspaceA.id}/members`);
    expect(crossMembersRes.status).toBe(404);

    // User B attempts to list invitations of Workspace A
    const crossInvitationsRes = await userB.client.get(`/workspaces/${workspaceA.id}/invitations`);
    expect(crossInvitationsRes.status).toBe(404);
  });

  it('rejects privilege escalation: non-super-admin cannot access platform admin endpoints', async () => {
    const regularUser = await createAndLoginTestUser({
      email: generateTestEmail('regular-user'),
      direct: true,
    });

    // Attempt to access platform admin endpoints
    const adminUsersRes = await regularUser.client.get('/admin/users');
    expect(adminUsersRes.status).toBe(403);
  });

  it('rejects assigning SUPER_ADMIN role to a workspace member', async () => {
    // Attempt to invite with invalid role SUPER_ADMIN
    const inviteRes = await userA.client.post(`/workspaces/${workspaceA.id}/invitations`, {
      email: generateTestEmail('super-invite'),
      role: 'SUPER_ADMIN',
    });

    // Contract validation must reject SUPER_ADMIN as a workspace member role
    expect([400, 422]).toContain(inviteRes.status);
  });

  it('workspace admin can only manage their own workspace members', async () => {
    // User B (admin of Workspace B) attempts to create an invitation in Workspace A
    const forgeRes = await userB.client.post(`/workspaces/${workspaceA.id}/invitations`, {
      email: generateTestEmail('infiltrator'),
      role: 'INSTRUCTOR',
    });

    expect(forgeRes.status).toBe(404);
  });
});
