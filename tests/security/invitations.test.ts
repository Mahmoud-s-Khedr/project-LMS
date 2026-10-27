import { describe, it, expect, beforeAll } from 'vitest';
import { TestApiClient } from '../fixtures/client';
import { createAndLoginTestUser, createTestWorkspace, generateTestEmail } from '../fixtures/auth';

describe('Security: Workspace Invitations Lifecycle and Token Consumption', () => {
  beforeAll(async () => {
    const probe = new TestApiClient();
    const health = await probe.get('/health/live');
    expect(health.status).toBe(200);
  });

  it('allows workspace owner to invite members, enforces single-use token consumption', async () => {
    const owner = await createAndLoginTestUser({
      email: generateTestEmail('inv-owner'),
      direct: true,
    });
    const workspace = await createTestWorkspace(owner.client, 'Invitation Academy');

    const inviteeEmail = generateTestEmail('invitee');
    const inviteRes = await owner.client.post(`/workspaces/${workspace.id}/invitations`, {
      email: inviteeEmail,
      role: 'TEACHING_ASSISTANT',
    });

    expect(inviteRes.status).toBe(201);
    const invitation = inviteRes.data?.data;
    expect(invitation).toBeDefined();
    expect(invitation.email).toBe(inviteeEmail);
    expect(invitation.role).toBe('TEACHING_ASSISTANT');

    // Create account for invitee
    const inviteeUser = await createAndLoginTestUser({ email: inviteeEmail, direct: true });

    // The raw token is returned during creation in test/dev environment or mock mail
    const rawToken = invitation.rawToken ?? invitation.token;
    if (rawToken) {
      // 1. Invitee accepts the invitation
      const acceptRes = await inviteeUser.client.post('/invitations/accept', {
        token: rawToken,
      });

      expect([200, 201]).toContain(acceptRes.status);

      // Verify invitee is now a member with TEACHING_ASSISTANT role
      const membersRes = await owner.client.get(`/workspaces/${workspace.id}/members`);
      expect(membersRes.status).toBe(200);
      const members = membersRes.data?.data ?? [];
      const memberRecord = members.find((m: any) => m.userId === inviteeUser.id);
      expect(memberRecord).toBeDefined();
      expect(memberRecord.role).toBe('TEACHING_ASSISTANT');

      // 2. Single-use enforcement: Attempting to accept the same token again MUST fail
      const replayAccept = await inviteeUser.client.post('/invitations/accept', {
        token: rawToken,
      });

      expect([400, 404, 409, 410]).toContain(replayAccept.status);
    }
  });

  it('rejects invitation creation from unauthorized users', async () => {
    const owner = await createAndLoginTestUser({
      email: generateTestEmail('legit-owner'),
      direct: true,
    });
    const workspace = await createTestWorkspace(owner.client, 'Private Workspace');

    const outsider = await createAndLoginTestUser({
      email: generateTestEmail('outsider'),
      direct: true,
    });

    const forgeRes = await outsider.client.post(`/workspaces/${workspace.id}/invitations`, {
      email: generateTestEmail('victim'),
      role: 'INSTRUCTOR',
    });

    expect([403, 404]).toContain(forgeRes.status);
  });
});
