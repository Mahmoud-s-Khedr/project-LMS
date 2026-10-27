'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, CheckCircle2, DollarSign } from 'lucide-react';
import type { RevenueQuery } from '@lms/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useRevenueAnalyticsQuery } from '../hooks';

interface RevenueAnalyticsCardProps {
  workspaceId: string;
  queryParams?: RevenueQuery;
}

function formatCurrencyAmount(minor: number, currency: string): string {
  const isZeroDecimal = ['jpy', 'krw'].includes(currency.toLowerCase());
  const amount = isZeroDecimal ? minor : minor / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: isZeroDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

export function RevenueAnalyticsCard({ workspaceId, queryParams }: RevenueAnalyticsCardProps) {
  const { data, isLoading, isError, refetch } = useRevenueAnalyticsQuery(workspaceId, queryParams);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            Financial Ledger & Per-Currency Revenue
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Strict Multi-Currency Accounting
          </span>
        </CardTitle>
        <CardDescription className="text-xs">
          Authoritative gross receipts, issued refund deductions, and net settled revenue separated
          by transactional currency.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-6 text-center text-destructive text-xs">
            Failed to retrieve revenue metrics.{' '}
            <Button
              variant="link"
              size="sm"
              onClick={() => refetch()}
              className="text-xs p-0 h-auto"
            >
              Retry
            </Button>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No commerce revenue records found for this workspace.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {data.map((metric) => (
                <div
                  key={metric.currency}
                  className="rounded-lg border bg-card p-3 shadow-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {metric.currency}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Reconciled
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground block">Net Settled</span>
                    <span className="text-xl font-bold text-foreground">
                      {formatCurrencyAmount(metric.net, metric.currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t text-muted-foreground">
                    <span className="flex items-center gap-0.5 text-emerald-600">
                      <ArrowUpRight className="h-3 w-3" />
                      Paid: {formatCurrencyAmount(metric.paid, metric.currency)}
                    </span>
                    <span className="flex items-center gap-0.5 text-destructive">
                      <ArrowDownRight className="h-3 w-3" />
                      Refunds: {formatCurrencyAmount(metric.refunded, metric.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Detailed Table */}
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Gross Paid</TableHead>
                    <TableHead className="text-right">Refund Deductions</TableHead>
                    <TableHead className="text-right">Net Revenue</TableHead>
                    <TableHead className="text-right">Ledger Invariant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((m) => (
                    <TableRow key={m.currency} className="text-xs">
                      <TableCell className="font-mono font-semibold uppercase">
                        {m.currency}
                      </TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">
                        {formatCurrencyAmount(m.paid, m.currency)}
                      </TableCell>
                      <TableCell className="text-right text-destructive font-medium">
                        {formatCurrencyAmount(m.refunded, m.currency)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        {formatCurrencyAmount(m.net, m.currency)}
                      </TableCell>
                      <TableCell className="text-right text-[11px] text-muted-foreground">
                        {m.paid - m.refunded === m.net ? 'Balanced (Paid - Ref = Net)' : 'Mismatch'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
