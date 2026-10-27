import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductDetail, fetchCatalogProductDetail } from '@/features/catalog';

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { productId } = await params;
  try {
    const product = await fetchCatalogProductDetail(productId);
    return {
      title: `${product.name}`,
      description: `Enroll in ${product.name} — includes ${product.courses.length} courses with full lifetime benefits.`,
      openGraph: {
        title: `${product.name}`,
        description: `Enroll in ${product.name} — includes ${product.courses.length} courses with full lifetime benefits.`,
      },
    };
  } catch {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    };
  }
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { productId } = await params;
  try {
    const product = await fetchCatalogProductDetail(productId);
    return <ProductDetail product={product} />;
  } catch {
    notFound();
  }
}
