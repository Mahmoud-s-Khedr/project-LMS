'use client';

import * as React from 'react';
import { AlertCircle, Loader2, Mail, MoreVertical, Search, UserCog, UserX } from 'lucide-react';
import type { WorkspaceMember, WorkspaceRole } from '@lms/shared';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useRemoveWorkspaceMemberMutation,
  useRevokeWorkspaceInvitationMutation,
  useUpdateWorkspaceMemberMutation,
  useWorkspaceInvitationsQuery,
  useWorkspaceMembersQuery,
} from '../hooks';
import { InviteMemberDialog } from './invite-member-dialog';

interface MembersTableProps {
  workspaceId: string;
}

export function MembersTable({ workspaceId }: MembersTableProps) {
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string>('ALL');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const queryParams = React.useMemo(() => {
    return {
      search: debouncedSearch.trim() || undefined,
      role: roleFilter !== 'ALL' ? (roleFilter as WorkspaceRole) : undefined,
      status:
        statusFilter !== 'ALL' ? (statusFilter as 'ACTIVE' | 'SUSPENDED' | 'LEFT') : undefined,
    };
  }, [debouncedSearch, roleFilter, statusFilter]);

  const {
    data: membersData,
    isLoading: isLoadingMembers,
    isError: isErrorMembers,
    error: membersError,
    refetch: refetchMembers,
  } = useWorkspaceMembersQuery(workspaceId, queryParams);

  const { data: invitationsData, isLoading: isLoadingInvitations } = useWorkspaceInvitationsQuery(
    workspaceId,
    { status: 'PENDING' },
  );

  // Dialogs
  const [editMember, setEditMember] = React.useState<WorkspaceMember | null>(null);
  const [targetRole, setTargetRole] = React.useState<WorkspaceRole>('INSTRUCTOR');
  const [targetStatus, setTargetStatus] = React.useState<'ACTIVE' | 'SUSPENDED'>('ACTIVE');
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const [memberToRemove, setMemberToRemove] = React.useState<WorkspaceMember | null>(null);

  const updateMemberMutation = useUpdateWorkspaceMemberMutation();
  const removeMemberMutation = useRemoveWorkspaceMemberMutation();
  const revokeInviteMutation = useRevokeWorkspaceInvitationMutation();

  const handleOpenEdit = (member: WorkspaceMember) => {
    setEditMember(member);
    setTargetRole(member.role);
    setTargetStatus(member.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE');
    setDialogError(null);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;

    try {
      setDialogError(null);
      await updateMemberMutation.mutateAsync({
        workspaceId,
        memberId: editMember.id,
        input: {
          role: targetRole,
          status: targetStatus,
        },
      });
      setEditMember(null);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to update member');
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    try {
      await removeMemberMutation.mutateAsync({
        workspaceId,
        memberId: memberToRemove.id,
      });
      setMemberToRemove(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    try {
      await revokeInviteMutation.mutateAsync({ workspaceId, invitationId });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to revoke invitation');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter members by role"
          >
            <option value="ALL">All Roles</option>
            <option value="ADMIN">ADMIN</option>
            <option value="INSTRUCTOR">INSTRUCTOR</option>
            <option value="TEACHING_ASSISTANT">TEACHING_ASSISTANT</option>
            <option value="STUDENT">STUDENT</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Filter members by status"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="LEFT">Left</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <InviteMemberDialog workspaceId={workspaceId} />
        </div>
      </div>

      {/* Members Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member User ID</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingMembers ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-44" />
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
                    <Skeleton className="h-8 w-12 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : isErrorMembers ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-destructive">
                  <div className="flex flex-col items-center gap-2">
                    <AlertCircle className="h-6 w-6" />
                    <p className="font-medium">Failed to load workspace members.</p>
                    <p className="text-xs text-muted-foreground">
                      {membersError instanceof Error ? membersError.message : 'Error'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchMembers()}
                      className="mt-2"
                    >
                      Retry
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : membersData?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  <p className="font-medium">No members found.</p>
                  <p className="text-xs">Invite staff to collaborate in this workspace.</p>
                </TableCell>
              </TableRow>
            ) : (
              membersData?.data.map((member) => (
                <TableRow key={member.id} className="hover:bg-muted/50">
                  <TableCell className="font-mono text-xs">{member.userId}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        member.role === 'ADMIN'
                          ? 'default'
                          : member.role === 'INSTRUCTOR'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-xs"
                    >
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        member.status === 'ACTIVE'
                          ? 'outline'
                          : member.status === 'SUSPENDED'
                            ? 'destructive'
                            : 'secondary'
                      }
                      className="text-xs"
                    >
                      {member.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(member.joinedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="Member options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEdit(member)}>
                          <UserCog className="mr-2 h-4 w-4" />
                          Change Role / Status
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setMemberToRemove(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <UserX className="mr-2 h-4 w-4" />
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Outstanding Invitations Section */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Pending Invitations
          </h3>
          <span className="text-xs text-muted-foreground">
            {invitationsData?.data.length ?? 0} outstanding
          </span>
        </div>

        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invited Email</TableHead>
                <TableHead>Assigned Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingInvitations ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">
                    Loading pending invites...
                  </TableCell>
                </TableRow>
              ) : invitationsData?.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                    No pending invitations.
                  </TableCell>
                </TableRow>
              ) : (
                invitationsData?.data.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium text-sm">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {inv.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevokeInvitation(inv.id)}
                        className="text-destructive hover:text-destructive h-7 text-xs"
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={Boolean(editMember)} onOpenChange={(open) => !open && setEditMember(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Member Privileges</DialogTitle>
            <DialogDescription>
              Adjust scoped workspace role or toggle membership status.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{dialogError}</span>
            </div>
          )}

          <form onSubmit={handleSaveMember} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="member-role">Workspace Role</Label>
              <select
                id="member-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as WorkspaceRole)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="INSTRUCTOR">INSTRUCTOR</option>
                <option value="TEACHING_ASSISTANT">TEACHING_ASSISTANT</option>
                <option value="STUDENT">STUDENT</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-status">Membership Status</Label>
              <select
                id="member-status"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value as 'ACTIVE' | 'SUSPENDED')}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMember(null)}
                disabled={updateMemberMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMemberMutation.isPending}>
                {updateMemberMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Workspace Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this member? Their staff access will be marked as LEFT
              and revoked immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setMemberToRemove(null)}
              disabled={removeMemberMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmRemove}
              disabled={removeMemberMutation.isPending}
            >
              {removeMemberMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Removal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
