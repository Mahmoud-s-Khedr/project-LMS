import { describe, expect, it } from 'vitest';
import {
  formatDurationMinutes,
  formatPriceMinor,
  marketingDataAdapter,
} from './adapter';

describe('Marketing catalog mock data adapter', () => {
  it('returns featured courses and resolves courses by slug', () => {
    const featured = marketingDataAdapter.getFeaturedCourses();
    expect(featured.length).toBeGreaterThanOrEqual(4);

    const course = marketingDataAdapter.getCourseBySlug('distributed-systems-in-typescript');
    expect(course).toBeDefined();
    expect(course?.instructor.name).toBe('Elena Rostova');
    expect(course?.sections.length).toBeGreaterThan(0);
  });

  it('filters catalog courses by search, category, level, price, language, and paginates', () => {
    const freeOnly = marketingDataAdapter.queryCatalogCourses({ price: 'FREE' });
    expect(freeOnly.items.length).toBeGreaterThan(0);
    expect(freeOnly.items.every((c) => c.priceMinor === 0)).toBe(true);

    const spanishOnly = marketingDataAdapter.queryCatalogCourses({ language: 'es' });
    expect(spanishOnly.items).toHaveLength(1);
    expect(spanishOnly.items[0]?.slug).toBe('arquitectura-frontend-moderna-nextjs');

    const page1 = marketingDataAdapter.queryCatalogCourses({ page: 1, pageSize: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.meta.totalPages).toBe(2);

    const page2 = marketingDataAdapter.queryCatalogCourses({ page: 2, pageSize: 3 });
    expect(page2.items).toHaveLength(3);
  });

  it('formats minor unit prices and durations accurately', () => {
    expect(formatPriceMinor(0)).toBe('Free');
    expect(formatPriceMinor(18900, 'USD')).toBe('$189');
    expect(formatDurationMinutes(125)).toBe('2h 5m');
    expect(formatDurationMinutes(45)).toBe('45m');
  });
});
