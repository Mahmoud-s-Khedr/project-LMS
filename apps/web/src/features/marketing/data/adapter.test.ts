import { describe, expect, it } from 'vitest';
import { formatDurationMinutes, formatPriceMinor, marketingDataAdapter } from './adapter';

describe('Marketing catalog mock data adapter', () => {
  it('does not expose fictional catalog courses', () => {
    expect(marketingDataAdapter.getFeaturedCourses()).toEqual([]);
    expect(marketingDataAdapter.queryCatalogCourses().items).toEqual([]);
  });

  it('formats minor unit prices and durations accurately', () => {
    expect(formatPriceMinor(0)).toBe('Free');
    expect(formatPriceMinor(18900, 'USD')).toBe('$189');
    expect(formatDurationMinutes(125)).toBe('2h 5m');
    expect(formatDurationMinutes(45)).toBe('45m');
  });
});
