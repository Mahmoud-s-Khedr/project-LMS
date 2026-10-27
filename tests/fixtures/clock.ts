/**
 * Clock manipulation and deterministic time utilities for tests.
 */

export interface TestClock {
  now(): Date;
  nowIso(): string;
  advanceBy(ms: number): void;
  advanceTo(date: Date | string): void;
  reset(): void;
}

export function createTestClock(
  initialDate: Date | string = '2026-10-26T12:00:00.000Z',
): TestClock {
  let currentTime = new Date(initialDate).getTime();
  const startTime = currentTime;

  return {
    now(): Date {
      return new Date(currentTime);
    },
    nowIso(): string {
      return new Date(currentTime).toISOString();
    },
    advanceBy(ms: number): void {
      currentTime += ms;
    },
    advanceTo(date: Date | string): void {
      const nextTime = new Date(date).getTime();
      if (nextTime < currentTime) {
        throw new Error(`Cannot move clock backwards: ${nextTime} < ${currentTime}`);
      }
      currentTime = nextTime;
    },
    reset(): void {
      currentTime = startTime;
    },
  };
}

/** Format a date as RFC 3339 UTC string with millisecond precision */
export function formatRfc3339(date: Date | string | number): string {
  return new Date(date).toISOString();
}

/** Format date only as YYYY-MM-DD */
export function formatDateOnly(date: Date | string | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** Check if two timestamps are within a given tolerance in milliseconds */
export function isWithinTolerance(
  actual: Date | string,
  expected: Date | string,
  toleranceMs: number = 2000,
): boolean {
  const actualMs = new Date(actual).getTime();
  const expectedMs = new Date(expected).getTime();
  return Math.abs(actualMs - expectedMs) <= toleranceMs;
}
