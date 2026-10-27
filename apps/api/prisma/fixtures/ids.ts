import { createHash } from 'node:crypto';

/** Stable UUIDs reserved for development fixtures; never use as production identifiers. */
export function fixtureId(key: string): string {
  const hex = createHash('sha256').update(`lms-development-fixture:${key}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const fixtureTime = new Date('2026-01-01T00:00:00.000Z');
export const fixtureEnd = new Date('2030-01-01T00:00:00.000Z');
