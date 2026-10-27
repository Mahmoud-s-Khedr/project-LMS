'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  CreditCard,
  Calendar,
  Clock,
  ArrowLeft,
  Loader2,
  AlertCircle,
  RotateCcw,
  Ban,
  BookOpen,
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
import {
  useMySubscriptionDetailQuery,
  useCancelSubscriptionMutation,
  useResumeSubscriptionMutation,
  SubscriptionStatusBadge,
  formatDate,
} from '@/features/commerce';

export default function StudentSubscriptionDetailPage() {
  const params = useParams<{ subscriptionId: string }>();
  const subscriptionId = params?.subscriptionId ?? '';

  const { data: sub, isLoading, error } = useMySubscriptionDetailQuery(subscriptionId);

  const [isCancelModalOpen, setIsCancelModalOpen] = React.useState(false);
  const cancelMutation = useCancelSubscriptionMutation();
  const resumeMutation = useResumeSubscriptionMutation();

  const handleConfirmCancel = async () => {
    if (!sub) return;
    try {
      await cancelMutation.mutateAsync({ subscriptionId: sub.id });
      setIsCancelModalOpen(false);
    } catch {
      // handled
    }
  };

  const handleResume = async () => {
    if (!sub) return;
    try {
      await resumeMutation.mutateAsync({ subscriptionId: sub.id });
    } catch {
      // handled
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-3xl py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Loading subscription details...</p>
      </div>
    );
  }

  if (error || !sub) {
    return (
      <div className="container max-w-md py-12">
        <Card className="border-rose-500/30 text-center">
          <CardHeader>
            <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
            <CardTitle className="mt-2 text-lg">Subscription Not Found</CardTitle>
            <CardDescription>
              {error?.message || 'Unable to retrieve subscription.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href="/student/subscriptions">Back to Subscriptions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCanceling = sub.cancelAtPeriodEnd;
  const isActive = sub.status === 'ACTIVE' || sub.status === 'TRIALING';

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2 text-xs">
        <Link href="/student/subscriptions">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Subscriptions
        </Link>
      </Button>

      <Card>
        <CardHeader className="p-6 border-b border-border bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">ID: {sub.id}</span>
              </div>
              <CardTitle className="text-xl font-bold">Subscription Plan</CardTitle>
              <CardDescription className="text-xs mt-1">
                Started on {formatDate(sub.createdAt)}
              </CardDescription>
            </div>
            <SubscriptionStatusBadge
              status={sub.status}
              cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
            />
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Period Details */}
          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div className="rounded-md border border-border p-3 space-y-1">
              <span className="text-muted-foreground block">Billing Cycle Period</span>
              <span className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(sub.currentPeriodStart)} – {formatDate(sub.currentPeriodEnd)}
              </span>
            </div>

            {sub.trialEndsAt && (
              <div className="rounded-md border border-border p-3 space-y-1">
                <span className="text-muted-foreground block">Free Trial Status</span>
                <span className="font-semibold text-sky-600 text-sm flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Trial ends {formatDate(sub.trialEndsAt)}
                </span>
              </div>
            )}
          </div>

          {/* Cancellation Notice */}
          {isCanceling && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">Cancellation scheduled</p>
                <p className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">
                  Your access continues through {formatDate(sub.currentPeriodEnd)}. After this date,
                  learning access will end.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleResume}
                disabled={resumeMutation.isPending}
                className="shrink-0 text-xs gap-1"
              >
                {resumeMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Resume Subscription
              </Button>
            </div>
          )}

          {/* Enrolled Courses */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Included Courses ({sub.courses.length})
            </h3>
            <div className="divide-y divide-border rounded-md border border-border text-xs">
              {sub.courses.map((c, i) => (
                <div key={i} className="p-3 flex items-center justify-between">
                  <span className="font-mono text-foreground">Course ID: {c.courseId}</span>
                  <span className="text-emerald-600 font-medium">Access Active</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {isActive && !isCanceling && (
            <div className="pt-4 border-t border-border flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCancelModalOpen(true)}
                className="text-xs text-muted-foreground hover:text-rose-600"
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                Cancel Subscription at Period End
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Your subscription will remain active until {formatDate(sub.currentPeriodEnd)}. You
              retain all course materials until then.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCancelModalOpen(false)}
              disabled={cancelMutation.isPending}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
