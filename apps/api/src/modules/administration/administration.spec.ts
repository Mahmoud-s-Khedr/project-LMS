import { BadRequestException } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { adminWorkspaceUpdateSchema, replayInputSchema } from '@lms/shared';
import { unwrapCursor } from './administration.service';

describe('Administration boundary validation', () => {
  it('rejects replacement webhook evidence, privilege escalation and inconsistent suspension', () => {
    const replay = new ZodValidationPipe(replayInputSchema);
    expect(() => replay.transform({ reason: 'retry safely', payload: { forged: true } })).toThrow(
      BadRequestException,
    );
    const update = new ZodValidationPipe(adminWorkspaceUpdateSchema);
    expect(() =>
      update.transform({
        status: 'ACTIVE',
        suspendedAt: null,
        reason: 'activate',
        platformRole: 'SUPER_ADMIN',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      update.transform({ status: 'SUSPENDED', suspendedAt: null, reason: 'suspend' }),
    ).toThrow(BadRequestException);
  });
  it('rejects malformed or differently scoped cursors', () => {
    expect(unwrapCursor(undefined, 'scope')).toBeUndefined();
    expect(() => unwrapCursor('broken', 'scope')).toThrow(BadRequestException);
    const cursor = Buffer.from(JSON.stringify({ scope: 'tenant-a', cursor: 'inner' })).toString(
      'base64url',
    );
    expect(() => unwrapCursor(cursor, 'tenant-b')).toThrow(BadRequestException);
    expect(unwrapCursor(cursor, 'tenant-a')).toBe('inner');
  });
});
