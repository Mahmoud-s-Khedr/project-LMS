'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Calendar,
  ExternalLink,
  RotateCcw,
  Ban,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Subscription } from '../types';
import {
  useMySubscriptionsQuery,
  useCancelSubscriptionMutation,
  useResumeSubscriptionMutation,
  useBillingPortalMutation,
} from '../hooks';
import { formatDate } from '../utils';
import { SubscriptionStatusBadge } from './subscription-status-badge';

export function StudentSubscriptionsView() {
  const { data: subsResponse, isLoading, error, refetch } = useMySubscriptionsQuery();
  const subscriptions = subsResponse?.data ?? [];

  // Cancellation modal state
  const [cancelingSub, setCancelingSub] = React.useState<Subscription | null>(null);
  const cancelMutation = useCancelSubscriptionMutation();

  // Resume mutation
  const resumeMutation = useResumeSubscriptionMutation();

  // Billing portal mutation
  const [portalWorkspaceId, setPortalWorkspaceId] = React.useState<string | null>(null);
  const portalMutation = useBillingPortalMutation(portalWorkspaceId ?? '');

  const handleOpenBillingPortal = async (workspaceId: string) => {
    setPortalWorkspaceId(workspaceId);
    try {
      const result = await portalMutation.mutateAsync({
        returnPath: '/student/subscriptions',
      });
      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      // error handled in UI
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelingSub) return;
    try {
      await cancelMutation.mutateAsync({ subscriptionId: cancelingSub.id });
      setCancelingSub(null);
    } catch {
      // error handled in dialog
    }
  };

  const handleResume = async (subscriptionId: string) => {
    try {
      await resumeMutation.mutateAsync({ subscriptionId });
    } catch {
      // error handled
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            My Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage your recurring membership plans, payment methods, and renewal dates.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 w-full animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : error ? (
        <Card className="border-rose-500/30">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <CardTitle className="text-lg mt-2">Error Loading Subscriptions</CardTitle>
            <CardDescription>{error.message}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      ) : subscriptions.length === 0 ? (
        <Card className="border-dashed p-10 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/60 mb-3" />
          <h3 className="text-base font-semibold text-foreground">No active subscriptions</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
            You do not currently have any active recurring memberships or academy passes.
          </p>
          <Button asChild size="sm">
            <Link href="/catalog">Browse Available Plans</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub) => {
            const isCanceling = sub.cancelAtPeriodEnd;
            const isActive = sub.status === 'ACTIVE' || sub.status === 'TRIALING';

            return (
              <Card key={sub.id} className="overflow-hidden border border-border">
                <CardHeader className="bg-muted/20 p-5 sm:p-6 border-b border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold">
                          Subscription #{sub.id.slice(0, 8)}
                        </CardTitle>
                        <SubscriptionStatusBadge
                          status={sub.status}
                          cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
                        />
                      </div>
                      <CardDescription className="text-xs">
                        Created {formatDate(sub.createdAt)}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenBillingPortal(sub.workspaceId)}
                        disabled={portalMutation.isPending}
                        className="gap-1.5 text-xs"
                      >
                        {portalMutation.isPending && portalWorkspaceId === sub.workspaceId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        Stripe Billing Portal
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-4">
                  {/* Period Bounds & Details */}
                  <div className="grid gap-4 sm:grid-cols-3 text-xs">
                    <div className="rounded-md border border-border/80 bg-muted/30 p-3">
                      <span className="text-muted-foreground block mb-0.5">Current Period</span>
                      <span className="font-semibold text-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatDate(sub.currentPeriodStart)} – {formatDate(sub.currentPeriodEnd)}
                      </span>
                    </div>

                    {sub.trialEndsAt && (
                      <div className="rounded-md border border-border/80 bg-muted/30 p-3">
                        <span className="text-muted-foreground block mb-0.5">Trial Ends</span>
                        <span className="font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1 mt-1">
                          <Clock className="h-3.5 w-3.5" />
                          {formatDate(sub.trialEndsAt)}
                        </span>
                      </div>
                    )}

                    <div className="rounded-md border border-border/80 bg-muted/30 p-3">
                      <span className="text-muted-foreground block mb-0.5">Enrolled Courses</span>
                      <span className="font-semibold text-foreground block mt-1">
                        {sub.courses.length} {sub.courses.length === 1 ? 'course included' : 'courses included'}
                      </span>
                    </div>
                  </div>

                  {/* Cancellation Alert / Notice */}
                  {isCanceling && (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                      <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <span className="font-semibold">Cancellation scheduled</span>
                        <p className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">
                          Your subscription is set to end on {formatDate(sub.currentPeriodEnd)}.
                          You retain full learning access until this date.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleResume(sub.id)}
                        disabled={resumeMutation.isPending}
                        className="text-xs shrink-0 border-amber-500/40 bg-background"
                      >
                        {resumeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <RotateCcw className="h-3 w-3 mr-1" />
                        )}
                        Resume Subscription
                      </Button>
                    </div>
                  )}

                  {/* Actions */}
                  {isActive && !isCanceling && (
                    <div className="flex justify-end pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelingSub(sub)}
                        className="text-xs text-muted-foreground hover:text-rose-600"
                      >
                        <Ban className="h-3.5 w-3.5 mr-1.5" />
                        Cancel at Period End
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancel Subscription Confirmation Dialog */}
      <Dialog open={Boolean(cancelingSub)} onOpenChange={() => setCancelingSub(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Your subscription will remain active until the end of your billing cycle on{' '}
              <span className="font-semibold text-foreground">
                {formatDate(cancelingSub?.currentPeriodEnd)}
              </span>
              . You will not be billed again, and you can resume anytime before this date.
            </DialogDescription>
          </DialogHeader>

          {cancelMutation.isError && (
            <p className="text-xs text-rose-600 font-medium">
              {cancelMutation.error?.message || 'Failed to schedule cancellation.'}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelingSub(null)}
              disabled={cancelMutation.isPending}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
