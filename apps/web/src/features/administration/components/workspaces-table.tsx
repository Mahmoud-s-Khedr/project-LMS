'use client';

import * as React from 'react';
import { AlertCircle, Building2, ChevronLeft, ChevronRight, Loader2, Search, ShieldAlert } from 'lucide-react';
import type { AdminWorkspace } from '@lms/shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminWorkspacesQuery, useUpdateAdminWorkspaceMutation } from '../hooks';

export function WorkspacesTable() {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const pageSize = 10;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = React.useMemo(() => {
    return {
      page,
      pageSize,
      search: debouncedSearch.trim() || undefined,
      status: statusFilter !== 'ALL' ? (statusFilter as 'ACTIVE' | 'SUSPENDED') : undefined,
    };
  }, [page, pageSize, debouncedSearch, statusFilter]);

  const { data, isLoading, isError, error, refetch } = useAdminWorkspacesQuery(queryParams);

  // Edit Workspace Dialog state
  const [selectedWs, setSelectedWs] = React.useState<AdminWorkspace | null>(null);
  const [targetStatus, setTargetStatus] = React.useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [reason, setReason] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const updateMutation = useUpdateAdminWorkspaceMutation();

  const handleOpenEdit = (ws: AdminWorkspace) => {
    setSelectedWs(ws);
    setTargetStatus(ws.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
    setReason('');
    setErrorMessage(null);
  };

  const handleCloseEdit = () => {
    setSelectedWs(null);
    setReason('');
    setErrorMessage(null);
  };

  const handleSaveWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWs) return;
    if (reason.trim().length < 3) {
      setErrorMessage('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    try {
      setErrorMessage(null);
      const isSuspending = targetStatus === 'SUSPENDED';
      await updateMutation.mutateAsync({
        workspaceId: selectedWs.id,
        updatedAt: selectedWs.updatedAt,
        input: {
          status: targetStatus,
          suspendedAt: isSuspending ? new Date().toISOString() : null,
          reason: reason.trim(),
        },
      });
      handleCloseEdit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update workspace status';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by workspace name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Workspace</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Timezone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24 mt-1" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="h-8 w-16 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to load platform workspaces.</p>
                    <p className="text-xs text-muted-foreground">
                      {error instanceof Error ? error.message : 'Network error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  <p className="font-medium">No workspaces found.</p>
                  <p className="text-xs">Try clearing filters or search query.</p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((ws) => (
                <TableRow key={ws.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="font-medium text-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {ws.name}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">/{ws.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {ws.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ws.timezone}</TableCell>
                  <TableCell>
                    <Badge
                      variant={ws.status === 'ACTIVE' ? 'outline' : 'destructive'}
                      className="text-xs"
                    >
                      {ws.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(ws.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(ws)}
                      className="h-8"
                    >
                      Governance
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <div>
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, data.meta.total)} of {data.meta.total} workspaces
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 p-0"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-medium">
              Page {page} of {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages || isLoading}
              onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
              className="h-8 w-8 p-0"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit Workspace Governance Dialog */}
      <Dialog open={Boolean(selectedWs)} onOpenChange={(open) => !open && handleCloseEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workspace Governance</DialogTitle>
            <DialogDescription>
              Modify tenancy status and access evaluation for {selectedWs?.name} (/{selectedWs?.slug}).
            </DialogDescription>
          </DialogHeader>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSaveWorkspace} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="ws-status">Workspace Status</Label>
              <select
                id="ws-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ACTIVE">ACTIVE (Normal operational state)</option>
                <option value="SUSPENDED">SUSPENDED (Access evaluator blocks all tenant operations)</option>
              </select>
            </div>

            {targetStatus === 'SUSPENDED' && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  All content delivery, course enrollment access, and staff actions under this workspace
                  will be halted immediately until reactivated.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ws-reason" className="flex items-center justify-between">
                <span>Reason for Administrative Action *</span>
                <span className="text-[11px] text-muted-foreground">Required for audit trail</span>
              </Label>
              <Textarea
                id="ws-reason"
                placeholder="E.g., Legal DMCA takedown notice #771 / policy violation..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleCloseEdit} disabled={updateMutation.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Status
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
