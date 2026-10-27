import {
  COURSE_CATEGORIES,
  COURSE_LANGUAGES,
  COURSE_LEVELS,
  FAQ_ITEMS,
  MOCK_COURSES,
  TESTIMONIALS,
  VALUE_PROP_GROUPS,
} from './mock-data';
import type {
  CatalogCourse,
  CatalogFilterParams,
  FaqItem,
  PaginatedCatalogResult,
  PricingPlan,
  Testimonial,
  ValuePropGroup,
} from './types';

export interface MarketingDataAdapter {
  getFeaturedCourses(): CatalogCourse[];
  queryCatalogCourses(params?: CatalogFilterParams): PaginatedCatalogResult;
  getCourseBySlug(slug: string): CatalogCourse | undefined;
  getAllCourseSlugs(): string[];
  getValuePropGroups(): ValuePropGroup[];
  getPricingPlans(): PricingPlan[];
  getTestimonials(): Testimonial[];
  getFaqItems(): FaqItem[];
}

export function formatPriceMinor(priceMinor: number, currency: 'USD' | 'EUR' = 'USD'): string {
  if (priceMinor <= 0) return 'Free';
  const amount = priceMinor / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function queryMockCatalogCourses(params: CatalogFilterParams = {}): PaginatedCatalogResult {
  const {
    search = '',
    category = 'ALL',
    level = 'ALL',
    price = 'ALL',
    language = 'ALL',
    deliveryMode = 'ALL',
    sort = 'popular',
    page = 1,
    pageSize = 6,
  } = params;

  const normalizedQuery = search.trim().toLowerCase();

  const filtered = MOCK_COURSES.filter((course) => {
    if (normalizedQuery) {
      const haystack = [
        course.title,
        course.subtitle,
        course.summary,
        course.category,
        course.instructor.name,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }

    if (category !== 'ALL' && course.category !== category) return false;
    if (level !== 'ALL' && course.level !== level) return false;
    if (language !== 'ALL' && course.language !== language) return false;
    if (deliveryMode !== 'ALL' && course.deliveryMode !== deliveryMode) return false;

    if (price === 'FREE' && course.priceMinor !== 0) return false;
    if (price === 'PAID' && course.priceMinor === 0) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case 'rating':
        return b.rating - a.rating;
      case 'newest':
        return b.updatedAt.localeCompare(a.updatedAt);
      case 'price-asc':
        return a.priceMinor - b.priceMinor;
      case 'price-desc':
        return b.priceMinor - a.priceMinor;
      case 'popular':
      default:
        return b.enrolledCount - a.enrolledCount;
    }
  });

  const safePageSize = Math.max(1, pageSize);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;
  const items = sorted.slice(start, start + safePageSize);

  return {
    items,
    meta: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages,
    },
  };
}

export const marketingDataAdapter: MarketingDataAdapter = {
  getFeaturedCourses: () => MOCK_COURSES.filter((c) => c.featured),
  queryCatalogCourses: (params) => queryMockCatalogCourses(params),
  getCourseBySlug: (slug) => MOCK_COURSES.find((c) => c.slug === slug),
  getAllCourseSlugs: () => MOCK_COURSES.map((c) => c.slug),
  getValuePropGroups: () => VALUE_PROP_GROUPS,
  getPricingPlans: () => [],
  getTestimonials: () => TESTIMONIALS,
  getFaqItems: () => FAQ_ITEMS,
};

export { COURSE_CATEGORIES, COURSE_LANGUAGES, COURSE_LEVELS };
