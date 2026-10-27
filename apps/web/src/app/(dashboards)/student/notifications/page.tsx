'use client';

import * as React from 'react';
import { Bell, SlidersHorizontal } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationCenter, NotificationPreferencesForm } from '@/features/notifications';

export default function StudentNotificationsPage() {
  const [activeTab, setActiveTab] = React.useState('notifications');

  return (
    <div className="space-y-6 pb-10">
      <div className="border-b border-border/60 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Notifications & Alerts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stay informed about course releases, assessment grading, payment receipts, and security
          activity.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto">
          <TabsTrigger
            value="notifications"
            className="flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <Bell className="size-4" />
            In-App Feed
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <SlidersHorizontal className="size-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <NotificationCenter />
        </TabsContent>

        <TabsContent value="preferences">
          <NotificationPreferencesForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
