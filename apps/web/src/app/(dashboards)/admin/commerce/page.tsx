import type { Metadata } from 'next';
import { siteConfig } from '@/features/marketing/site-config';
import { AdminCommerceView } from '@/features/commerce';

export const metadata: Metadata = {
  title: `Commerce Administration — ${siteConfig.name}`,
  description: 'Manage products, prices, promotional coupons, order accounting, and refunds.',
};

export default function AdminCommercePage() {
  return (
    <div className="container max-w-6xl py-8">
      <AdminCommerceView />
    </div>
  );
}
