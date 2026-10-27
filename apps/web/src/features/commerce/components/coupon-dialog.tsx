'use client';

import * as React from 'react';
import { Tag, Loader2, AlertCircle } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Coupon, CouponCreate } from '../types';
import { useCreateCouponMutation, useUpdateCouponMutation } from '../hooks';

interface CouponDialogProps {
  workspaceId: string;
  coupon?: Coupon | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CouponDialog({
  workspaceId,
  coupon,
  isOpen,
  onClose,
  onSuccess,
}: CouponDialogProps) {
  const isEditing = Boolean(coupon);
  const createMutation = useCreateCouponMutation(workspaceId);
  const updateMutation = useUpdateCouponMutation(workspaceId);

  const [code, setCode] = React.useState(coupon?.rules.code ?? '');
  const [kind, setKind] = React.useState<'PERCENT' | 'FIXED'>(coupon?.rules.kind ?? 'PERCENT');
  const [percentOff, setPercentOff] = React.useState(
    coupon?.rules.kind === 'PERCENT' ? String(coupon.rules.percentOff) : '15.00',
  );
  const [amountOffMajor, setAmountOffMajor] = React.useState(
    coupon?.rules.kind === 'FIXED' ? (coupon.rules.amountOff / 100).toFixed(2) : '10.00',
  );
  const [currency, setCurrency] = React.useState(
    coupon?.rules.kind === 'FIXED' ? coupon.rules.currency : 'usd',
  );
  const [validFrom, setValidFrom] = React.useState(
    coupon?.rules.validFrom
      ? new Date(coupon.rules.validFrom).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  );
  const [validUntil, setValidUntil] = React.useState(
    coupon?.rules.validUntil ? new Date(coupon.rules.validUntil).toISOString().split('T')[0] : '',
  );
  const [maxRedemptions, setMaxRedemptions] = React.useState(
    coupon?.rules.maxRedemptions ? String(coupon.rules.maxRedemptions) : '',
  );
  const [maxPerUser, setMaxPerUser] = React.useState(
    coupon?.rules.maxPerUser ? String(coupon.rules.maxPerUser) : '1',
  );
  const [minimumOrderAmountMajor, setMinimumOrderAmountMajor] = React.useState(
    coupon?.rules.minimumOrderAmount ? (coupon.rules.minimumOrderAmount / 100).toFixed(2) : '0.00',
  );
  const [isActive, setIsActive] = React.useState(coupon?.rules.isActive ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [isConflict, setIsConflict] = React.useState(false);

  React.useEffect(() => {
    if (coupon) {
      setCode(coupon.rules.code);
      setKind(coupon.rules.kind);
      if (coupon.rules.kind === 'PERCENT') {
        setPercentOff(String(coupon.rules.percentOff));
      } else {
        setAmountOffMajor((coupon.rules.amountOff / 100).toFixed(2));
        setCurrency(coupon.rules.currency);
      }
      setValidFrom(new Date(coupon.rules.validFrom).toISOString().split('T')[0]);
      setValidUntil(
        coupon.rules.validUntil
          ? new Date(coupon.rules.validUntil).toISOString().split('T')[0]
          : '',
      );
      setMaxRedemptions(coupon.rules.maxRedemptions ? String(coupon.rules.maxRedemptions) : '');
      setMaxPerUser(String(coupon.rules.maxPerUser));
      setMinimumOrderAmountMajor((coupon.rules.minimumOrderAmount / 100).toFixed(2));
      setIsActive(coupon.rules.isActive);
    } else {
      setCode('');
      setKind('PERCENT');
      setPercentOff('15.00');
      setAmountOffMajor('10.00');
      setCurrency('usd');
      setValidFrom(new Date().toISOString().split('T')[0]);
      setValidUntil('');
      setMaxRedemptions('');
      setMaxPerUser('1');
      setMinimumOrderAmountMajor('0.00');
      setIsActive(true);
    }
    setError(null);
    setIsConflict(false);
  }, [coupon, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fromDate = new Date(`${validFrom}T00:00:00.000Z`).toISOString();
    const untilDate = validUntil ? new Date(`${validUntil}T23:59:59.000Z`).toISOString() : null;

    if (untilDate && Date.parse(fromDate) >= Date.parse(untilDate)) {
      setError('Expiration date must be after start date');
      return;
    }

    const minAmountMinor = Math.round((parseFloat(minimumOrderAmountMajor) || 0) * 100);
    const parsedMaxRedemptions = maxRedemptions ? parseInt(maxRedemptions, 10) : null;
    const parsedMaxPerUser = Math.max(1, parseInt(maxPerUser, 10) || 1);

    try {
      if (isEditing && coupon) {
        await updateMutation.mutateAsync({
          couponId: coupon.id,
          input: {
            validFrom: fromDate,
            validUntil: untilDate,
            maxRedemptions: parsedMaxRedemptions,
            maxPerUser: parsedMaxPerUser,
            isActive,
          },
          etagOrUpdatedAt: coupon.updatedAt,
        });
      } else {
        let createPayload: CouponCreate;
        if (kind === 'PERCENT') {
          const numPercent = parseFloat(percentOff);
          if (isNaN(numPercent) || numPercent <= 0 || numPercent > 100) {
            setError('Percent off must be between 0.01 and 100');
            return;
          }
          createPayload = {
            kind: 'PERCENT',
            code: code.trim().toUpperCase(),
            percentOff: numPercent.toFixed(2),
            validFrom: fromDate,
            validUntil: untilDate,
            maxRedemptions: parsedMaxRedemptions,
            maxPerUser: parsedMaxPerUser,
            minimumOrderAmount: minAmountMinor,
            isActive,
          };
        } else {
          const numAmount = Math.round((parseFloat(amountOffMajor) || 0) * 100);
          if (numAmount <= 0) {
            setError('Fixed amount off must be positive');
            return;
          }
          createPayload = {
            kind: 'FIXED',
            code: code.trim().toUpperCase(),
            amountOff: numAmount,
            currency: currency.toLowerCase(),
            validFrom: fromDate,
            validUntil: untilDate,
            maxRedemptions: parsedMaxRedemptions,
            maxPerUser: parsedMaxPerUser,
            minimumOrderAmount: minAmountMinor,
            isActive,
          };
        }

        await createMutation.mutateAsync(createPayload);
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (
        (typeof err === 'object' && err !== null && (err as { status?: number }).status === 409) ||
        (err instanceof Error &&
          (err.message.includes('reload') ||
            err.message.includes('VERSION_CONFLICT') ||
            (err as { code?: string }).code === 'VERSION_CONFLICT'))
      ) {
        setIsConflict(true);
        setError(
          'This coupon was modified elsewhere. Please reload the latest data before making changes.',
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save coupon';
        setError(msg);
      }
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              {isEditing ? 'Edit Coupon' : 'Create Promotion Coupon'}
            </DialogTitle>
            <DialogDescription>Configure discount rules and redemption limits.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            {/* Coupon Code */}
            <div className="space-y-1.5">
              <label htmlFor="coupon-code-input" className="font-medium text-xs text-foreground">
                Coupon Code
              </label>
              <Input
                id="coupon-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. LAUNCH50"
                disabled={isEditing}
                required
                className="font-mono uppercase text-xs"
              />
            </div>

            {/* Kind Selector (create only) */}
            {!isEditing && (
              <div className="space-y-1.5">
                <label className="font-medium text-xs text-foreground">Discount Type</label>
                <Select value={kind} onValueChange={(val) => setKind(val as 'PERCENT' | 'FIXED')}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percentage Discount (%)</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Discount Value */}
            {kind === 'PERCENT' ? (
              <div className="space-y-1.5">
                <label htmlFor="percent-off" className="font-medium text-xs text-foreground">
                  Percentage Off (%)
                </label>
                <Input
                  id="percent-off"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={percentOff}
                  onChange={(e) => setPercentOff(e.target.value)}
                  disabled={isEditing}
                  required
                  className="text-xs"
                />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <label className="font-medium text-xs text-foreground">Currency</label>
                  <Input value={currency.toUpperCase()} disabled className="text-xs" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label htmlFor="fixed-off" className="font-medium text-xs text-foreground">
                    Amount Off
                  </label>
                  <Input
                    id="fixed-off"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountOffMajor}
                    onChange={(e) => setAmountOffMajor(e.target.value)}
                    disabled={isEditing}
                    required
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* Validity Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="valid-from" className="font-medium text-xs text-foreground">
                  Start Date
                </label>
                <Input
                  id="valid-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="valid-until" className="font-medium text-xs text-foreground">
                  Expires (Optional)
                </label>
                <Input
                  id="valid-until"
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Limits */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="max-redemptions" className="font-medium text-xs text-foreground">
                  Total Uses Limit
                </label>
                <Input
                  id="max-redemptions"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="max-per-user" className="font-medium text-xs text-foreground">
                  Max Uses Per Student
                </label>
                <Input
                  id="max-per-user"
                  type="number"
                  min="1"
                  value={maxPerUser}
                  onChange={(e) => setMaxPerUser(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                id="coupon-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label
                htmlFor="coupon-active"
                className="text-xs font-medium text-foreground cursor-pointer"
              >
                Coupon is active and available for redemption
              </label>
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
            {isConflict ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                Reload Data
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isConflict}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {isEditing ? 'Save Changes' : 'Create Coupon'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
