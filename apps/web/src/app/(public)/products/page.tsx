import type { Metadata } from 'next';
import { ProductCatalog } from '@/features/catalog';

export const metadata: Metadata = {
  title: 'Course Bundles & All-Access Plans',
  description:
    'Explore curated course bundles, studio master tracks, and all-access subscription passes.',
  openGraph: {
    title: 'Course Bundles & All-Access Plans',
    description:
      'Explore curated course bundles, studio master tracks, and all-access subscription passes.',
  },
};

export default function ProductsPage() {
  return <ProductCatalog />;
}
