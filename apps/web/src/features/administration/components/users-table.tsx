'use client';

import * as React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Search, ShieldAlert, UserCog } from 'lucide-react';
import type { SafeUser } from '@lms/shared';
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
import { useAdminUsersQuery, useUpdateAdminUserMutation } from '../hooks';
import { useMeQuery } from '@/features/auth/hooks';

export function UsersTable() {
  const { data: me } = useMeQuery();
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('ALL');
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
      platformRole: roleFilter !== 'ALL' ? (roleFilter as 'STUDENT' | 'SUPER_ADMIN') : undefined,
      status: statusFilter !== 'ALL' ? (statusFilter as 'ACTIVE' | 'SUSPENDED' | 'ANONYMIZED') : undefined,
    };
  }, [page, pageSize, debouncedSearch, roleFilter, statusFilter]);

  const { data, isLoading, isError, error, refetch } = useAdminUsersQuery(queryParams);

  // Edit User Dialog state
  const [selectedUser, setSelectedUser] = React.useState<SafeUser | null>(null);
  const [targetStatus, setTargetStatus] = React.useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [targetRole, setTargetRole] = React.useState<'STUDENT' | 'SUPER_ADMIN'>('STUDENT');
  const [reason, setReason] = React.useState('');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const updateMutation = useUpdateAdminUserMutation();

  const handleOpenEdit = (user: SafeUser) => {
    setSelectedUser(user);
    setTargetStatus(user.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
    setTargetRole(user.platformRole);
    setReason('');
    setErrorMessage(null);
  };

  const handleCloseEdit = () => {
    setSelectedUser(null);
    setReason('');
    setErrorMessage(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (reason.trim().length < 3) {
      setErrorMessage('A specific justification reason (minimum 3 characters) is required.');
      return;
    }

    // Self-lockout check
    if (me?.id === selectedUser.id && (targetStatus === 'SUSPENDED' || targetRole !== 'SUPER_ADMIN')) {
      const confirmed = window.confirm(
        'Warning: You are modifying your own platform privileges. This could lock you out of admin controls. Proceed?',
      );
      if (!confirmed) return;
    }

    try {
      setErrorMessage(null);
      await updateMutation.mutateAsync({
        userId: selectedUser.id,
        updatedAt: selectedUser.updatedAt,
        input: {
          status: targetStatus,
          platformRole: targetRole,
          reason: reason.trim(),
        },
      });
      handleCloseEdit();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update user';
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
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter by role"
          >
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
            <option value="STUDENT">STUDENT</option>
          </select>

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
            <option value="ANONYMIZED">Anonymized</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Platform Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-28 mt-1" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
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
                <TableCell colSpan={5} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to load platform users.</p>
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
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <p className="font-medium">No users found.</p>
                  <p className="text-xs">Try clearing filters or search query.</p>
                </TableCell>
              </TableRow>
            ) : (
              data?.data.map((user) => {
                const isSelf = me?.id === user.id;
                return (
                  <TableRow key={user.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {user.name}
                        {isSelf && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.platformRole === 'SUPER_ADMIN' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {user.platformRole}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === 'ACTIVE'
                            ? 'outline'
                            : user.status === 'SUSPENDED'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(user)}
                        className="h-8 gap-1"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Manage
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <div>
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, data.meta.total)} of {data.meta.total} users
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

      {/* Edit User Dialog */}
      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && handleCloseEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Platform User</DialogTitle>
            <DialogDescription>
              Update platform role and account status for {selectedUser?.name} ({selectedUser?.email}).
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

          <form onSubmit={handleSaveUser} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="target-role">Platform Role</Label>
              <select
                id="target-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as 'STUDENT' | 'SUPER_ADMIN')}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="STUDENT">STUDENT (Standard)</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN (Platform Administrator)</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-status">Account Status</Label>
              <select
                id="target-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED (Immediate session revocation)</option>
              </select>
            </div>

            {targetStatus === 'SUSPENDED' && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Suspending a user invalidates all their active authentication sessions immediately.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="audit-reason" className="flex items-center justify-between">
                <span>Reason for Administrative Change *</span>
                <span className="text-[11px] text-muted-foreground">Required for audit trail</span>
              </Label>
              <Textarea
                id="audit-reason"
                placeholder="E.g., Requested by security team due to credential leak ticket SEC-402..."
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
                Confirm Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
