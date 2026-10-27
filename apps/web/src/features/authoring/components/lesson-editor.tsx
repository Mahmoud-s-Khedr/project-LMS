'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HelpCircle,
  GraduationCap,
  Radio,
  ExternalLink,
  Trash2,
  Save,
  Loader2,
  Paperclip,
} from 'lucide-react';
import { RichTextEditor } from './rich-text-editor';
import { AssetUploader } from './asset-uploader';
import { LiveSessionModal } from './live-session-modal';
import {
  useUpdateLessonMutation,
  useAttachLessonAssetMutation,
  useDetachLessonAssetMutation,
  useCoursePermissions,
} from '../hooks';
import type {
  Lesson,
  LessonType,
  CompletionRule,
  LessonRelease,
  Asset,
  AssetPurpose,
  OptimisticConflictState,
  LessonPayload,
} from '../types';

interface LessonEditorProps {
  workspaceId: string;
  courseId: string;
  lesson: Lesson;
  onSaved?: (updated: Lesson) => void;
  onConflict?: (conflict: OptimisticConflictState) => void;
}

export function LessonEditor({
  workspaceId,
  courseId,
  lesson,
  onSaved,
  onConflict,
}: LessonEditorProps) {
  const permissions = useCoursePermissions(workspaceId, courseId);

  const updateLessonMutation = useUpdateLessonMutation(
    workspaceId,
    courseId,
    lesson.id,
    onConflict,
  );
  const attachAssetMutation = useAttachLessonAssetMutation(workspaceId, courseId, lesson.id);
  const detachAssetMutation = useDetachLessonAssetMutation(workspaceId, courseId, lesson.id);

  // Form state
  const [title, setTitle] = React.useState(lesson.title);
  const [estimatedMinutes, setEstimatedMinutes] = React.useState(lesson.estimatedMinutes);
  const [isRequired, setIsRequired] = React.useState(lesson.isRequired);
  const [isPreview, setIsPreview] = React.useState(lesson.isPreview);
  const [isPublished, setIsPublished] = React.useState(lesson.isPublished);
  const [completionRule, setCompletionRule] = React.useState<CompletionRule>(lesson.completionRule);
  const [requiredWatchPercent, setRequiredWatchPercent] = React.useState(lesson.requiredWatchPercent);

  // Release state
  const [releaseType, setReleaseType] = React.useState<
    'IMMEDIATE' | 'ABSOLUTE' | 'ENROLLMENT_OFFSET' | 'COHORT_OFFSET'
  >(lesson.release.releaseType);
  const [releaseAt, setReleaseAt] = React.useState<string>(
    lesson.release.releaseType === 'ABSOLUTE' && lesson.release.releaseAt
      ? lesson.release.releaseAt.slice(0, 16)
      : '',
  );
  const [availableUntil, setAvailableUntil] = React.useState<string>(
    lesson.release.availableUntil ? lesson.release.availableUntil.slice(0, 16) : '',
  );
  const [offsetDays, setOffsetDays] = React.useState<number>(
    lesson.release.releaseType === 'ENROLLMENT_OFFSET' || lesson.release.releaseType === 'COHORT_OFFSET'
      ? lesson.release.releaseOffsetDays
      : 0,
  );

  // Payload state
  const [lessonType, setLessonType] = React.useState<LessonType>(lesson.payload.type);
  const [videoDuration, setVideoDuration] = React.useState<number>(
    lesson.payload.type === 'VIDEO' ? lesson.payload.body.durationSeconds ?? 0 : 0,
  );
  const [richTextBody, setRichTextBody] = React.useState(
    lesson.payload.type === 'TEXT' ? lesson.payload.body : undefined,
  );
  const [embedUrl, setEmbedUrl] = React.useState<string>(
    lesson.payload.type === 'INTERACTIVE' ? lesson.payload.body.embedUrl : '',
  );
  const [sandboxOptions, setSandboxOptions] = React.useState<('allow-scripts' | 'allow-same-origin' | 'allow-presentation')[]>(
    lesson.payload.type === 'INTERACTIVE' ? lesson.payload.body.sandbox : ['allow-scripts'],
  );

  // Live session modal
  const [isLiveModalOpen, setIsLiveModalOpen] = React.useState(false);

  // Attached assets list
  const [attachedAssets, setAttachedAssets] = React.useState<
    Array<{ id: string; assetId: string; purpose: AssetPurpose; position: number }>
  >(
    (lesson as { assets?: Array<{ id: string; assetId: string; purpose: AssetPurpose; position: number }> }).assets ?? [],
  );

  const [formError, setFormError] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);

  // Enforce invariant: Protected activities cannot be previews
  const isProtectedActivity = ['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(lessonType);

  React.useEffect(() => {
    if (isProtectedActivity && isPreview) {
      setIsPreview(false);
    }
  }, [lessonType, isProtectedActivity, isPreview]);

  // Adjust completion rule when type changes
  React.useEffect(() => {
    if (lessonType === 'VIDEO' && completionRule !== 'WATCH_PERCENT') {
      // keep current or allow watch percent
    } else if (lessonType !== 'VIDEO' && completionRule === 'WATCH_PERCENT') {
      setCompletionRule('VIEW');
    } else if (!['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(lessonType) && completionRule === 'ASSESSMENT_PASS') {
      setCompletionRule('VIEW');
    } else if (lessonType !== 'LIVE_SESSION' && completionRule === 'ATTENDANCE') {
      setCompletionRule('VIEW');
    }
  }, [lessonType, completionRule]);

  const handleAssetUploaded = async (asset: Asset, purpose: AssetPurpose) => {
    try {
      const attached = await attachAssetMutation.mutateAsync({
        assetId: asset.id,
        purpose,
        position: attachedAssets.length + 1,
      });
      setAttachedAssets((prev) => [...prev, attached]);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to attach asset to lesson');
    }
  };

  const handleDetachAsset = async (assetId: string) => {
    try {
      await detachAssetMutation.mutateAsync(assetId);
      setAttachedAssets((prev) => prev.filter((a) => a.assetId !== assetId));
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to detach asset');
    }
  };

  const handleSaveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessNotice(null);

    if (!title.trim()) {
      setFormError('Lesson title cannot be empty');
      return;
    }

    if (isProtectedActivity && isPreview) {
      setFormError('Protected activities (Quiz, Assignment, Exam, Live Session) cannot be marked as previews');
      return;
    }

    // Build release
    let releasePayload: LessonRelease;
    if (releaseType === 'IMMEDIATE') {
      releasePayload = {
        releaseType: 'IMMEDIATE',
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
      };
    } else if (releaseType === 'ABSOLUTE') {
      if (!releaseAt) {
        setFormError('Absolute release date is required');
        return;
      }
      releasePayload = {
        releaseType: 'ABSOLUTE',
        releaseAt: new Date(releaseAt).toISOString(),
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
      };
    } else if (releaseType === 'ENROLLMENT_OFFSET') {
      releasePayload = {
        releaseType: 'ENROLLMENT_OFFSET',
        releaseOffsetDays: Number(offsetDays) || 0,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
      };
    } else {
      releasePayload = {
        releaseType: 'COHORT_OFFSET',
        releaseOffsetDays: Number(offsetDays) || 0,
        availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
      };
    }

    // Build payload
    let payloadObject: LessonPayload;
    if (lessonType === 'VIDEO') {
      payloadObject = {
        type: 'VIDEO',
        body: { durationSeconds: Number(videoDuration) || 0 },
      };
    } else if (lessonType === 'DOCUMENT') {
      payloadObject = {
        type: 'DOCUMENT',
        body: {},
      };
    } else if (lessonType === 'TEXT') {
      payloadObject = {
        type: 'TEXT',
        body: richTextBody ?? {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
        },
      };
    } else if (lessonType === 'INTERACTIVE') {
      if (!embedUrl || !embedUrl.startsWith('https://')) {
        setFormError('Interactive lesson requires a valid HTTPS embed URL');
        return;
      }
      payloadObject = {
        type: 'INTERACTIVE',
        body: {
          embedUrl: embedUrl.trim(),
          sandbox: sandboxOptions,
        },
      };
    } else if (lessonType === 'QUIZ') {
      payloadObject = { type: 'QUIZ', body: {} };
    } else if (lessonType === 'ASSIGNMENT') {
      payloadObject = { type: 'ASSIGNMENT', body: {} };
    } else if (lessonType === 'EXAM') {
      payloadObject = { type: 'EXAM', body: {} };
    } else {
      payloadObject = { type: 'LIVE_SESSION', body: {} };
    }

    try {
      const updated = await updateLessonMutation.mutateAsync({
        title: title.trim(),
        position: lesson.position,
        isRequired,
        isPreview: isProtectedActivity ? false : isPreview,
        isPublished,
        estimatedMinutes: Number(estimatedMinutes) || 0,
        completionRule,
        requiredWatchPercent: Number(requiredWatchPercent) || 80,
        release: releasePayload,
        payload: payloadObject,
        version: lesson.version,
      });

      setSuccessNotice('Lesson updated successfully.');
      if (onSaved) onSaved(updated);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update lesson');
    }
  };

  const isReadOnly = !permissions.canEditContent;

  return (
    <div className="space-y-6">
      {/* Read-only banner */}
      {isReadOnly && (
        <div
          role="status"
          className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
        >
          Teaching Assistant Mode (Read-Only). You do not have permission to modify lesson parameters.
        </div>
      )}

      {formError && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
          {formError}
        </div>
      )}

      {successNotice && (
        <div role="status" className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-800 dark:text-emerald-300">
          {successNotice}
        </div>
      )}

      <form onSubmit={handleSaveLesson} className="space-y-6">
        {/* Basic Header Properties */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Lesson Configuration</span>
                <Badge variant="outline" className="text-[11px] font-mono">v{lesson.version}</Badge>
              </div>
              <h3 className="text-base font-semibold">{title || 'Untitled Lesson'}</h3>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={isReadOnly || updateLessonMutation.isPending}
                className="flex items-center gap-1.5"
              >
                {updateLessonMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Lesson
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title" className="text-xs font-medium">Lesson Title</Label>
              <Input
                id="lesson-title"
                value={title}
                disabled={isReadOnly}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lesson-type" className="text-xs font-medium">Lesson Format / Type</Label>
              <Select
                value={lessonType}
                disabled={isReadOnly}
                onValueChange={(v) => setLessonType(v as LessonType)}
              >
                <SelectTrigger id="lesson-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIDEO">Video Lesson</SelectItem>
                  <SelectItem value="DOCUMENT">Document / PDF Reading</SelectItem>
                  <SelectItem value="TEXT">Text Article</SelectItem>
                  <SelectItem value="INTERACTIVE">Interactive Embed</SelectItem>
                  <SelectItem value="QUIZ">Quiz Assessment</SelectItem>
                  <SelectItem value="ASSIGNMENT">Assignment Task</SelectItem>
                  <SelectItem value="EXAM">Examination</SelectItem>
                  <SelectItem value="LIVE_SESSION">Live Video Session</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration" className="text-xs font-medium">Est. Minutes</Label>
              <Input
                id="lesson-duration"
                type="number"
                min="0"
                disabled={isReadOnly}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
              />
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="lesson-required"
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="lesson-required" className="text-xs cursor-pointer">
                  Required for Completion
                </Label>
              </div>
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="lesson-preview"
                  type="checkbox"
                  disabled={isReadOnly || isProtectedActivity}
                  checked={isPreview}
                  onChange={(e) => setIsPreview(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="lesson-preview" className="text-xs cursor-pointer">
                  Free Preview
                </Label>
              </div>
              {isProtectedActivity && (
                <span className="text-[10px] text-muted-foreground italic">
                  Protected activities cannot be previews
                </span>
              )}
            </div>

            <div className="flex flex-col justify-end space-y-1">
              <div className="flex items-center gap-2">
                <input
                  id="lesson-published"
                  type="checkbox"
                  disabled={isReadOnly}
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="lesson-published" className="text-xs cursor-pointer">
                  Published to Outline
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Completion & Drip Release Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Completion Criteria
            </h4>

            <div className="space-y-1.5">
              <Label htmlFor="completion-rule" className="text-xs font-medium">Completion Rule</Label>
              <Select
                value={completionRule}
                disabled={isReadOnly}
                onValueChange={(v) => setCompletionRule(v as CompletionRule)}
              >
                <SelectTrigger id="completion-rule">
                  <SelectValue placeholder="Select rule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW">View (Auto complete on open)</SelectItem>
                  <SelectItem value="ACKNOWLEDGE">Acknowledge (Learner manually confirms)</SelectItem>
                  <SelectItem value="WATCH_PERCENT" disabled={lessonType !== 'VIDEO'}>
                    Watch Percent (Video only)
                  </SelectItem>
                  <SelectItem
                    value="ASSESSMENT_PASS"
                    disabled={!['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(lessonType)}
                  >
                    Assessment Pass (Quiz/Assignment/Exam)
                  </SelectItem>
                  <SelectItem value="ATTENDANCE" disabled={lessonType !== 'LIVE_SESSION'}>
                    Attendance (Live Session only)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {completionRule === 'WATCH_PERCENT' && (
              <div className="space-y-1.5">
                <Label htmlFor="watch-percent" className="text-xs font-medium">
                  Required Watch Percentage (1 - 100%)
                </Label>
                <Input
                  id="watch-percent"
                  type="number"
                  min="1"
                  max="100"
                  disabled={isReadOnly}
                  value={requiredWatchPercent}
                  onChange={(e) => setRequiredWatchPercent(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
              Drip Release Schedule
            </h4>

            <div className="space-y-1.5">
              <Label htmlFor="release-type" className="text-xs font-medium">Release Type</Label>
              <Select
                value={releaseType}
                disabled={isReadOnly}
                onValueChange={(v) =>
                  setReleaseType(v as 'IMMEDIATE' | 'ABSOLUTE' | 'ENROLLMENT_OFFSET' | 'COHORT_OFFSET')
                }
              >
                <SelectTrigger id="release-type">
                  <SelectValue placeholder="Select release type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IMMEDIATE">Immediate (Available on enrollment)</SelectItem>
                  <SelectItem value="ABSOLUTE">Absolute Date & Time</SelectItem>
                  <SelectItem value="ENROLLMENT_OFFSET">Days After Enrollment</SelectItem>
                  <SelectItem value="COHORT_OFFSET">Days After Cohort Start</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {releaseType === 'ABSOLUTE' && (
              <div className="space-y-1.5">
                <Label htmlFor="release-at" className="text-xs font-medium">Unlock Date & Time</Label>
                <Input
                  id="release-at"
                  type="datetime-local"
                  disabled={isReadOnly}
                  value={releaseAt}
                  onChange={(e) => setReleaseAt(e.target.value)}
                  required
                />
              </div>
            )}

            {(releaseType === 'ENROLLMENT_OFFSET' || releaseType === 'COHORT_OFFSET') && (
              <div className="space-y-1.5">
                <Label htmlFor="offset-days" className="text-xs font-medium">Offset Days (e.g. 7 for week 2)</Label>
                <Input
                  id="offset-days"
                  type="number"
                  min="0"
                  disabled={isReadOnly}
                  value={offsetDays}
                  onChange={(e) => setOffsetDays(Number(e.target.value))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="available-until" className="text-xs font-medium">Available Until (Optional Expiry)</Label>
              <Input
                id="available-until"
                type="datetime-local"
                disabled={isReadOnly}
                value={availableUntil}
                onChange={(e) => setAvailableUntil(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Payload-Specific Content Authoring Area */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
            <span>Lesson Content & Media</span>
            <Badge variant="secondary" className="text-[10px]">{lessonType}</Badge>
          </h4>

          {lessonType === 'VIDEO' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="video-duration" className="text-xs font-medium">Duration (Seconds)</Label>
                <Input
                  id="video-duration"
                  type="number"
                  min="0"
                  disabled={isReadOnly}
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(Number(e.target.value))}
                  placeholder="e.g. 720 for 12 minutes"
                />
              </div>

              {!isReadOnly && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Upload Primary Video (MP4)</Label>
                  <AssetUploader
                    workspaceId={workspaceId}
                    parentId={lesson.id}
                    purpose="PRIMARY_VIDEO"
                    accept="video/mp4"
                    label="Upload video lesson (up to 5 GiB)"
                    onAssetReady={(asset) => void handleAssetUploaded(asset, 'PRIMARY_VIDEO')}
                  />
                </div>
              )}
            </div>
          )}

          {lessonType === 'DOCUMENT' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Attach a primary PDF document for learners to study inline or download.
              </p>
              {!isReadOnly && (
                <AssetUploader
                  workspaceId={workspaceId}
                  parentId={lesson.id}
                  purpose="PRIMARY_DOCUMENT"
                  accept="application/pdf"
                  label="Upload lesson PDF document"
                  onAssetReady={(asset) => void handleAssetUploaded(asset, 'PRIMARY_DOCUMENT')}
                />
              )}
            </div>
          )}

          {lessonType === 'TEXT' && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Sanitized Article Body</Label>
              <RichTextEditor
                value={richTextBody}
                disabled={isReadOnly}
                onChange={setRichTextBody}
                placeholder="Author instructional article content with headings, blockquotes, and code blocks..."
              />
            </div>
          )}

          {lessonType === 'INTERACTIVE' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="embed-url" className="text-xs font-medium">Embed URL (HTTPS only)</Label>
                <Input
                  id="embed-url"
                  type="url"
                  disabled={isReadOnly}
                  value={embedUrl}
                  onChange={(e) => setEmbedUrl(e.target.value)}
                  placeholder="https://codesandbox.io/embed/..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Iframe Sandbox Permissions</Label>
                <div className="flex flex-wrap gap-4 text-xs">
                  {(['allow-scripts', 'allow-same-origin', 'allow-presentation'] as const).map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={sandboxOptions.includes(opt)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSandboxOptions((prev) => [...prev, opt]);
                          } else {
                            setSandboxOptions((prev) => prev.filter((x) => x !== opt));
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Assessment Editor Links (P2-F-ASSESS Integration) */}
          {['QUIZ', 'ASSIGNMENT', 'EXAM'].includes(lessonType) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <GraduationCap className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-sm text-foreground">
                    Assessment Authoring & Question Banks
                  </p>
                  <p className="text-muted-foreground leading-relaxed">
                    Per design criteria, assessment question types, rubrics, accommodations, and manual grading queues are managed inside the dedicated Assessment Studio rather than duplicating forms here.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/instructor/assessments"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Assessment Studio
                </Link>
                <Link
                  href="/instructor/question-banks"
                  target="_blank"
                  className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  Browse Question Banks
                </Link>
              </div>
            </div>
          )}

          {lessonType === 'LIVE_SESSION' && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Schedule a live webinar or interactive session. Learners receive short-lived capability tokens to join.
              </p>
              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLiveModalOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <Radio className="h-4 w-4 text-rose-500" />
                  Schedule Video Session
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Attached Assets List */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Paperclip className="h-4 w-4" />
              Attached Lesson Assets ({attachedAssets.length})
            </h4>
          </div>

          {attachedAssets.length > 0 ? (
            <div className="space-y-2">
              {attachedAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between rounded-md border p-2.5 text-xs bg-muted/20"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {asset.purpose}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{asset.assetId}</span>
                  </div>

                  {!isReadOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDetachAsset(asset.assetId)}
                      className="text-destructive h-7 w-7 p-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="sr-only">Detach</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No assets attached to this lesson.</p>
          )}

          {!isReadOnly && (
            <div className="pt-2">
              <Label className="text-xs font-medium">Attach Supporting Resource</Label>
              <AssetUploader
                workspaceId={workspaceId}
                parentId={lesson.id}
                purpose="RESOURCE"
                label="Attach supplemental file (PDF, code, dataset)"
                onAssetReady={(asset) => void handleAssetUploaded(asset, 'RESOURCE')}
              />
            </div>
          )}
        </div>
      </form>

      {/* Live session modal */}
      <LiveSessionModal
        isOpen={isLiveModalOpen}
        onOpenChange={setIsLiveModalOpen}
        onSubmit={async (_data) => {
          // Live session scheduled
        }}
      />
    </div>
  );
}
