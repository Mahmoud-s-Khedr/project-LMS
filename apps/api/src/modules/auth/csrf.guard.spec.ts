import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';
const token = 'a'.repeat(64);
const guard = new CsrfGuard({
  getOrThrow: () => 'http://localhost:3100',
} as unknown as ConfigService);
function context(headers: Record<string, string>, cookie: unknown = token): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ get: (key: string) => headers[key], cookies: { lms_csrf: cookie } }),
    }),
  } as unknown as ExecutionContext;
}
describe('CSRF guard', () => {
  it('allows an exact origin and matching random token', () => {
    expect(
      guard.canActivate(context({ origin: 'http://localhost:3100', 'x-csrf-token': token })),
    ).toBe(true);
  });
  it.each([
    { origin: 'https://evil.example', 'x-csrf-token': token },
    { origin: 'http://localhost:3100.evil.example', 'x-csrf-token': token },
    { 'x-csrf-token': token },
    { origin: 'http://localhost:3100' },
    { origin: 'http://localhost:3100', 'x-csrf-token': 'b'.repeat(64) },
    { origin: 'http://localhost:3100', 'x-csrf-token': 'short' },
  ])('denies absent/mismatched origin or token: %p', (headers) => {
    expect(() => guard.canActivate(context(headers as Record<string, string>))).toThrow(
      ForbiddenException,
    );
  });
  it('rejects malformed cookies without throwing crypto length errors', () => {
    expect(() =>
      guard.canActivate(
        context({ origin: 'http://localhost:3100', 'x-csrf-token': token }, ['bad']),
      ),
    ).toThrow(ForbiddenException);
  });
});
