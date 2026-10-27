'use client';

import * as React from 'react';
import { Tag, Check, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface CouponInputProps {
  value: string;
  appliedCode: string | null;
  discountAmountMinor?: number;
  isLoading?: boolean;
  error?: string | null;
  onChange: (val: string) => void;
  onApply: (code: string) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function CouponInput({
  value,
  appliedCode,
  discountAmountMinor,
  isLoading = false,
  error = null,
  onChange,
  onApply,
  onRemove,
  disabled = false,
}: CouponInputProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim().toUpperCase();
    if (trimmed) {
      onApply(trimmed);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <label
          htmlFor="coupon-code"
          className="font-medium text-foreground flex items-center gap-1.5"
        >
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          Discount Code
        </label>
        {appliedCode && (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <Check className="h-3 w-3" />
            Applied: {appliedCode}
          </span>
        )}
      </div>

      {appliedCode ? (
        <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
              {appliedCode}
            </span>
            {discountAmountMinor !== undefined && discountAmountMinor > 0 && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                (-${(discountAmountMinor / 100).toFixed(2)})
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            disabled={disabled || isLoading}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            aria-label="Remove coupon"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Remove
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            id="coupon-code"
            type="text"
            placeholder="e.g. SAVE20"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            disabled={disabled || isLoading}
            className="font-mono uppercase text-sm"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={disabled || isLoading || !value.trim()}
            className="shrink-0"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
          </Button>
        </form>
      )}

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400 font-medium" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
