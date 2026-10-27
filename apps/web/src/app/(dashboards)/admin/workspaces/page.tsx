import type { Metadata } from 'next';
import { WorkspacesTable } from '@/features/administration';
import { Building2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Workspace Inventory | Admin Console',
  description: 'Platform tenant governance, policy enforcement, and workspace access status.',
};

export default function AdminWorkspacesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" />
          Workspace Inventory
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor all creator and academy workspaces. Suspend tenants violating policies to halt all
          downstream access evaluation immediately.
        </p>
      </div>

      <WorkspacesTable />
    </div>
  );
}
