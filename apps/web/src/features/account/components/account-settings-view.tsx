'use client';

import * as React from 'react';
import { Bell, LogOut, Shield, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChangePasswordForm, SessionList } from '@/features/auth';
import { NotificationPreferencesForm } from '@/features/notifications';
import { ProfileForm } from './profile-form';
import { useLogoutAllSessionsMutation } from '../hooks';

export function AccountSettingsView() {
  const [activeTab, setActiveTab] = React.useState('profile');
  const logoutAllMutation = useLogoutAllSessionsMutation();

  const handleLogoutAll = () => {
    if (
      window.confirm(
        'Are you sure you want to log out from all devices? This will invalidate all active sessions and require signing in again.',
      )
    ) {
      logoutAllMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="profile" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Shield className="size-4" />
            Security & Sessions
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <Bell className="size-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Profile */}
        <TabsContent value="profile" className="space-y-6">
          <ProfileForm />
        </TabsContent>

        {/* Tab 2: Security & Sessions */}
        <TabsContent value="security" className="space-y-8">
          {/* Change Password */}
          <ChangePasswordForm />

          {/* Active Sessions */}
          <SessionList />

          {/* Global Logout / Cache Clearing */}
          <Card className="border-destructive/30 bg-destructive/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-destructive">
                Global Session Revocation
              </CardTitle>
              <CardDescription className="text-xs">
                Immediately revoke all refresh token families across all web browsers and devices,
                clearing active credentials and cached session data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleLogoutAll}
                disabled={logoutAllMutation.isPending}
                className="text-xs"
              >
                <LogOut className="mr-1.5 size-3.5" />
                Sign Out Everywhere & Clear Session Cache
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Notifications */}
        <TabsContent value="notifications" className="space-y-6">
          <NotificationPreferencesForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
