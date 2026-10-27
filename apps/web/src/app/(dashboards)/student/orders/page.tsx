import type { Metadata } from 'next';
import { siteConfig } from '@/features/marketing/site-config';
import { StudentOrdersView } from '@/features/commerce';

export const metadata: Metadata = {
  title: `My Orders & Receipts — ${siteConfig.name}`,
  description: 'View your order history, transaction receipts, and fulfillment status.',
};

export default function StudentOrdersPage() {
  return (
    <div className="container max-w-5xl py-8">
      <StudentOrdersView />
    </div>
  );
}
