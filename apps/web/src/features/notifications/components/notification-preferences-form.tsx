'use client';

import * as React from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Loader2,
  Lock,
  Mail,
  RotateCcw,
  Save,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from '../hooks';
import { isMandatoryEmailNotification, type NotificationPreference } from '../types';

type SecurityConfig = {
  type: 'security.password_changed' | 'security.email_verification';
  title: string;
  description: string;
  category: 'security';
};

type BusinessConfig = {
  type:
    | 'course.released'
    | 'live.reminder'
    | 'assessment.graded'
    | 'order.paid'
    | 'subscription.payment_failed'
    | 'certificate.issued';
  title: string;
  description: string;
  category: 'courses' | 'commerce' | 'certificates';
};

type PreferenceRowConfig = SecurityConfig | BusinessConfig;

const PREFERENCE_CONFIGS: PreferenceRowConfig[] = [
  {
    type: 'security.password_changed',
    title: 'Password Changes & Session Revocations',
    description: 'Alerts when your password changes or unfamiliar login sessions are detected.',
    category: 'security',
  },
  {
    type: 'security.email_verification',
    title: 'Email Verifications',
    description: 'Verification links required for account access and payments.',
    category: 'security',
  },
  {
    type: 'course.released',
    title: 'New Course Content Releases',
    description: 'Notifications when scheduled or drip lessons become available.',
    category: 'courses',
  },
  {
    type: 'live.reminder',
    title: 'Live Session Reminders',
    description: 'Upcoming scheduled cohort workshops and live Q&A sessions.',
    category: 'courses',
  },
  {
    type: 'assessment.graded',
    title: 'Assessment & Quiz Results',
    description: 'Alerts when your submitted assessments and assignments are graded.',
    category: 'courses',
  },
  {
    type: 'order.paid',
    title: 'Payment & Order Receipts',
    description: 'Receipts and order confirmations for course enrollments.',
    category: 'commerce',
  },
  {
    type: 'subscription.payment_failed',
    title: 'Subscription Payment Notices',
    description: 'Alerts if a subscription renewal attempt fails or requires attention.',
    category: 'commerce',
  },
  {
    type: 'certificate.issued',
    title: 'Certificate Issuance',
    description: 'Notifications when an official verifiable certificate is awarded.',
    category: 'certificates',
  },
];

