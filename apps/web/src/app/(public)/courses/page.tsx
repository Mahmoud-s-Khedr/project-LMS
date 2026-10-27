import { catalogCoursesResponseSchema } from '@lms/shared';
import type { Metadata } from 'next';
import { CourseCatalog, type CatalogFilterState } from '@/features/catalog';

export const metadata: Metadata = {
  title: 'Courses & Live Cohorts Catalog',
  description:
    'Browse self-paced studio courses and live cohorts across software engineering, design systems, data & AI, and product leadership.',
  openGraph: {
    title: 'Courses & Live Cohorts Catalog',
    description: 'Browse practitioner-led courses and cohorts.',
  },
};

interface CoursesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function CoursesCatalogPage({ searchParams }: CoursesPageProps) {
  const resolved = await searchParams;
  const rawCategory = firstString(resolved.category);
  const rawLevel = firstString(resolved.level);
  const rawDelivery = firstString(resolved.deliveryMode);
  const rawLanguage = firstString(resolved.language);
  const rawSearch = firstString(resolved.search);
  const rawSort = firstString(resolved.sort);

  const initialFilters: Partial<CatalogFilterState> = {
    ...(rawSearch ? { search: rawSearch } : {}),
    ...(rawCategory ? { category: rawCategory } : {}),
    ...(rawLevel ? { level: rawLevel } : {}),
    ...(rawDelivery === 'COHORT' || rawDelivery === 'SELF_PACED'
      ? { deliveryMode: rawDelivery }
      : {}),
    ...(rawLanguage ? { language: rawLanguage } : {}),
    ...(rawSort === 'title' || rawSort === 'publishedAt' ? { sort: rawSort } : {}),
  };

  const query = new URLSearchParams({ limit: '12', sort: initialFilters.sort ?? 'publishedAt' });
  for (const [key, value] of Object.entries(initialFilters)) {
    if (value) query.set(key, String(value));
  }
  let initialData;
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_ORIGIN ?? 'http://localhost:4100'}/api/v1/catalog/courses?${query}`,
      { cache: 'no-store' },
    );
    if (response.ok) initialData = catalogCoursesResponseSchema.parse(await response.json());
  } catch {
    // The client query retains the existing retry/error UI when the API is unavailable.
  }
  return <CourseCatalog initialFilters={initialFilters} initialData={initialData} />;
}
