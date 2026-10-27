'use client';

import * as React from 'react';
import { Globe, Laptop, Loader2, LogOut, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogoutAllMutation, useRevokeSessionMutation, useSessionsQuery } from '../hooks';
import type { UserSession } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';

function formatSessionDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return isoString;
  }
}

function parseDeviceFromUserAgent(userAgent: string | null): {
  deviceType: 'mobile' | 'desktop' | 'unknown';
  label: string;
} {
  if (!userAgent) {
    return { deviceType: 'unknown', label: 'Web Browser' };
  }

  const isMobile = /mobile|iphone|ipad|android/i.test(userAgent);
  let browser = 'Browser';
  if (/chrome|crios/i.test(userAgent) && !/edge|edg/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/edg/i.test(userAgent)) browser = 'Edge';

  let os = '';
  if (/iphone|ipad/i.test(userAgent)) os = 'iOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/mac os/i.test(userAgent)) os = 'macOS';
  else if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  const label = os ? `${browser} on ${os}` : browser;
  return { deviceType: isMobile ? 'mobile' : 'desktop', label };
}

export function SessionList() {
  const { data: sessions, isLoading, isError, error } = useSessionsQuery();
  const revokeMutation = useRevokeSessionMutation();
  const logoutAllMutation = useLogoutAllMutation();
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  async function handleRevoke(familyId: string) {
    setRevokingId(familyId);
    try {
      await revokeMutation.mutateAsync(familyId);
    } catch {
      // Surfaced via AuthErrorBanner
    } finally {
      setRevokingId(null);
    }
  }

  async function handleLogoutAll() {
    try {
      await logoutAllMutation.mutateAsync();
    } catch {
      // Surfaced via AuthErrorBanner
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-semibold tracking-tight">Active Sessions</CardTitle>
          <CardDescription>
            Manage browsers and devices where you are currently signed in.
          </CardDescription>
        </div>

        {sessions && sessions.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleLogoutAll}
            disabled={logoutAllMutation.isPending}
            className="self-start text-xs rounded-xl"
          >
            {logoutAllMutation.isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                <span>Signing out...</span>
              </>
            ) : (
              <>
                <LogOut className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>Log out of other devices</span>
              </>
            )}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <AuthErrorBanner error={error ?? revokeMutation.error ?? logoutAllMutation.error} />

        {isLoading && (
          <div role="status" aria-label="Loading active sessions" className="space-y-3">
            <span className="sr-only">Loading active sessions...</span>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        )}

        {!isLoading && !isError && (!sessions || sessions.length === 0) && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active sessions found.
          </p>
        )}

        {sessions && sessions.length > 0 && (
          <ul
            role="list"
            aria-label="Current sessions list"
            className="divide-y divide-border rounded-xl border border-border"
          >
            {sessions.map((session: UserSession) => {
              const { deviceType, label } = parseDeviceFromUserAgent(session.userAgent);
              const isRevoking = revokingId === session.familyId;

              return (
                <li
                  key={session.familyId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
                      {deviceType === 'mobile' ? (
                        <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : deviceType === 'desktop' ? (
                        <Laptop className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Globe className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {label}
                        </span>
                        {session.current && (
                          <Badge variant="default" className="text-[10px] gap-1 px-1.5 py-0">
                            <ShieldCheck className="size-3" aria-hidden="true" />
                            <span>This device</span>
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        Signed in on {formatSessionDate(session.createdAt)}
                      </p>
                    </div>
                  </div>

                  {!session.current && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(session.familyId)}
                      disabled={isRevoking}
                      aria-label={`Revoke session on ${label}`}
                      className="self-end sm:self-center text-xs text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    >
                      {isRevoking ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          <span>Revoking...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          <span>Revoke</span>
                        </>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
