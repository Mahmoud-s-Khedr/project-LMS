import { ConfigService } from '@nestjs/config';
import {
  ContentPagination,
  assertAcyclic,
  lessonData,
  releaseWindow,
  isWithinReleaseWindow,
} from './content.support';
import { lessonCreateSchema } from '@lms/shared';
import { randomUUID } from 'node:crypto';
describe('Content safety and release boundaries', () => {
  it('rejects transitive prerequisite cycles and self edges', () => {
    expect(() =>
      assertAcyclic([
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ]),
    ).toThrow('cycle');
    expect(() => assertAcyclic([{ from: 'a', to: 'a' }])).toThrow('cycle');
    expect(() =>
      assertAcyclic([
        { from: 'a', to: 'b' },
        { from: 'c', to: 'b' },
      ]),
    ).not.toThrow();
  });
  it('calculates UTC offsets and gives cohort overrides precedence including null close', () => {
    const enrolled = new Date('2026-03-28T12:00:00Z');
    const cohort = new Date('2026-04-01T00:00:00Z');
    const input = {
      releaseType: 'ENROLLMENT_OFFSET',
      releaseAt: null,
      releaseOffsetDays: 2,
      availableUntil: new Date('2026-04-20T00:00:00Z'),
    };
    expect(releaseWindow(input, enrolled, cohort).opensAt?.toISOString()).toBe(
      '2026-03-30T12:00:00.000Z',
    );
    expect(
      releaseWindow(
        { ...input, releaseType: 'COHORT_OFFSET' },
        enrolled,
        cohort,
      ).opensAt?.toISOString(),
    ).toBe('2026-04-03T00:00:00.000Z');
    expect(
      releaseWindow({ ...input, releaseType: 'COHORT_OFFSET' }, enrolled, null).satisfiable,
    ).toBe(false);
    const override = { releaseAt: new Date('2026-05-01T00:00:00Z'), availableUntil: null };
    expect(releaseWindow(input, enrolled, cohort, override)).toEqual({
      opensAt: override.releaseAt,
      closesAt: null,
      satisfiable: true,
    });
  });
  it('opens on the release instant and closes exactly at availableUntil', () => {
    const window = {
      opensAt: new Date('2026-01-01T00:00:00Z'),
      closesAt: new Date('2026-01-02T00:00:00Z'),
      satisfiable: true,
    };
    expect(isWithinReleaseWindow(window, new Date('2025-12-31T23:59:59.999Z'))).toBe(false);
    expect(isWithinReleaseWindow(window, window.opensAt)).toBe(true);
    expect(isWithinReleaseWindow(window, new Date('2026-01-01T23:59:59.999Z'))).toBe(true);
    expect(isWithinReleaseWindow(window, window.closesAt)).toBe(false);
  });
  it('accepts approved embed origins and forbids origin lookalikes, script HTML and privileged sandbox', () => {
    const base = {
      title: 'Interactive',
      position: 0,
      isRequired: true,
      isPreview: false,
      isPublished: false,
      estimatedMinutes: 1,
      completionRule: 'ACKNOWLEDGE',
      requiredWatchPercent: 90,
      release: { releaseType: 'IMMEDIATE' },
      payload: {
        type: 'INTERACTIVE',
        body: { embedUrl: 'https://player.vimeo.com/video/123', sandbox: ['allow-scripts'] },
      },
    };
    expect(() => lessonData(lessonCreateSchema.parse(base))).not.toThrow();
    expect(() =>
      lessonData(
        lessonCreateSchema.parse({
          ...base,
          payload: {
            type: 'INTERACTIVE',
            body: { embedUrl: 'https://player.vimeo.com.attacker.test', sandbox: [] },
          },
        }),
      ),
    ).toThrow('origin');
    expect(() =>
      lessonData(
        lessonCreateSchema.parse({
          ...base,
          payload: {
            type: 'INTERACTIVE',
            body: {
              embedUrl: 'https://player.vimeo.com/video/1',
              sandbox: ['allow-same-origin', 'allow-scripts'],
            },
          },
        }),
      ),
    ).toThrow('Same-origin');
    expect(
      lessonCreateSchema.safeParse({
        ...base,
        payload: { type: 'TEXT', body: { html: '<script>alert(1)</script>' } },
      }).success,
    ).toBe(false);
  });
  it('binds opaque cursors to filter/scope and rejects tampering', () => {
    const p = new ContentPagination(new ConfigService({ JWT_ACCESS_SECRET: 'x'.repeat(32) }));
    const id = randomUUID();
    const rows = [
      { id, createdAt: '2026-01-01T00:00:00Z' },
      { id: randomUUID(), createdAt: '2025-01-01T00:00:00Z' },
    ];
    const page = p.page(rows, { limit: 1 }, { workspace: 'one' }, (r) => r.createdAt);
    expect(page.meta.hasMore).toBe(true);
    const query = { limit: 1, cursor: page.meta.nextCursor! };
    expect(p.decode(query, { workspace: 'one' })?.id).toBe(id);
    expect(() => p.decode(query, { workspace: 'two' })).toThrow('cursor');
    expect(() => p.decode({ ...query, cursor: query.cursor + 'x' }, { workspace: 'one' })).toThrow(
      'cursor',
    );
  });
});
