import { createHmac, timingSafeEqual } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
const claims = z.strictObject({
  enrollmentId: z.uuid(),
  sessionId: z.uuid(),
  userId: z.uuid(),
  expiresAt: z.number().int(),
});
export function signJoin(
  input: Omit<z.infer<typeof claims>, 'expiresAt'>,
  key: string,
  origin: string,
) {
  const expiresAt = Date.now() + 60000;
  const body = Buffer.from(JSON.stringify({ ...input, expiresAt })).toString('base64url');
  const token = `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
  return {
    url: `${origin}/api/v1/media/live-join?capability=${token}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}
export function verifyJoin(token: string, key: string) {
  try {
    if (typeof token !== 'string' || token.length > 2048) throw new Error();
    const segments = token.split('.');
    if (segments.length !== 2) throw new Error();
    const [body, mac] = segments;
    if (!body || !mac) throw new Error();
    const expected = createHmac('sha256', key).update(body).digest();
    const actual = Buffer.from(mac, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const c = claims.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
    if (c.expiresAt <= Date.now()) throw new Error();
    return c;
  } catch {
    throw new NotFoundException();
  }
}