export function NotificationPreferencesForm() {
  const {
    data: serverPreferences,
    isLoading,
    isError,
    refetch,
  } = useNotificationPreferencesQuery();
  const updateMutation = useUpdateNotificationPreferencesMutation();
  const { activeWorkspaceId, workspaces } = useActiveWorkspace();

  const [preferences, setPreferences] = React.useState<NotificationPreference[]>([]);
  const [success, setSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const availableWorkspaces = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    if (workspaces && workspaces.length > 0) {
      for (const w of workspaces) {
        map.set(w.id, { id: w.id, name: w.name });
      }
    }
    if (serverPreferences) {
      for (const p of serverPreferences) {
        if (p.workspaceId && !map.has(p.workspaceId)) {
          map.set(p.workspaceId, { id: p.workspaceId, name: p.workspaceId });
        }
      }
    }
    return Array.from(map.values());
  }, [workspaces, serverPreferences]);

  const [selectedWorkspaceId, setSelectedWorkspaceId] = React.useState<string>(() => {
    return activeWorkspaceId ?? '';
  });

  React.useEffect(() => {
    if (activeWorkspaceId && availableWorkspaces.some((w) => w.id === activeWorkspaceId)) {
      setSelectedWorkspaceId(activeWorkspaceId);
    } else if (!selectedWorkspaceId && availableWorkspaces.length > 0 && availableWorkspaces[0]) {
      setSelectedWorkspaceId(availableWorkspaces[0].id);
    }
  }, [activeWorkspaceId, availableWorkspaces, selectedWorkspaceId]);

  React.useEffect(() => {
    if (serverPreferences) {
      setPreferences(serverPreferences);
    }
  }, [serverPreferences]);

  const isEnabled = (
    type: string,
    channel: 'EMAIL' | 'IN_APP',
    workspaceId: string | null,
  ): boolean => {
    if (channel === 'EMAIL' && isMandatoryEmailNotification(type)) {
      return true;
    }
    const pref = preferences.find(
      (p) => p.workspaceId === workspaceId && p.type === type && p.channel === channel,
    );
    return pref ? pref.enabled : true;
  };

  const handleToggle = (type: string, channel: 'EMAIL' | 'IN_APP', workspaceId: string | null) => {
    if (channel === 'EMAIL' && isMandatoryEmailNotification(type)) {
      return; // Cannot toggle mandatory email
    }
    setSuccess(false);
    setErrorMessage(null);

    setPreferences((prev) => {
      const idx = prev.findIndex(
        (p) => p.workspaceId === workspaceId && p.type === type && p.channel === channel,
      );
      if (idx >= 0 && prev[idx]) {
        const item = prev[idx]!;
        const updated = [...prev];
        updated[idx] = { ...item, enabled: !item.enabled };
        return updated;
      }
      return [
        ...prev,
        {
          workspaceId,
          type,
          channel,
          enabled: false,
        } as unknown as NotificationPreference,
      ];
    });
  };

  const handleSave = async () => {
    setSuccess(false);
    setErrorMessage(null);
    try {
      await updateMutation.mutateAsync(preferences);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update preferences');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
        <p className="font-semibold text-destructive">Failed to load notification preferences</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
          <RotateCcw className="mr-2 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">
          Notification Preferences
        </CardTitle>
        <CardDescription className="text-xs">
          Choose which channels you want to receive notifications on. Security and transactional
          notices cannot be disabled.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {success && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>Your notification preferences have been saved.</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Workspace Scope Selector */}
        {availableWorkspaces.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-muted/20 rounded-xl border border-border">
            <div className="space-y-0.5">
              <label htmlFor="workspace-scope" className="text-xs font-semibold text-foreground">
                Workspace Scope
              </label>
              <p className="text-[11px] text-muted-foreground">
                Configure notifications for course updates and commerce transactions in this
                workspace.
              </p>
            </div>
            <select
              id="workspace-scope"
              aria-label="Workspace Scope"
              value={selectedWorkspaceId}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-background px-2.5 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-56"
            >
              {availableWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-end gap-6 text-xs font-semibold text-muted-foreground px-2">
          <span className="flex items-center gap-1.5 w-16 justify-center">
            <Mail className="size-3.5" />
            Email
          </span>
          <span className="flex items-center gap-1.5 w-16 justify-center">
            <Bell className="size-3.5" />
            In-App
          </span>
        </div>

        {/* Categories */}
        <div className="divide-y divide-border/60 rounded-xl border border-border/80 overflow-hidden">
          {PREFERENCE_CONFIGS.map((config) => {
            const isEmailMandatory = isMandatoryEmailNotification(config.type);
            const targetWorkspaceId = config.category === 'security' ? null : selectedWorkspaceId;
            const emailActive = isEnabled(config.type, 'EMAIL', targetWorkspaceId);
            const inAppActive = isEnabled(config.type, 'IN_APP', targetWorkspaceId);

            return (
              <div
                key={config.type}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-card hover:bg-muted/10 transition-colors"
              >
                <div className="space-y-0.5 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-foreground">
                      {config.title}
                    </span>
                    {isEmailMandatory && (
                      <Badge
                        variant="outline"
                        className="border-border text-[10px] py-0 font-normal text-muted-foreground"
                      >
                        <Lock className="mr-1 size-2.5" />
                        Required Email
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {config.description}
                  </p>
                </div>

                {/* Toggles */}
                <div className="flex items-center justify-end gap-6 shrink-0 self-end sm:self-center">
                  {/* Email Toggle */}
                  <div className="w-16 flex justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={emailActive}
                      disabled={isEmailMandatory}
                      onClick={() => handleToggle(config.type, 'EMAIL', targetWorkspaceId)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isEmailMandatory
                          ? 'opacity-60 cursor-not-allowed bg-primary'
                          : emailActive
                            ? 'bg-primary'
                            : 'bg-muted'
                      }`}
                      aria-label={`Toggle email notifications for ${config.title}`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                          emailActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* In-App Toggle */}
                  <div className="w-16 flex justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={inAppActive}
                      onClick={() => handleToggle(config.type, 'IN_APP', targetWorkspaceId)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        inAppActive ? 'bg-primary' : 'bg-muted'
                      }`}
                      aria-label={`Toggle in-app notifications for ${config.title}`}
                    >
                      <span
                        className={`pointer-events-none inline-block size-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
                          inAppActive ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      <CardFooter className="flex justify-end border-t border-border/60 pt-4">
        <Button onClick={handleSave} disabled={updateMutation.isPending} className="text-xs">
          {updateMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-1.5 size-3.5" />
              Save Preferences
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
