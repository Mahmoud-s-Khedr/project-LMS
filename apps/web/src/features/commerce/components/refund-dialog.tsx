'use client';

import * as React from 'react';
import { RefreshCcw, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Order, Payment } from '../types';
import { useAdminRefundMutation } from '../hooks';
import { formatMoney, generateIdempotencyKey } from '../utils';

interface RefundDialogProps {
  order: Order;
  payment: Payment;
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (operationId: string) => void;
}

export function RefundDialog({
  order,
  payment,
  workspaceId,
  isOpen,
  onClose,
  onSuccess,
}: RefundDialogProps) {
  const refundMutation = useAdminRefundMutation(workspaceId);

  // Default to full payment amount (or remaining unrefunded)
  const maxRefundable = payment.amount;
  const [refundAmountMajor, setRefundAmountMajor] = React.useState<string>(
    (maxRefundable / 100).toFixed(2),
  );
  const [reason, setReason] = React.useState('');
  const [revokeAccess, setRevokeAccess] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Track allocation per order item
  const [itemAllocations] = React.useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const item of order.items) {
      initial[item.id] = item.totalAmount;
    }
    return initial;
  });

  const idempotencyKeyRef = React.useRef(generateIdempotencyKey('ref'));

  const parsedAmountMinor = Math.round((parseFloat(refundAmountMajor) || 0) * 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedAmountMinor <= 0) {
      setError('Refund amount must be greater than zero');
      return;
    }

    if (parsedAmountMinor > maxRefundable) {
      setError(
        `Refund amount cannot exceed payment total of ${formatMoney(maxRefundable, payment.currency)}`,
      );
      return;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for the refund');
      return;
    }

    const firstItem = order.items[0];
    if (!firstItem) {
      setError('No items available to refund');
      return;
    }

    // Build items allocation if multiple items exist or partial
    const itemsPayload =
      order.items.length === 1
        ? [
            {
              orderItemId: firstItem.id,
              amount: parsedAmountMinor,
              revokeAccess,
            },
          ]
        : order.items.map((item) => ({
            orderItemId: item.id,
            amount: itemAllocations[item.id] || item.totalAmount,
            revokeAccess,
          }));

    // Ensure allocations reconcile if provided
    const allocationsSum = itemsPayload.reduce((sum, i) => sum + i.amount, 0);
    if (allocationsSum !== parsedAmountMinor) {
      setError('Item refund allocations must equal total refund amount');
      return;
    }

    try {
      const result = await refundMutation.mutateAsync({
        paymentId: payment.id,
        input: {
          amount: parsedAmountMinor,
          reason: reason.trim(),
          revokeAccess,
          items: itemsPayload,
        },
        idempotencyKey: idempotencyKeyRef.current,
      });

      onSuccess(result.operationId);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Refund request failed';
      setError(msg);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5 text-rose-600" />
              Issue Payment Refund
            </DialogTitle>
            <DialogDescription>
              Order #{order.number} • Total payment:{' '}
              <span className="font-semibold text-foreground">
                {formatMoney(payment.amount, payment.currency)}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            {/* Amount Input */}
            <div className="space-y-1.5">
              <label htmlFor="refund-amount" className="font-medium text-xs text-foreground">
                Refund Amount ({payment.currency.toUpperCase()})
              </label>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={refundAmountMajor}
                onChange={(e) => setRefundAmountMajor(e.target.value)}
              />
            </div>

            {/* Revoke Access Checkbox */}
            <div className="flex items-center gap-2 rounded-md border border-border p-3 bg-muted/20">
              <input
                id="revoke-access"
                type="checkbox"
                checked={revokeAccess}
                onChange={(e) => setRevokeAccess(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label
                htmlFor="revoke-access"
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                Revoke student learning access upon refund completion
              </label>
            </div>

            {/* Reason Textarea */}
            <div className="space-y-1.5">
              <label htmlFor="refund-reason" className="font-medium text-xs text-foreground">
                Reason / Audit Note
              </label>
              <Textarea
                id="refund-reason"
                placeholder="Explain the reason for issuing this refund..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs resize-none"
                rows={3}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-400 font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={refundMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={refundMutation.isPending}
              className="gap-1.5"
            >
              {refundMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Confirm Refund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
