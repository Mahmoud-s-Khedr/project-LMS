'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useActiveWorkspace } from '@/features/workspaces';
import { AdminOrderDetailView } from '@/features/commerce';

export default function AdminOrderPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params?.orderId ?? '';
  const { activeWorkspaceId } = useActiveWorkspace();

  return (
    <div className="container max-w-5xl py-8">
      <AdminOrderDetailView workspaceId={activeWorkspaceId ?? ''} orderId={orderId} />
    </div>
  );
}
