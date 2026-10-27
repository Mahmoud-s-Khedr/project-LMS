'use client';

import * as React from 'react';
import { AlertCircle, KeyRound, Loader2, Lock, Unlock, User } from 'lucide-react';
import type { StaffGrant } from '@lms/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRevokeGrantMutation, useStaffEnrollmentQuery } from '../hooks';

interface LearnerDetailDialogProps {
  workspaceId: string;
  courseId: string;
  enrollmentId: string | null;
  onClose: () => void;
  onAddGrant: (enrollmentId: string) => void;
}

export function LearnerDetailDialog({
  workspaceId,
  courseId,
  enrollmentId,
  onClose,
  onAddGrant,
}: LearnerDetailDialogProps) {
  const {
    data: enrollment,
    isLoading,
    isError,
    error,
  } = useStaffEnrollmentQuery(workspaceId, courseId, enrollmentId ?? '', {
    enabled: Boolean(enrollmentId),
  });

  // Revoke grant state
  const [grantToRevoke, setGrantToRevoke] = React.useState<StaffGrant | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [revokeError, setRevokeError] = React.useState<string | null>(null);

  const revokeMutation = useRevokeGrantMutation();

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentId || !grantToRevoke) return;
    if (revokeReason.trim().length < 3) {
      setRevokeError('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    try {
      setRevokeError(null);
      await revokeMutation.mutateAsync({
        workspaceId,
        courseId,
        enrollmentId,
        grantId: grantToRevoke.id,
        input: { reason: revokeReason.trim() },
      });
      setGrantToRevoke(null);
      setRevokeReason('');
    } catch (err: unknown) {
      setRevokeError(err instanceof Error ? err.message : 'Failed to revoke grant');
    }
  };

  return (
    <Dialog open={Boolean(enrollmentId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Learner Progress & Provenance
          </DialogTitle>
          <DialogDescription>
            Audit enrollment lifecycle, effective access policy, and entitlement sources.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-xs">Loading learner record...</span>
          </div>
        ) : isError ? (
          <div className="p-4 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              {error instanceof Error ? error.message : 'Failed to load enrollment details'}
            </span>
          </div>
        ) : enrollment ? (
          <div className="space-y-6 py-2">
            {/* Top Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 p-3 rounded-lg border text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Learner User</span>
                <span className="font-mono font-medium truncate block" title={enrollment.userId}>
                  {enrollment.userId.slice(0, 12)}...
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Enrollment Status</span>
                <Badge
                  variant={
                    enrollment.status === 'ACTIVE'
                      ? 'outline'
                      : enrollment.status === 'SUSPENDED'
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="text-[10px]"
                >
                  {enrollment.status}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Curriculum Progress</span>
                <span className="font-semibold text-foreground">
                  {enrollment.completionPercent}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block mb-0.5">Effective Access</span>
                {enrollment.access.allowed ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-600 border-emerald-300 gap-1"
                  >
                    <Unlock className="h-2.5 w-2.5" /> Allowed
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <Lock className="h-2.5 w-2.5" /> Locked ({enrollment.access.reason})
                  </Badge>
                )}
              </div>
            </div>

            {/* Timeline Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground">
              <div>Enrolled: {new Date(enrollment.enrolledAt).toLocaleDateString()}</div>
              <div>
                Started:{' '}
                {enrollment.startedAt
                  ? new Date(enrollment.startedAt).toLocaleDateString()
                  : 'Not started'}
              </div>
              <div>
                Completed:{' '}
                {enrollment.completedAt
                  ? new Date(enrollment.completedAt).toLocaleDateString()
                  : 'In progress'}
              </div>
              <div>
                Last Active:{' '}
                {enrollment.lastActivityAt
                  ? new Date(enrollment.lastActivityAt).toLocaleDateString()
                  : 'Never'}
              </div>
            </div>

            {/* Grant Provenance Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Entitlement Grants ({enrollment.grantProvenance.length})
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Independent grants establishing learner entitlement.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAddGrant(enrollment.id)}
                  className="h-7 text-xs gap-1"
                >
                  + Add Grant
                </Button>
              </div>

              <div className="rounded-md border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Starts / Expires</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason / Provenance</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollment.grantProvenance.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-6 text-xs text-muted-foreground"
                        >
                          No grant records attached.
                        </TableCell>
                      </TableRow>
                    ) : (
                      enrollment.grantProvenance.map((grant) => {
                        const isRevoked = Boolean(grant.revokedAt);
                        return (
                          <TableRow key={grant.id} className="text-xs">
                            <TableCell>
                              <Badge variant="secondary" className="text-[10px]">
                                {grant.source}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">
                              <div>{new Date(grant.startsAt).toLocaleDateString()}</div>
                              <div className="text-[10px]">
                                {grant.expiresAt
                                  ? `Exp: ${new Date(grant.expiresAt).toLocaleDateString()}`
                                  : 'No expiration'}
                              </div>
                            </TableCell>
                            <TableCell>
                              {isRevoked ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  REVOKED
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-emerald-600 border-emerald-300"
                                >
                                  ACTIVE
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[180px]">
                              {grant.reason && (
                                <div
                                  className="italic text-foreground/90 truncate"
                                  title={grant.reason}
                                >
                                  &quot;{grant.reason}&quot;
                                </div>
                              )}
                              {grant.orderItemId && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  Order item: {grant.orderItemId.slice(0, 8)}...
                                </div>
                              )}
                              {grant.subscriptionId && (
                                <div className="text-[10px] text-muted-foreground font-mono">
                                  Sub: {grant.subscriptionId.slice(0, 8)}...
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {!isRevoked && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setGrantToRevoke(grant)}
                                  className="text-destructive hover:text-destructive h-7 text-xs"
                                >
                                  Revoke
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Revoke Grant Dialog */}
      <Dialog
        open={Boolean(grantToRevoke)}
        onOpenChange={(open) => !open && setGrantToRevoke(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke Access Grant</DialogTitle>
            <DialogDescription>
              Revoke this {grantToRevoke?.source} grant. Dangerous: if no other valid grants exist,
              access to course materials will be locked.
            </DialogDescription>
          </DialogHeader>

          {revokeError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{revokeError}</span>
            </div>
          )}

          <form onSubmit={handleConfirmRevoke} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="revoke-reason" className="flex items-center justify-between">
                <span>Reason for Revocation *</span>
                <span className="text-[11px] text-muted-foreground">Required for audit trail</span>
              </Label>
              <Textarea
                id="revoke-reason"
                placeholder="E.g., Terminated per student refund or honor code review..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setGrantToRevoke(null)}
                disabled={revokeMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={revokeMutation.isPending}>
                {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Revocation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
