/**
 * Format currency minor units (e.g. 2500 cents -> $25.00)
 */
export function formatMoney(amountMinor: number, currency: string = 'usd'): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency.toUpperCase()} ${major.toFixed(2)}`;
  }
}

/**
 * Format ISO date strings nicely for UI display
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Format date and time for detailed receipts / audit logs
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

/**
 * Human-readable billing interval (e.g. "per month", "per year")
 */
export function formatInterval(
  interval: 'MONTH' | 'YEAR' | null | undefined,
  intervalCount: number = 1,
): string {
  if (!interval) return 'one-time';
  const unit = interval.toLowerCase();
  if (intervalCount === 1) {
    return `/${unit}`;
  }
  return `every ${intervalCount} ${unit}s`;
}

/**
 * Generate a client-side idempotency key for transactions if not already set
 */
export function generateIdempotencyKey(prefix: string = 'comm'): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Format an entity's updatedAt or ETag string into the HTTP If-Match header format.
 * Matches backend editTag: must match regex /^"[0-9]+"$/ (quoted epoch milliseconds).
 */
export function formatCommerceEtag(etagOrUpdatedAt?: string | Date | null): string {
  if (!etagOrUpdatedAt) {
    return `"${Date.now()}"`;
  }
  if (typeof etagOrUpdatedAt === 'string' && /^"[0-9]+"$/.test(etagOrUpdatedAt)) {
    return etagOrUpdatedAt;
  }
  const time = new Date(etagOrUpdatedAt).getTime();
  return `"${isNaN(time) ? Date.now() : time}"`;
}
