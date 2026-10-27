import {
  FIRST_HEARTBEAT_CREDIT_CAP_SECONDS,
  PLAYBACK_JITTER_SECONDS,
  clampOccurredAt,
  floorPercent,
  parseSnapshot,
  playbackCredit,
} from './progress-math';

describe('floorPercent', () => {
  it('never rounds up to 100 before everything is complete', () => {
    expect(floorPercent(999, 1000)).toBe('99.9');
    expect(floorPercent(2, 3)).toBe('66.66');
    expect(floorPercent(3, 3)).toBe('100');
  });
  it('handles empty and zero', () => {
    expect(floorPercent(0, 5)).toBe('0');
    expect(floorPercent(1, 0)).toBe('0');
    expect(floorPercent(1, 4)).toBe('25');
  });
  it('emits only values accepted by the percent contract', () => {
    for (let t = 1; t <= 40; t++)
      for (let d = 0; d <= t; d++)
        expect(floorPercent(d, t)).toMatch(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/);
  });
});

describe('playbackCredit', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  it('caps a first heartbeat', () => {
    expect(playbackCredit({ claimedElapsedSeconds: 120, lastContactAt: null, now })).toBe(
      FIRST_HEARTBEAT_CREDIT_CAP_SECONDS,
    );
    expect(playbackCredit({ claimedElapsedSeconds: 10, lastContactAt: null, now })).toBe(10);
  });
  it('cannot exceed real elapsed server time plus jitter', () => {
    const last = new Date(now.getTime() - 15_000);
    expect(playbackCredit({ claimedElapsedSeconds: 120, lastContactAt: last, now })).toBe(
      15 + PLAYBACK_JITTER_SECONDS,
    );
    expect(playbackCredit({ claimedElapsedSeconds: 10, lastContactAt: last, now })).toBe(10);
  });
  it('rapid replays earn nothing beyond jitter', () => {
    expect(playbackCredit({ claimedElapsedSeconds: 120, lastContactAt: now, now })).toBe(
      PLAYBACK_JITTER_SECONDS,
    );
  });
  it('bounds claims to 120s and never negative', () => {
    const last = new Date(now.getTime() - 3_600_000);
    expect(playbackCredit({ claimedElapsedSeconds: 9999, lastContactAt: last, now })).toBe(120);
    expect(playbackCredit({ claimedElapsedSeconds: -5, lastContactAt: last, now })).toBe(0);
  });
});

describe('clampOccurredAt', () => {
  const now = new Date('2026-03-01T10:00:00Z');
  it('clamps future and ancient client times to a window ending at receipt', () => {
    expect(clampOccurredAt(new Date('2027-01-01T00:00:00Z'), now)).toEqual(now);
    expect(clampOccurredAt(new Date('2020-01-01T00:00:00Z'), now)).toEqual(
      new Date(now.getTime() - 5 * 60 * 1000),
    );
    const ok = new Date(now.getTime() - 1000);
    expect(clampOccurredAt(ok, now)).toEqual(ok);
  });
});

describe('completion snapshot', () => {
  const id = '8a45532e-b46a-4f83-8892-521f8c1d32b9';
  it('accepts a frozen snapshot and rejects client-shaped garbage', () => {
    const ok = {
      version: 1,
      frozenAt: '2026-03-01T00:00:00.000Z',
      requiredLessonIds: [id],
      criteria: { [id]: { rule: 'ACKNOWLEDGE', requiredWatchPercent: 90 } },
    };
    expect(parseSnapshot(ok)).toEqual(ok);
    expect(parseSnapshot({})).toBeNull();
    expect(parseSnapshot({ ...ok, passed: true })).toBeNull();
  });
});
