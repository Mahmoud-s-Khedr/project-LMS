import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { activityBatchSchema } from '@lms/shared';
import { csvCell, csvRow, filterHash, range, safeMoney } from './analytics.support';
describe('analytics boundary utilities', () => {
  it('uses half-open UTC dates and limits output to 366 days', () => {
    expect(range({ from: '2024-01-01', to: '2025-01-01T00:00:00.000Z' }).end.toISOString()).toBe(
      '2025-01-01T00:00:00.000Z',
    );
    expect(() => range({ from: '2024-01-01', to: '2025-01-02T00:00:00.000Z' })).toThrow(
      BadRequestException,
    );
  });
  it('rejects reversed ranges', () =>
    expect(() => range({ from: '2026-05-02', to: '2026-05-01' })).toThrow(BadRequestException));
  it('uses canonical JSON for Postgres jsonb equality', () =>
    expect(filterHash({ a: 1, b: { c: 2, d: 3 } })).toBe(filterHash({ b: { d: 3, c: 2 }, a: 1 })));
  it('does not round unsafe financial totals', () => {
    expect(safeMoney(123n)).toBe(123);
    expect(() => safeMoney(9007199254740992n)).toThrow(BadRequestException);
  });
  it.each(['=HYPERLINK("evil")', ' +123', '-123', '@SUM(1,1)', '\t=foo', '\r=foo'])(
    'neutralizes spreadsheet formulas %s',
    (s) => expect(csvCell(s).startsWith('"\'')).toBe(true),
  );
  it('escapes CSV delimiters, quotes and newlines', () =>
    expect(csvRow({ a: 'one,"two"\nthree' }, ['a'])).toBe('"one,""two""\nthree"\r\n'));
  const event = {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    courseId: randomUUID(),
    lessonId: randomUUID(),
    enrollmentId: randomUUID(),
    type: 'lesson.viewed',
    properties: {},
  };
  it.each(['payment.succeeded', 'assessment.graded', 'course.completed', 'enrollment.created'])(
    'rejects authoritative client event %s',
    (type) =>
      expect(activityBatchSchema.safeParse({ events: [{ ...event, type }] }).success).toBe(false),
  );
  it('rejects injected actor/tenant and sensitive properties', () => {
    expect(
      activityBatchSchema.safeParse({ events: [{ ...event, userId: randomUUID() }] }).success,
    ).toBe(false);
    expect(
      activityBatchSchema.safeParse({
        events: [{ ...event, properties: { email: 'person@example.test' } }],
      }).success,
    ).toBe(false);
  });
  it('bounds batch size and playback deltas', () => {
    expect(
      activityBatchSchema.safeParse({
        events: Array.from({ length: 101 }, () => ({ ...event, eventId: randomUUID() })),
      }).success,
    ).toBe(false);
    expect(
      activityBatchSchema.safeParse({
        events: [
          {
            ...event,
            type: 'lesson.playback',
            properties: { positionSeconds: 1, elapsedSeconds: 121 },
          },
        ],
      }).success,
    ).toBe(false);
  });
});
