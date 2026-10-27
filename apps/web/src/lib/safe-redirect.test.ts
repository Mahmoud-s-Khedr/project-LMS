import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    '/\\evil',
    '/%5Cevil',
    '//evil',
    '/\t/evil',
    'https://evil',
    'javascript:',
    '/%252f%252fevil',
  ])('rejects %s', (value) => {
    expect(safeRedirect(value)).toBeNull();
  });
  it('preserves a local path, query and fragment', () => {
    expect(safeRedirect('/courses?q=abc#unit')).toBe('/courses?q=abc#unit');
  });
});
