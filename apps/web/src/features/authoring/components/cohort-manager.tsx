'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Calendar,
  Plus,
  Trash2,
  Clock,
  Loader2,
} from 'lucide-react';
import {
  useCourseCohortsQuery,
  useCreateCohortMutation,
  useDeleteCohortMutation,
  useUpsertCohortReleaseMutation,
  useCourseSectionsQuery,
  useCoursePermissions,
} from '../hooks';
import type { Cohort, Lesson } from '../types';

interface CohortManagerProps {
  workspaceId: string;
  courseId: string;
}

export function CohortManager({ workspaceId, courseId }: CohortManagerProps) {
  const { data: cohortsResponse, isLoading } = useCourseCohortsQuery(workspaceId, courseId);
  const { data: sections } = useCourseSectionsQuery(workspaceId, courseId);
  const permissions = useCoursePermissions(workspaceId, courseId);

  const createMutation = useCreateCohortMutation(workspaceId, courseId);
  const deleteMutation = useDeleteCohortMutation(workspaceId, courseId);
  const upsertReleaseMutation = useUpsertCohortReleaseMutation(workspaceId, courseId);

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [startsAt, setStartsAt] = React.useState('');
  const [endsAt, setEndsAt] = React.useState('');
  const [enrollmentOpensAt, setEnrollmentOpensAt] = React.useState('');
  const [enrollmentClosesAt, setEnrollmentClosesAt] = React.useState('');
  const [capacity, setCapacity] = React.useState<number | ''>(30);
  const [timezone, setTimezone] = React.useState('UTC');
  const [isPublished, setIsPublished] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  // Drip override selection
  const [selectedCohort, setSelectedCohort] = React.useState<Cohort | null>(null);
  const [overrideLessonId, setOverrideLessonId] = React.useState<string | null>(null);
  const [overrideReleaseAt, setOverrideReleaseAt] = React.useState('');
  const [overrideAvailableUntil, setOverrideAvailableUntil] = React.useState('');

  const cohorts = cohortsResponse?.data ?? [];

  const handleOpenCreate = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 7 * 86400000);
    const end = new Date(start.getTime() + 60 * 86400000);

    setName(`Cohort ${cohorts.length + 1} (${start.toLocaleString('default', { month: 'short' })} ${start.getFullYear()})`);
    setStartsAt(start.toISOString().slice(0, 16));
    setEndsAt(end.toISOString().slice(0, 16));
    setEnrollmentOpensAt(now.toISOString().slice(0, 16));
    setEnrollmentClosesAt(start.toISOString().slice(0, 16));
    setCapacity(30);
    setTimezone('UTC');
    setIsPublished(true);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleSaveCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const startMs = Date.parse(startsAt);
    const endMs = Date.parse(endsAt);
    if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) {
      setFormError('Cohort start date must be strictly before end date');
      return;
    }

    if (enrollmentOpensAt && enrollmentClosesAt) {
      const openMs = Date.parse(enrollmentOpensAt);
      const closeMs = Date.parse(enrollmentClosesAt);
      if (openMs >= closeMs) {
        setFormError('Enrollment opening date must be strictly before closing date');
        return;
      }
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        enrollmentOpensAt: enrollmentOpensAt ? new Date(enrollmentOpensAt).toISOString() : null,
        enrollmentClosesAt: enrollmentClosesAt ? new Date(enrollmentClosesAt).toISOString() : null,
        capacity: capacity === '' ? null : Number(capacity),
        timezone: timezone.trim() || 'UTC',
        isPublished,
      });
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create cohort');
    }
  };

  const handleDeleteCohort = async (cohortId: string) => {
    if (confirm('Are you sure you want to delete or archive this cohort?')) {
      await deleteMutation.mutateAsync(cohortId);
      if (selectedCohort?.id === cohortId) {
        setSelectedCohort(null);
      }
    }
  };

  const handleSaveDripOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCohort || !overrideLessonId) return;

    await upsertReleaseMutation.mutateAsync({
      cohortId: selectedCohort.id,
      lessonId: overrideLessonId,
      data: {
        releaseAt: new Date(overrideReleaseAt).toISOString(),
        availableUntil: overrideAvailableUntil ? new Date(overrideAvailableUntil).toISOString() : null,
      },
    });

    setOverrideLessonId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Cohorts & Drip Schedules</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize student cohorts with dedicated enrollment dates, capacity limits, and custom lesson release overrides.
          </p>
        </div>

        {permissions.canEditContent && (
          <Button onClick={handleOpenCreate} size="sm" className="flex items-center gap-1.5 self-start">
            <Plus className="h-4 w-4" />
            Create Cohort
          </Button>
        )}
      </div>

      {isLoading ? (
        <div role="status" className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm">Loading cohorts...</span>
        </div>
      ) : cohorts.length > 0 ? (
        <div className="space-y-6">
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cohort Name</TableHead>
                  <TableHead>Schedule Window</TableHead>
                  <TableHead>Enrollment Window</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohorts.map((cohort) => {
                  const isSelected = selectedCohort?.id === cohort.id;
                  return (
                    <TableRow
                      key={cohort.id}
                      className={isSelected ? 'bg-muted/50' : undefined}
                    >
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCohort(isSelected ? null : cohort)}
                            className="p-0 h-auto font-medium hover:underline text-left text-sm"
                          >
                            {cohort.name}
                          </Button>
                        </div>
                        <span className="text-[11px] text-muted-foreground">{cohort.timezone}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(cohort.startsAt).toLocaleDateString()} –{' '}
                        {cohort.endsAt ? new Date(cohort.endsAt).toLocaleDateString() : 'Ongoing'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {cohort.enrollmentOpensAt
                          ? `${new Date(cohort.enrollmentOpensAt).toLocaleDateString()} – ${new Date(
                              cohort.enrollmentClosesAt ?? '',
                            ).toLocaleDateString()}`
                          : 'Open until start'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {cohort.capacity ? `${cohort.capacity} seats` : 'Unlimited'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cohort.isPublished ? 'default' : 'secondary'} className="text-[10px]">
                          {cohort.isPublished ? 'PUBLISHED' : 'DRAFT'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCohort(isSelected ? null : cohort)}
                            className="text-xs h-8"
                          >
                            Drip Overrides
                          </Button>
                          {permissions.canEditContent && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleDeleteCohort(cohort.id)}
                              className="text-destructive h-8 w-8 p-0"
                              title="Delete cohort"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Drip overrides panel for selected cohort */}
          {selectedCohort && (
            <div className="rounded-lg border bg-muted/20 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Drip Release Overrides: {selectedCohort.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Define cohort-specific release dates to unlock lessons on explicit calendar schedules.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCohort(null)}>
                  Hide
                </Button>
              </div>

              {sections && sections.length > 0 ? (
                <div className="space-y-4">
                  {sections.map((section) => (
                    <div key={section.id} className="rounded-md border bg-background p-3">
                      <h5 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2">
                        {section.title}
                      </h5>
                      <div className="space-y-2">
                        {((section as { lessons?: Lesson[] }).lessons ?? []).map((lesson) => (
                          <div
                            key={lesson.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded border bg-muted/10 text-xs"
                          >
                            <div>
                              <span className="font-medium text-foreground">{lesson.title}</span>
                              <span className="ml-2 text-muted-foreground text-[11px]">
                                Default: {lesson.release?.releaseType}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {permissions.canEditContent && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setOverrideLessonId(lesson.id);
                                    setOverrideReleaseAt(new Date(selectedCohort.startsAt).toISOString().slice(0, 16));
                                  }}
                                  className="h-7 text-xs"
                                >
                                  Override Release
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Add curriculum sections first to configure drip releases.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Calendar className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h4 className="mt-2 text-sm font-semibold">No Cohorts Scheduled</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first cohort to establish scheduled enrollment windows and cohort-based release schedules.
          </p>
          {permissions.canEditContent && (
            <Button onClick={handleOpenCreate} size="sm" variant="outline" className="mt-3">
              <Plus className="mr-1.5 h-4 w-4" />
              Schedule Cohort
            </Button>
          )}
        </div>
      )}

      {/* Create cohort modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveCohort}>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <DialogTitle>Create New Cohort</DialogTitle>
              </div>
              <DialogDescription className="text-left text-sm text-muted-foreground">
                Set dates, capacity limits, and publishing status for this student group.
              </DialogDescription>
            </DialogHeader>

            <div className="my-4 space-y-3.5">
              {formError && (
                <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="cohort-name" className="text-xs font-medium">Cohort Name</Label>
                <Input
                  id="cohort-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fall 2026 Batch"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cohort-start" className="text-xs font-medium">Cohort Starts</Label>
                  <Input
                    id="cohort-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cohort-end" className="text-xs font-medium">Cohort Ends</Label>
                  <Input
                    id="cohort-end"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="enrollment-open" className="text-xs font-medium">Enrollment Opens</Label>
                  <Input
                    id="enrollment-open"
                    type="datetime-local"
                    value={enrollmentOpensAt}
                    onChange={(e) => setEnrollmentOpensAt(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="enrollment-close" className="text-xs font-medium">Enrollment Closes</Label>
                  <Input
                    id="enrollment-close"
                    type="datetime-local"
                    value={enrollmentClosesAt}
                    onChange={(e) => setEnrollmentClosesAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cohort-capacity" className="text-xs font-medium">Capacity (Max Seats)</Label>
                  <Input
                    id="cohort-capacity"
                    type="number"
                    min="1"
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value ? Number(e.target.value) : '')}
                    placeholder="Leave blank for unlimited"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cohort-timezone" className="text-xs font-medium">Timezone</Label>
                  <Input
                    id="cohort-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="UTC or America/New_York"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="cohort-published"
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="cohort-published" className="text-xs font-medium cursor-pointer">
                  Publish to Catalog (Learners can enroll)
                </Label>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending} className="flex items-center gap-2">
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Cohort
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Drip override modal */}
      {overrideLessonId && (
        <Dialog open={Boolean(overrideLessonId)} onOpenChange={() => setOverrideLessonId(null)}>
          <DialogContent className="sm:max-w-md">
            <form onSubmit={handleSaveDripOverride}>
              <DialogHeader>
                <DialogTitle>Set Cohort Drip Release</DialogTitle>
                <DialogDescription>
                  Specify when this lesson unlocks for learners in {selectedCohort?.name}.
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="override-release-at" className="text-xs font-medium">Release At (UTC)</Label>
                  <Input
                    id="override-release-at"
                    type="datetime-local"
                    value={overrideReleaseAt}
                    onChange={(e) => setOverrideReleaseAt(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="override-available-until" className="text-xs font-medium">Available Until (Optional)</Label>
                  <Input
                    id="override-available-until"
                    type="datetime-local"
                    value={overrideAvailableUntil}
                    onChange={(e) => setOverrideAvailableUntil(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOverrideLessonId(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Override</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
