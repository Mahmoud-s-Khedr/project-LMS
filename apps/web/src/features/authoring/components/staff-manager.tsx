'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, UserPlus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  useCourseStaffQuery,
  useUpsertCourseStaffMutation,
  useRemoveCourseStaffMutation,
  useCoursePermissions,
} from '../hooks';
import type { StaffRole } from '../types';

interface StaffManagerProps {
  workspaceId: string;
  courseId: string;
}

export function StaffManager({ workspaceId, courseId }: StaffManagerProps) {
  const { data: staffList, isLoading, error } = useCourseStaffQuery(workspaceId, courseId);
  const permissions = useCoursePermissions(workspaceId, courseId);

  const upsertMutation = useUpsertCourseStaffMutation(workspaceId, courseId);
  const removeMutation = useRemoveCourseStaffMutation(workspaceId, courseId);

  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [role, setRole] = React.useState<StaffRole>('TEACHING_ASSISTANT');
  const [canEditContent, setCanEditContent] = React.useState(false);
  const [canGrade, setCanGrade] = React.useState(true);
  const [canManageLearners, setCanManageLearners] = React.useState(false);
  const [dialogError, setDialogError] = React.useState<string | null>(null);

  const handleOpenAssign = () => {
    setSelectedUserId('');
    setRole('TEACHING_ASSISTANT');
    setCanEditContent(false);
    setCanGrade(true);
    setCanManageLearners(false);
    setDialogError(null);
    setIsDialogOpen(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogError(null);

    if (!selectedUserId.trim()) {
      setDialogError('User ID is required');
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        userId: selectedUserId.trim(),
        data: {
          role,
          canEditContent,
          canGrade,
          canManageLearners,
        },
      });
      setIsDialogOpen(false);
    } catch (err: unknown) {
      setDialogError(err instanceof Error ? err.message : 'Failed to assign staff member');
    }
  };

  const handleRemove = async (userId: string) => {
    if (confirm('Are you sure you want to remove this staff assignment?')) {
      await removeMutation.mutateAsync(userId);
    }
  };

  return (
    <div className="space-y-6">
      {/* TA capability warning banner */}
      {permissions.isTeachingAssistant && !permissions.canEditContent && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Teaching Assistant Access (Read-Only Content)</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
              Your staff assignment does not have <code className="font-mono">canEditContent</code>{' '}
              enabled. You can view the curriculum, but editing sections and lessons is disabled.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Course Staff & Permissions</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Assign instructors and teaching assistants with granular access capabilities.
          </p>
        </div>

        {permissions.canEditContent && (
          <Button
            onClick={handleOpenAssign}
            size="sm"
            className="flex items-center gap-1.5 self-start"
          >
            <UserPlus className="h-4 w-4" />
            Assign Staff Member
          </Button>
        )}
      </div>

      {isLoading ? (
        <div role="status" className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading staff members...</span>
        </div>
      ) : error ? (
        <div role="alert" className="p-4 rounded-md bg-destructive/10 text-destructive text-sm">
          Failed to load course staff.
        </div>
      ) : staffList && staffList.data.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User / Member ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Capabilities</TableHead>
                {permissions.canEditContent && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staffList.data.map((staff) => (
                <TableRow key={staff.id}>
                  <TableCell className="font-mono text-xs">{staff.userId}</TableCell>
                  <TableCell>
                    <Badge variant={staff.role === 'INSTRUCTOR' ? 'default' : 'secondary'}>
                      {staff.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.role === 'INSTRUCTOR' ? (
                        <Badge variant="outline" className="text-[11px] bg-muted/50">
                          Full Access
                        </Badge>
                      ) : (
                        <>
                          <Badge
                            variant={staff.canEditContent ? 'outline' : 'secondary'}
                            className={`text-[10px] ${
                              staff.canEditContent ? 'border-primary/50 text-primary' : 'opacity-60'
                            }`}
                          >
                            {staff.canEditContent ? '✓ Edit Content' : '✕ No Edit'}
                          </Badge>
                          <Badge
                            variant={staff.canGrade ? 'outline' : 'secondary'}
                            className={`text-[10px] ${
                              staff.canGrade
                                ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400'
                                : 'opacity-60'
                            }`}
                          >
                            {staff.canGrade ? '✓ Grade' : '✕ No Grade'}
                          </Badge>
                          <Badge
                            variant={staff.canManageLearners ? 'outline' : 'secondary'}
                            className={`text-[10px] ${
                              staff.canManageLearners
                                ? 'border-blue-500/50 text-blue-600 dark:text-blue-400'
                                : 'opacity-60'
                            }`}
                          >
                            {staff.canManageLearners ? '✓ Roster' : '✕ No Roster'}
                          </Badge>
                        </>
                      )}
                    </div>
                  </TableCell>
                  {permissions.canEditContent && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRemove(staff.userId)}
                        className="text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                        title="Remove staff assignment"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Remove</span>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h4 className="mt-2 text-sm font-semibold">No Staff Assigned</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            The course author is assigned lead instructor by default.
          </p>
        </div>
      )}

      {/* Assign staff dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveStaff}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <DialogTitle>Assign Course Staff</DialogTitle>
              </div>
              <DialogDescription className="text-left text-sm text-muted-foreground">
                Grant staff permissions to a workspace member for this course.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-4">
              {dialogError && (
                <div
                  role="alert"
                  className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive"
                >
                  {dialogError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="staff-user-id" className="text-xs font-medium">
                  User UUID
                </Label>
                <Input
                  id="staff-user-id"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  placeholder="e.g. 00000000-0000-0000-0000-000000000001"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="staff-role" className="text-xs font-medium">
                  Role
                </Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger id="staff-role">
                    <SelectValue placeholder="Select course role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INSTRUCTOR">Instructor (Lead / Co-author)</SelectItem>
                    <SelectItem value="TEACHING_ASSISTANT">Teaching Assistant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'TEACHING_ASSISTANT' && (
                <div className="space-y-3 rounded-md bg-muted/40 p-3 border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Teaching Assistant Capability Flags
                  </p>
                  <div className="flex items-center justify-between text-xs">
                    <Label htmlFor="flag-edit" className="cursor-pointer">
                      Can Edit Curriculum Content
                    </Label>
                    <input
                      id="flag-edit"
                      type="checkbox"
                      checked={canEditContent}
                      onChange={(e) => setCanEditContent(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <Label htmlFor="flag-grade" className="cursor-pointer">
                      Can Grade Submissions
                    </Label>
                    <input
                      id="flag-grade"
                      type="checkbox"
                      checked={canGrade}
                      onChange={(e) => setCanGrade(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <Label htmlFor="flag-roster" className="cursor-pointer">
                      Can Manage Learner Roster
                    </Label>
                    <input
                      id="flag-roster"
                      type="checkbox"
                      checked={canManageLearners}
                      onChange={(e) => setCanManageLearners(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={upsertMutation.isPending}
                className="flex items-center gap-2"
              >
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Assignment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
