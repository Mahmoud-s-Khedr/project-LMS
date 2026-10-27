import type { Metadata } from 'next';
import { AdminOverview } from '@/features/administration';

export const metadata: Metadata = {
  title: 'Admin Console Overview',
  description:
    'Platform governance, tenant inventory, financial ledger, and operational pipelines.',
};

export default function AdminOverviewPage() {
  return <AdminOverview />;
}
