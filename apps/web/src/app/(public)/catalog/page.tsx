import type { Metadata } from 'next';
import { CourseCatalog, type CatalogFilterState } from '@/features/catalog';

export const metadata: Metadata = {
  title: 'Public Catalog',
  description:
    'Search and filter practitioner-led courses, live cohort programs, and technical certifications.',
  openGraph: {
    title: 'Public Catalog',
    description: 'Explore verified learning programs and live cohorts.',
  },
};

interface CatalogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
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

  return <CourseCatalog initialFilters={initialFilters} />;
}
