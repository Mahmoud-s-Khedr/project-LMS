import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/features/marketing/site-config';
import { CheckoutSuccessView } from '@/features/commerce';

interface CheckoutSuccessPageProps {
  searchParams: Promise<{
    orderId?: string;
  }>;
}

export const metadata: Metadata = {
  title: `Enrollment Confirmed — ${siteConfig.name}`,
  description: 'Thank you for your enrollment.',
};

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { orderId } = await searchParams;

  if (!orderId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Card className="p-8">
          <CardHeader>
            <CardTitle className="text-xl">Checkout Complete</CardTitle>
            <CardDescription>
              Thank you for learning with {siteConfig.name}. You can review all your course
              enrollments and receipts in your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-3">
            <Button asChild>
              <Link href="/student">Go to Student Portal</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/student/orders">My Orders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <CheckoutSuccessView orderId={orderId} />;
}
