'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RichTextEditor } from './rich-text-editor';
import { AssetUploader } from './asset-uploader';
import { Loader2, Sparkles, Image as ImageIcon } from 'lucide-react';
import type {
  Course,
  CourseCreate,
  CourseUpdate,
  RichText,
  DeliveryMode,
  Visibility,
} from '../types';

export function slugifyCourseTitle(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CourseFormProps {
  workspaceId: string;
  initialData?: Partial<Course>;
  onSubmit: (data: CourseCreate | CourseUpdate) => Promise<void>;
  isSubmitting?: boolean;
  submitLabel?: string;
  isCreate?: boolean;
}

export function CourseForm({
  workspaceId,
  initialData,
  onSubmit,
  isSubmitting = false,
  submitLabel = 'Save Course',
  isCreate = false,
}: CourseFormProps) {
  const [title, setTitle] = React.useState(initialData?.title ?? '');
  const [slug, setSlug] = React.useState(initialData?.slug ?? '');
  const [summary, setSummary] = React.useState(initialData?.summary ?? '');
  const [description, setDescription] = React.useState<RichText | null>(
    (initialData?.description as RichText) ?? null,
  );
  const [visibility, setVisibility] = React.useState<'PUBLIC' | 'UNLISTED' | 'PRIVATE'>(
    initialData?.visibility ?? 'PUBLIC',
  );
  const [deliveryMode, setDeliveryMode] = React.useState<'SELF_PACED' | 'COHORT'>(
    initialData?.deliveryMode ?? 'SELF_PACED',
  );
  const [language, setLanguage] = React.useState(initialData?.language ?? 'en');
  const [level, setLevel] = React.useState<string>(initialData?.level ?? 'BEGINNER');
  const [isFree, setIsFree] = React.useState(initialData?.isFree ?? false);
  const [estimatedMinutes, setEstimatedMinutes] = React.useState(
    initialData?.estimatedMinutes ?? 120,
  );
  const [coverId, setCoverId] = React.useState<string | null>(initialData?.coverId ?? null);

  const [formError, setFormError] = React.useState<string | null>(null);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (isCreate && (!slug || slug === slugifyCourseTitle(title))) {
      setSlug(slugifyCourseTitle(newTitle));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Course title is required');
      return;
    }

    if (!slug.trim()) {
      setFormError('Course URL slug is required');
      return;
    }

    const basePayload = {
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim(),
      description: description ?? {
        type: 'doc' as const,
        content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: '' }] }],
      },
      visibility,
      deliveryMode,
      language: language.trim() || 'en',
      level: level.trim() || null,
      isFree,
      estimatedMinutes: Number(estimatedMinutes) || 0,
      coverId: coverId || null,
    };

    const payload =
      !isCreate && initialData?.version !== undefined
        ? { ...basePayload, version: initialData.version }
        : basePayload;

    try {
      await onSubmit(payload as CourseCreate | CourseUpdate);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save course');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive"
        >
          {formError}
        </div>
      )}

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
          Course Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="course-title" className="text-xs font-medium">
              Course Title
            </Label>
            <Input
              id="course-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Complete Rust Engineering & Systems"
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="course-slug" className="text-xs font-medium">
                URL Slug
              </Label>
              <button
                type="button"
                onClick={() => setSlug(slugifyCourseTitle(title))}
                className="text-[11px] text-primary hover:underline flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" />
                Generate from Title
              </button>
            </div>
            <Input
              id="course-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="complete-rust-engineering"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="course-summary" className="text-xs font-medium">
            Summary (Short Pitch)
          </Label>
          <Textarea
            id="course-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="A concise, engaging summary displayed in search cards and catalog teasers..."
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Detailed Syllabus & Course Overview</Label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Provide a comprehensive syllabus overview, prerequisites, target audience, and expected outcomes..."
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider">
          Delivery Format & Visibility
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="delivery-mode" className="text-xs font-medium">
              Delivery Format
            </Label>
            <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as DeliveryMode)}>
              <SelectTrigger id="delivery-mode">
                <SelectValue placeholder="Select delivery" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SELF_PACED">Self-Paced (Immediate on-demand)</SelectItem>
                <SelectItem value="COHORT">Cohort-Based (Scheduled batches)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-visibility" className="text-xs font-medium">
              Catalog Visibility
            </Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as Visibility)}>
              <SelectTrigger id="course-visibility">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Public (Listed in Catalog)</SelectItem>
                <SelectItem value="UNLISTED">Unlisted (Direct Link Only)</SelectItem>
                <SelectItem value="PRIVATE">Private (Workspace Only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-level" className="text-xs font-medium">
              Experience Level
            </Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger id="course-level">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEGINNER">Beginner</SelectItem>
                <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                <SelectItem value="ADVANCED">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="course-language" className="text-xs font-medium">
              Language
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="course-language">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English (en)</SelectItem>
                <SelectItem value="es">Spanish (es)</SelectItem>
                <SelectItem value="fr">French (fr)</SelectItem>
                <SelectItem value="de">German (de)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="est-minutes" className="text-xs font-medium">
              Total Duration (Minutes)
            </Label>
            <Input
              id="est-minutes"
              type="number"
              min="0"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
            />
          </div>

          <div className="flex flex-col justify-end space-y-1">
            <div className="flex items-center gap-2">
              <input
                id="course-is-free"
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="course-is-free" className="text-xs font-medium cursor-pointer">
                Free Enrollment Course
              </Label>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Free courses allow enrollment without credit checkout.
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-3">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Course Cover Artwork
        </h3>
        <p className="text-xs text-muted-foreground">
          Thumbnail image displayed on the public catalog and studio dashboard cards (JPG, PNG,
          WebP).
        </p>

        {coverId && (
          <div className="flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400">
            <span>Cover image selected: {coverId}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCoverId(null)}
              className="h-6 text-xs text-destructive"
            >
              Remove
            </Button>
          </div>
        )}

        <AssetUploader
          workspaceId={workspaceId}
          parentId={initialData?.id ?? '00000000-0000-0000-0000-000000000000'}
          purpose="COURSE_COVER"
          accept="image/png,image/jpeg,image/webp"
          label="Upload course cover thumbnail"
          onAssetReady={(asset) => setCoverId(asset.id)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
