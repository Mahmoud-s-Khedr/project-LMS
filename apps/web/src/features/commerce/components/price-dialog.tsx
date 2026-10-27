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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Product } from '../types';
import { useCreatePriceMutation } from '../hooks';

interface PriceDialogProps {
  workspaceId: string;
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PriceDialog({
  workspaceId,
  product,
  isOpen,
  onClose,
  onSuccess,
}: PriceDialogProps) {
  const createPriceMutation = useCreatePriceMutation(workspaceId);

  const [currency, setCurrency] = React.useState('usd');
  const [amountMajor, setAmountMajor] = React.useState('');
  const [billingType, setBillingType] = React.useState<'ONETIME' | 'MONTH' | 'YEAR'>(
    product.type === 'SUBSCRIPTION_PLAN' ? 'MONTH' : 'ONETIME',
  );
  const [intervalCount, setIntervalCount] = React.useState('1');
  const [trialDays, setTrialDays] = React.useState('0');
  const [isActive, setIsActive] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAmountMajor('');
    setBillingType(product.type === 'SUBSCRIPTION_PLAN' ? 'MONTH' : 'ONETIME');
    setIntervalCount('1');
    setTrialDays('0');
    setIsActive(true);
    setError(null);
  }, [product, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountFloat = parseFloat(amountMajor);
    if (isNaN(amountFloat) || amountFloat < 0) {
      setError('Please provide a valid non-negative price amount');
      return;
    }

    const amountMinor = Math.round(amountFloat * 100);
    const interval = billingType === 'ONETIME' ? null : billingType;
    const parsedIntervalCount = interval ? Math.max(1, parseInt(intervalCount, 10) || 1) : 1;
    const parsedTrialDays = interval ? Math.max(0, parseInt(trialDays, 10) || 0) : 0;

    try {
      await createPriceMutation.mutateAsync({
        productId: product.id,
        input: {
          currency: currency.toLowerCase(),
          amount: amountMinor,
          interval,
          intervalCount: parsedIntervalCount,
          trialDays: parsedTrialDays,
          isActive,
        },
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create price';
      setError(msg);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Add Price Tier
            </DialogTitle>
            <DialogDescription>
              Create an immutable pricing tier for{' '}
              <span className="font-semibold text-foreground">{product.name}</span>. Economic
              fields cannot be changed once transactions occur.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            {/* Currency & Amount */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="font-medium text-xs text-foreground">Currency</label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="text-xs uppercase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="usd">USD ($)</SelectItem>
                    <SelectItem value="eur">EUR (€)</SelectItem>
                    <SelectItem value="gbp">GBP (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1.5">
                <label htmlFor="price-amount" className="font-medium text-xs text-foreground">
                  Amount (0 for free)
                </label>
                <Input
                  id="price-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 49.00"
                  value={amountMajor}
                  onChange={(e) => setAmountMajor(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>
            </div>

            {/* Billing Interval */}
            <div className="space-y-1.5">
              <label className="font-medium text-xs text-foreground">Billing Schedule</label>
              <Select
                value={billingType}
                onValueChange={(val) => setBillingType(val as 'ONETIME' | 'MONTH' | 'YEAR')}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONETIME">One-Time Payment (Lifetime / Fixed Days)</SelectItem>
                  <SelectItem value="MONTH">Monthly Recurring</SelectItem>
                  <SelectItem value="YEAR">Annual Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {billingType !== 'ONETIME' && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="interval-count" className="font-medium text-xs text-foreground">
                    Repeat Every (Cycles)
                  </label>
                  <Input
                    id="interval-count"
                    type="number"
                    min="1"
                    max="36"
                    value={intervalCount}
                    onChange={(e) => setIntervalCount(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="trial-days" className="font-medium text-xs text-foreground">
                    Free Trial (Days)
                  </label>
                  <Input
                    id="trial-days"
                    type="number"
                    min="0"
                    max="730"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <input
                id="price-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="price-active" className="text-xs font-medium text-foreground cursor-pointer">
                Available for immediate purchase
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
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={createPriceMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createPriceMutation.isPending}>
              {createPriceMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              )}
              Create Price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
