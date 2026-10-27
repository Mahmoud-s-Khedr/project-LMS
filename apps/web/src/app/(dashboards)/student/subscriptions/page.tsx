import type { Metadata } from 'next';
import { siteConfig } from '@/features/marketing/site-config';
import { StudentSubscriptionsView } from '@/features/commerce';

export const metadata: Metadata = {
  title: `My Subscriptions — ${siteConfig.name}`,
  description: 'Manage active subscriptions, renewals, and billing settings.',
};

export default function StudentSubscriptionsPage() {
  return (
    <div className="container max-w-5xl py-8">
      <StudentSubscriptionsView />
    </div>
  );
}
