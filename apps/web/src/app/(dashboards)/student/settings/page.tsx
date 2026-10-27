'use client';

import * as React from 'react';
import { AccountSettingsView } from '@/features/account';

export default function StudentSettingsPage() {
  return (
    <div className="space-y-6 pb-10">
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Account Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal identity, display preferences, password security, active login
          sessions, and notifications.
        </p>
      </div>

      <AccountSettingsView />
    </div>
  );
}
