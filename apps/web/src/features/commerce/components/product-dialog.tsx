'use client';

import * as React from 'react';
import { Package, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Product, ProductType, ProductStatus } from '../types';
import { useCreateProductMutation, useUpdateProductMutation } from '../hooks';

interface ProductDialogProps {
  workspaceId: string;
  product?: Product | null;
  availableCourses?: Array<{ id: string; title: string }>;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ProductDialog({
  workspaceId,
  product,
  availableCourses = [],
  isOpen,
  onClose,
  onSuccess,
}: ProductDialogProps) {
  const isEditing = Boolean(product);
  const createMutation = useCreateProductMutation(workspaceId);
  const updateMutation = useUpdateProductMutation(workspaceId);

  const [type, setType] = React.useState<ProductType>(product?.type ?? 'COURSE');
  const [name, setName] = React.useState(product?.name ?? '');
  const [slug, setSlug] = React.useState(product?.slug ?? '');
  const [descriptionText, setDescriptionText] = React.useState('');
  const [accessDurationDays, setAccessDurationDays] = React.useState<string>(
    product?.accessDurationDays ? String(product?.accessDurationDays) : '',
  );
  const [status, setStatus] = React.useState<ProductStatus>(product?.status ?? 'DRAFT');
  const [selectedCourseIds, setSelectedCourseIds] = React.useState<string[]>(
    product?.courseIds ?? (availableCourses[0] ? [availableCourses[0].id] : []),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isConflict, setIsConflict] = React.useState(false);

  React.useEffect(() => {
    if (product) {
      setType(product.type);
      setName(product.name);
      setSlug(product.slug);
      setStatus(product.status);
      setAccessDurationDays(product.accessDurationDays ? String(product.accessDurationDays) : '');
      setSelectedCourseIds(product.courseIds);
    } else {
      setName('');
      setSlug('');
      setType('COURSE');
      setStatus('DRAFT');
      setAccessDurationDays('');
      setSelectedCourseIds(availableCourses[0] ? [availableCourses[0].id] : []);
    }
    setError(null);
    setIsConflict(false);
  }, [product, availableCourses, isOpen]);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isEditing && !slug) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, ''),
      );
    }
  };

  const toggleCourse = (courseId: string) => {
    if (type === 'COURSE') {
      setSelectedCourseIds([courseId]);
    } else {
      setSelectedCourseIds((prev) =>
        prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId],
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Product name is required');
      return;
    }

    if (!slug.trim()) {
      setError('Product slug is required');
      return;
    }

    if (selectedCourseIds.length === 0) {
      setError('Select at least one course for this product');
      return;
    }

    if (type === 'COURSE' && selectedCourseIds.length !== 1) {
      setError('COURSE type requires exactly one course');
      return;
    }

    const duration = accessDurationDays ? parseInt(accessDurationDays, 10) : null;
    const richDescription = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: descriptionText || name }],
        },
      ],
    };

    try {
      if (isEditing && product) {
        await updateMutation.mutateAsync({
          productId: product.id,
          input: {
            name: name.trim(),
            description: richDescription,
            status,
            accessDurationDays: duration,
          },
          etagOrUpdatedAt: product.updatedAt,
        });
      } else {
        await createMutation.mutateAsync({
          type,
          slug: slug.trim(),
          name: name.trim(),
          description: richDescription,
          accessDurationDays: duration,
          courseIds: selectedCourseIds,
        });
      }
      onSuccess();
      onClose();
    } catch (err: unknown) {
      if (
        (typeof err === 'object' && err !== null && (err as { status?: number }).status === 409) ||
        (err instanceof Error &&
          (err.message.includes('reload') ||
            err.message.includes('VERSION_CONFLICT') ||
            (err as { code?: string }).code === 'VERSION_CONFLICT'))
      ) {
        setIsConflict(true);
        setError(
          'This product was modified elsewhere. Please reload the latest data before making changes.',
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save product';
        setError(msg);
      }
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {isEditing ? 'Edit Product' : 'Create Product'}
            </DialogTitle>
            <DialogDescription>
              Configure the marketing and course enrollment package.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            {/* Type Selector (only on create) */}
            {!isEditing && (
              <div className="space-y-1.5">
                <label className="font-medium text-xs text-foreground">Product Type</label>
                <Select value={type} onValueChange={(val) => setType(val as ProductType)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COURSE">COURSE — Single Course Product</SelectItem>
                    <SelectItem value="BUNDLE">BUNDLE — Multi-Course Collection</SelectItem>
                    <SelectItem value="SUBSCRIPTION_PLAN">
                      SUBSCRIPTION_PLAN — Recurring Plan
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="product-name" className="font-medium text-xs text-foreground">
                Product Name
              </label>
              <Input
                id="product-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Distributed Systems Masterclass"
                required
                className="text-xs"
              />
            </div>

            {/* Slug */}
            {!isEditing && (
              <div className="space-y-1.5">
                <label htmlFor="product-slug" className="font-medium text-xs text-foreground">
                  Catalog URL Slug
                </label>
                <Input
                  id="product-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="e.g. distributed-systems-masterclass"
                  required
                  className="font-mono text-xs"
                />
              </div>
            )}

            {/* Status (if editing) */}
            {isEditing && (
              <div className="space-y-1.5">
                <label className="font-medium text-xs text-foreground">Publication Status</label>
                <Select value={status} onValueChange={(val) => setStatus(val as ProductStatus)}>
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active (Published)</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="product-description" className="font-medium text-xs text-foreground">
                Description / Overview
              </label>
              <Textarea
                id="product-description"
                value={descriptionText}
                onChange={(e) => setDescriptionText(e.target.value)}
                placeholder="Brief summary of what students will gain..."
                className="text-xs resize-none"
                rows={3}
              />
            </div>

            {/* Access Duration Days */}
            <div className="space-y-1.5">
              <label htmlFor="access-duration" className="font-medium text-xs text-foreground">
                Access Duration (Days) — Leave blank for lifetime access
              </label>
              <Input
                id="access-duration"
                type="number"
                min="1"
                placeholder="e.g. 365"
                value={accessDurationDays}
                onChange={(e) => setAccessDurationDays(e.target.value)}
                className="text-xs"
              />
            </div>

            {/* Course Inclusions */}
            {!isEditing && (
              <div className="space-y-2 pt-2 border-t border-border">
                <label className="font-medium text-xs text-foreground block">
                  Select Included Course(s)
                </label>
                {availableCourses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No courses found in this workspace. Create courses before selling them.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1.5 rounded-md border border-border p-2">
                    {availableCourses.map((c) => {
                      const isSelected = selectedCourseIds.includes(c.id);
                      return (
                        <div
                          key={c.id}
                          onClick={() => toggleCourse(c.id)}
                          className={`flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-muted text-muted-foreground'
                          }`}
                        >
                          <span className="truncate">{c.title}</span>
                          <input
                            type={type === 'COURSE' ? 'radio' : 'checkbox'}
                            checked={isSelected}
                            readOnly
                            className="h-3.5 w-3.5"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-400 font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {isConflict ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                Reload Data
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || isConflict}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {isEditing ? 'Save Changes' : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
