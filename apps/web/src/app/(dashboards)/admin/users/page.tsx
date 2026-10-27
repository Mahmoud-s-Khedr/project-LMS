import type { Metadata } from 'next';
import { UsersTable } from '@/features/administration';
import { Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Platform Users | Admin Console',
  description: 'Manage platform roles, account status, and session security.',
};

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Platform Users
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search and govern user accounts, elevate platform administrators, or suspend identities
          with an audited reason.
        </p>
      </div>

      <UsersTable />
    </div>
  );
}
