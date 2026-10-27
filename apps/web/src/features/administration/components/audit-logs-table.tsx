'use client';

import * as React from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import type { AuditLogsQuery } from '@lms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useAuditLogsQuery } from '../hooks';

interface AuditLogsTableProps {
  workspaceId: string;
}

export function AuditLogsTable({ workspaceId }: AuditLogsTableProps) {
  const [actionFilter, setActionFilter] = React.useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = React.useState('');
  const [fromDate, setFromDate] = React.useState('');
  const [toDate, setToDate] = React.useState('');

  const queryParams: Partial<AuditLogsQuery> = React.useMemo(() => {
    return {
      action: actionFilter.trim() || undefined,
      resourceType: resourceTypeFilter.trim() || undefined,
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to: toDate ? new Date(toDate).toISOString() : undefined,
    };
  }, [actionFilter, resourceTypeFilter, fromDate, toDate]);

  const { data, isLoading, isError, error, refetch } = useAuditLogsQuery(
    workspaceId,
    queryParams,
  );

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-lg border">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Filter Action
          </label>
          <Input
            placeholder="e.g. member.updated"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Resource Type
          </label>
          <Input
            placeholder="e.g. WorkspaceMember"
            value={resourceTypeFilter}
            onChange={(e) => setResourceTypeFilter(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Main Logs Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Actor / Request</TableHead>
              <TableHead>Changed Fields & Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to retrieve audit trail.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : 'Error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="font-medium">No audit events match your filters.</p>
                  <p className="text-xs">Immutable audit events will appear here as state changes occur.</p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/50">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-xs text-foreground">{log.resourceType}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]" title={log.resourceId}>
                      {log.resourceId}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground font-mono truncate max-w-[120px]" title={log.actorId ?? 'System'}>
                      {log.actorId ? `Actor: ${log.actorId.slice(0, 8)}...` : 'System'}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 font-mono truncate max-w-[120px]" title={log.requestId}>
                      req: {log.requestId.slice(0, 8)}...
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 mb-1">
                      {log.changes.fields.map((f, idx) => (
                        <span
                          key={idx}
                          className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    {log.changes.reason && (
                      <div className="text-xs text-foreground/90 italic bg-amber-500/5 px-2 py-1 rounded border border-amber-500/20">
                        &quot;{log.changes.reason}&quot;
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
