import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { auditLogsResponseSchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  AuditModule,
  AuditQueryService,
  AuditService,
  decodeAuditCursor,
  encodeAuditCursor,
  findSensitiveContent,
  isSensitiveKey,
  REDACTED,
  redact,
  redactString,
  redactUrl,
  summarizeAuditChanges,
  TRUNCATED,
} from './index';

describe('Audit redaction and services', () => {
  describe('redaction', () => {
    it('identifies sensitive credential, capability and assessment-answer keys', () => {
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('passwordHash')).toBe(true);
      expect(isSensitiveKey('new_password')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);
      expect(isSensitiveKey('refresh_token')).toBe(true);
      expect(isSensitiveKey('csrfToken')).toBe(true);
      expect(isSensitiveKey('stripeWebhookSecret')).toBe(true);
      expect(isSensitiveKey('customApiKey')).toBe(true);
      expect(isSensitiveKey('privateKey')).toBe(true);
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('Set-Cookie')).toBe(true);
      expect(isSensitiveKey('answerKey')).toBe(true);
      expect(isSensitiveKey('correctOptionKeys')).toBe(true);
      expect(isSensitiveKey('gradingConfig')).toBe(true);
      expect(isSensitiveKey('randomSeed')).toBe(true);
      expect(isSensitiveKey('response')).toBe(true);
      expect(isSensitiveKey('presignedUrl')).toBe(true);
      expect(isSensitiveKey('hostUrlEncrypted')).toBe(true);

      expect(isSensitiveKey('courseId')).toBe(false);
      expect(isSensitiveKey('workspaceId')).toBe(false);
      expect(isSensitiveKey('role')).toBe(false);
      expect(isSensitiveKey('reason')).toBe(false);
    });

    it('redacts signed URLs, JWTs, bearer headers and provider secrets inside free text', () => {
      const signed =
        'https://minio.local:59000/lms-private/assets/video.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef';
      expect(redactUrl(signed)).toBe(
        `https://minio.local:59000/lms-private/assets/video.mp4?${REDACTED}`,
      );

      const cleanUrl = 'https://lms.local/courses/intro-to-ts';
      expect(redactUrl(cleanUrl)).toBe(cleanUrl);

      const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.c2lnbmF0dXJlMTIz';
      const text = `Auth: Bearer secret_token_value_12345 jwt=${fakeJwt} stripe=sk_test_1234567890abcdef whsec_abcdef1234567890 link=${signed}`;
      const scrubbed = redactString(text);

      expect(scrubbed).not.toContain('secret_token_value_12345');
      expect(scrubbed).not.toContain(fakeJwt);
      expect(scrubbed).not.toContain('sk_test_1234567890abcdef');
      expect(scrubbed).not.toContain('whsec_abcdef1234567890');
      expect(scrubbed).not.toContain('deadbeef');
      expect(scrubbed).toContain('[REDACTED_JWT]');
      expect(scrubbed).toContain('Bearer [REDACTED]');
      expect(scrubbed).toContain('[REDACTED_SECRET]');
    });

    it('deep-redacts nested objects, handles circular references and enforces size bounds', () => {
      const circular: Record<string, unknown> = {
        role: 'ADMIN',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$secret',
        nested: {
          answerKey: { correctOptionKeys: ['a'] },
          location: 'https://storage.local/bucket/file.pdf?token=secret-capability',
          count: 42n,
          when: new Date('2026-10-26T10:00:00.000Z'),
          rawBytes: Buffer.from('hello'),
        },
      };
      circular.self = circular;

      const result = redact(circular) as Record<string, unknown>;
      expect(result.role).toBe('ADMIN');
      expect(result.passwordHash).toBe(REDACTED);
      expect(result.self).toBe('[CIRCULAR]');

      const nested = result.nested as Record<string, unknown>;
      expect(nested.answerKey).toBe(REDACTED);
      expect(nested.location).toBe(`https://storage.local/bucket/file.pdf?${REDACTED}`);
      expect(nested.count).toBe('42');
      expect(nested.when).toBe('2026-10-26T10:00:00.000Z');
      expect(nested.rawBytes).toBe('[BINARY]');

      const deep = { a: { b: { c: { d: 'too-deep' } } } };
      const bounded = redact(deep, {
        maxDepth: 2,
        maxArrayItems: 2,
        maxObjectKeys: 2,
        maxStringLength: 10,
      }) as Record<string, Record<string, unknown>>;
      expect(bounded.a?.b).toBe(TRUNCATED);
    });

    it('detects sensitive keys and capability values in event payloads while allowing mailCapability when specified', () => {
      const badPayload = {
        courseId: '11111111-1111-4111-8111-111111111111',
        answerKey: { value: true },
        previewLink: 'https://cdn.local/asset.mp4?X-Amz-Signature=12345',
      };
      const findings = findSensitiveContent(badPayload);
      expect(findings).toEqual([
        { path: '$.answerKey', reason: 'sensitive-key' },
        { path: '$.previewLink', reason: 'capability-value' },
      ]);

      const mailPayload = {
        userId: '11111111-1111-4111-8111-111111111111',
        mailCapability: {
          keyId: 'v1',
          ciphertext: 'encrypted-blob',
          expiresAt: '2026-10-27T00:00:00.000Z',
        },
      };
      expect(findSensitiveContent(mailPayload, new Set(['mailcapability']))).toEqual([]);
      expect(findSensitiveContent(mailPayload)).toEqual([
        { path: '$.mailCapability', reason: 'sensitive-key' },
      ]);
    });

    it('summarizes audit changes into safe field names and redacted reason for API wire projections', () => {
      const summary = summarizeAuditChanges({
        fields: ['name', 'timezone', 'passwordHash'],
        previousRole: 'INSTRUCTOR',
        role: 'ADMIN',
        secretToken: 'should-not-appear',
        reason: 'Promoted by owner with https://lms.local/reset?token=abc',
      });
      expect(summary).toEqual({
        fields: ['name', 'timezone', 'previousRole', 'role'],
        reason: `Promoted by owner with https://lms.local/reset?${REDACTED}`,
      });
    });
  });

  describe('AuditService & AuditQueryService', () => {
    const createdRows: Array<Record<string, unknown>> = [];
    const mockPrisma = {
      auditLog: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            createdAt: new Date('2026-10-26T10:15:00.000Z'),
            ...data,
          };
          createdRows.push(row);
          return { id: row.id, createdAt: row.createdAt };
        }),
        findMany: jest.fn(async () => [
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            action: 'workspace.member_updated',
            resourceType: 'WorkspaceMember',
            resourceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            actorId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            workspaceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            requestId: 'req-123',
            changes: {
              previousRole: 'STUDENT',
              role: 'INSTRUCTOR',
              password: 'leaked',
              reason: 'Assigned as course instructor',
            },
            createdAt: new Date('2026-10-26T10:20:00.000Z'),
          },
        ]),
      },
    };

    beforeEach(() => {
      createdRows.length = 0;
      jest.clearAllMocks();
    });

    it('requires AUDIT_IP_HASH_SECRET in production and hashes IPs deterministically', async () => {
      expect(
        () =>
          new AuditService(mockPrisma as unknown as PrismaService, {
            nodeEnv: 'production',
            ipHashSecret: '',
          }),
      ).toThrow(/AUDIT_IP_HASH_SECRET/);

      const mod = await Test.createTestingModule({
        imports: [
          AuditModule.forRoot({
            ipHashSecret: 'test-hmac-secret-key-for-audit-ip',
            nodeEnv: 'production',
          }),
        ],
      })
        .overrideProvider(PrismaService)
        .useValue(mockPrisma)
        .compile();

      const audit = mod.get(AuditService);
      const hash1 = audit.hashIp(' 203.0.113.9 ');
      const hash2 = audit.hashIp('203.0.113.9');
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      await audit.record({
        action: 'auth.refresh.reuse_detected',
        resourceType: 'RefreshSession',
        resourceId: '11111111-1111-4111-8111-111111111111',
        actorId: null,
        workspaceId: null,
        requestId: 'req-security-1',
        ip: '203.0.113.9',
        changes: {
          familyId: '22222222-2222-4222-8222-222222222222',
          refreshToken: 'raw-refresh-token',
          answerKey: { value: 42 },
        },
      });

      expect(createdRows).toHaveLength(1);
      expect(createdRows[0]?.workspaceId).toBeNull();
      expect(createdRows[0]?.actorId).toBeNull();
      expect(createdRows[0]?.ipHash).toBe(hash1);
      expect(createdRows[0]?.changes).toEqual({
        familyId: '22222222-2222-4222-8222-222222222222',
        refreshToken: REDACTED,
        answerKey: REDACTED,
      });
    });

    it('queries scoped audit logs, encodes/decodes cursors and projects shared API contract schemas', async () => {
      const queryService = new AuditQueryService(mockPrisma as unknown as PrismaService);
      const workspaceId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

      const page = await queryService.list(
        { kind: 'workspace', workspaceId },
        { limit: 10, action: 'workspace.member_updated' },
      );
      expect(page.items).toHaveLength(1);
      expect((page.items[0]?.changes as Record<string, unknown>).password).toBe(REDACTED);
      expect(page.nextCursor).toBeNull();

      const projected = await queryService.listProjected(
        { kind: 'workspace', workspaceId },
        { limit: 10 },
      );
      const parsed = auditLogsResponseSchema.parse(projected);
      expect(parsed.data).toHaveLength(1);
      expect(parsed.data[0]?.changes).toEqual({
        fields: ['previousRole', 'role'],
        reason: 'Assigned as course instructor',
      });

      const cursor = encodeAuditCursor({
        createdAt: new Date('2026-10-26T10:20:00.000Z'),
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      });
      const decoded = decodeAuditCursor(cursor);
      expect(decoded.id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
      expect(decoded.createdAt.toISOString()).toBe('2026-10-26T10:20:00.000Z');

      expect(() => decodeAuditCursor('not-a-valid-cursor')).toThrow(BadRequestException);
    });
  });
});
