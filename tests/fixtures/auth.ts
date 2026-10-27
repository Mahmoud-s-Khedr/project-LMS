import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { TestApiClient } from './client';
import { TestDbHelper } from './database';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  client: TestApiClient;
  accessToken: string;
}

export interface CreateUserOptions {
  email?: string;
  password?: string;
  name?: string;
  role?: 'STUDENT' | 'INSTRUCTOR';
  workspaceName?: string;
  client?: TestApiClient;
  /** When true, provisions user and active session directly in PostgreSQL, bypassing HTTP rate limiters */
  direct?: boolean;
}

export const DEFAULT_TEST_PASSWORD = 'TestPassword!2026';
const JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'replace-this-development-access-secret-at-least-32-characters';

export const trackedDirectUserIds = new Set<string>();

export async function cleanupDirectTestUsers(): Promise<void> {
  if (trackedDirectUserIds.size === 0) return;
  const ids = Array.from(trackedDirectUserIds);
  const db = new TestDbHelper();
  try {
    await db.query(`DELETE FROM "RefreshSession" WHERE "userId" = ANY($1)`, [ids]);
    await db.query(`DELETE FROM "WorkspaceMember" WHERE "userId" = ANY($1)`, [ids]);
    await db.query(`DELETE FROM "WorkspaceInvitation" WHERE "invitedById" = ANY($1)`, [ids]);
    await db.query(`DELETE FROM "Workspace" WHERE "ownerId" = ANY($1)`, [ids]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [ids]);
    trackedDirectUserIds.clear();
  } catch (err) {
    console.error('Failed to cleanup direct test users:', err);
  } finally {
    await db.disconnect();
  }
}

/**
 * Generate a unique random test email matching *.example.test
 */
export function generateTestEmail(prefix: string = 'qa'): string {
  const unique = randomUUID().slice(0, 8);
  return `${prefix}-${unique}@example.test`;
}

/**
 * Sign an LMS JWT access token matching JwtAuthGuard requirements
 */
export function signTestAccessToken(
  userId: string,
  sessionId: string,
  familyId: string,
  secret: string = JWT_ACCESS_SECRET,
): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    sid: sessionId,
    fid: familyId,
    jti: randomUUID(),
    iss: 'lms-api',
    aud: 'lms-web',
    exp: Math.floor(Date.now() / 1000) + 600,
  };

  const h64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(`${h64}.${p64}`).digest('base64url');
  return `${h64}.${p64}.${sig}`;
}

/**
 * Registers a new unique user and logs them in, returning their tokens and configured client.
 */
export async function createAndLoginTestUser(options: CreateUserOptions = {}): Promise<TestUser> {
  const client = options.client ?? new TestApiClient();
  const email = options.email ?? generateTestEmail();
  const password = options.password ?? DEFAULT_TEST_PASSWORD;
  const name = options.name ?? `Test User ${email.split('@')[0]}`;

  if (options.direct) {
    const db = new TestDbHelper();
    const userId = randomUUID();
    trackedDirectUserIds.add(userId);
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const now = new Date();
    const refreshToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    await db.query(
      `INSERT INTO "User" (id, email, name, "passwordHash", "platformRole", "status", "emailVerifiedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, email, name, 'hashed_test_password', 'STUDENT', 'ACTIVE', now, now, now],
    );

    await db.query(
      `INSERT INTO "RefreshSession" (id, "userId", "familyId", "tokenHash", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, userId, familyId, tokenHash, new Date(Date.now() + 30 * 86400000), now, now],
    );

    await db.disconnect();

    const accessToken = signTestAccessToken(userId, sessionId, familyId);
    client.accessToken = accessToken;
    client.setCookie('lms_refresh', refreshToken);
    client.setCookie('lms_session', '1');

    return {
      id: userId,
      email,
      password,
      name,
      client,
      accessToken,
    };
  }

  // HTTP Registration
  const registerPayload: Record<string, unknown> = {
    email,
    password,
    name,
  };

  if (options.role === 'INSTRUCTOR') {
    registerPayload.role = 'INSTRUCTOR';
    registerPayload.workspaceName = options.workspaceName ?? `${name} Workspace`;
  }

  const regRes = await client.post('/auth/register', registerPayload);
  if (regRes.status !== 201) {
    throw new Error(
      `Failed to register test user ${email}: status ${regRes.status}, body: ${regRes.rawText}`,
    );
  }

  const userId = regRes.data?.data?.id;

  // HTTP Login
  const loginRes = await client.post('/auth/login', {
    email,
    password,
  });

  if (loginRes.status !== 200) {
    throw new Error(
      `Failed to login test user ${email}: status ${loginRes.status}, body: ${loginRes.rawText}`,
    );
  }

  const accessToken = loginRes.data?.data?.accessToken;
  if (!accessToken) {
    throw new Error(`Login response did not return accessToken: ${loginRes.rawText}`);
  }

  client.accessToken = accessToken;

  return {
    id: userId,
    email,
    password,
    name,
    client,
    accessToken,
  };
}

/**
 * Creates a workspace for a test user
 */
export async function createTestWorkspace(
  ownerClient: TestApiClient,
  name: string = `Test Academy ${randomUUID().slice(0, 6)}`,
  kind: 'ACADEMY' | 'PERSONAL' = 'ACADEMY',
): Promise<{ id: string; name: string; slug: string }> {
  const slug = `academy-${randomUUID().slice(0, 8)}`;
  const res = await ownerClient.post('/workspaces', {
    name,
    slug,
    kind,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to create test workspace: status ${res.status}, body: ${res.rawText}`);
  }

  return res.data.data;
}

/**
 * Invites a user to a workspace
 */
export async function inviteWorkspaceMember(
  adminClient: TestApiClient,
  workspaceId: string,
  email: string,
  role: 'ADMIN' | 'INSTRUCTOR' | 'TEACHING_ASSISTANT' | 'STUDENT' = 'INSTRUCTOR',
): Promise<{ id: string; email: string; role: string; token?: string }> {
  const res = await adminClient.post(`/workspaces/${workspaceId}/invitations`, {
    email,
    role,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to invite member: status ${res.status}, body: ${res.rawText}`);
  }

  return res.data.data;
}
