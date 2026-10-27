import type { Metadata } from 'next';
import Link from 'next/link';
import { Package, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/features/marketing/site-config';
import { fetchCatalogProductDetail } from '@/features/catalog';
import { CheckoutView } from '@/features/commerce';

interface CheckoutPageProps {
  searchParams: Promise<{
    productId?: string;
    priceId?: string;
    workspaceId?: string;
  }>;
}

export async function generateMetadata({ searchParams }: CheckoutPageProps): Promise<Metadata> {
  const { productId } = await searchParams;
  if (!productId) {
    return {
      title: `Checkout — ${siteConfig.name}`,
      description: 'Secure course checkout and enrollment.',
    };
  }
  try {
    const product = await fetchCatalogProductDetail(productId);
    return {
      title: `Enroll in ${product.name} — ${siteConfig.name}`,
      description: `Complete enrollment for ${product.name}. Secure Stripe checkout.`,
    };
  } catch {
    return {
      title: `Checkout — ${siteConfig.name}`,
      description: 'Secure course checkout and enrollment.',
    };
  }
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { productId, priceId, workspaceId: paramWorkspaceId } = await searchParams;

  if (!productId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card className="border-dashed p-8">
          <CardHeader>
            <Package className="mx-auto h-10 w-10 text-muted-foreground/60 mb-2" />
            <CardTitle className="text-xl">No Product Selected</CardTitle>
            <CardDescription>
              Please browse our course catalog and select a course or bundle to begin checkout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/catalog">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Browse Catalog
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  try {
    const product = await fetchCatalogProductDetail(productId);
    const resolvedWorkspaceId =
      paramWorkspaceId ||
      product.prices[0]?.workspaceId ||
      product.courses[0]?.workspaceId ||
      '';

    return (
      <CheckoutView
        product={product}
        initialPriceId={priceId}
        workspaceId={resolvedWorkspaceId}
      />
    );
  } catch {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card className="border-rose-500/30 p-8">
          <CardHeader>
            <Package className="mx-auto h-10 w-10 text-rose-500 mb-2" />
            <CardTitle className="text-xl">Product Not Found</CardTitle>
            <CardDescription>
              The requested product is unavailable or could not be loaded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/catalog">Return to Catalog</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
