'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { QuestionBank } from '@lms/shared';

interface QuestionBankDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bank?: QuestionBank | null;
  onSubmit: (data: { name: string; description: string | null }) => Promise<void>;
  isSubmitting?: boolean;
}

export function QuestionBankDialog({
  open,
  onOpenChange,
  bank,
  onSubmit,
  isSubmitting = false,
}: QuestionBankDialogProps) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (bank) {
      setName(bank.name);
      setDescription(bank.description ?? '');
    } else {
      setName('');
      setDescription('');
    }
    setError(null);
  }, [bank, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bank name is required');
      return;
    }
    try {
      setError(null);
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save question bank';
      setError(msg);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bank ? 'Edit Question Bank' : 'Create Question Bank'}</DialogTitle>
          <DialogDescription>
            {bank
              ? 'Update the name and description of this question repository.'
              : 'Question banks store reusable questions organized by tags, subjects, and difficulty.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
            >
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="bank-name">Bank Name</Label>
            <Input
              id="bank-name"
              placeholder="e.g. Distributed Systems Fundamentals"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bank-desc">Description (Optional)</Label>
            <Textarea
              id="bank-desc"
              placeholder="Describe the topics, scope, or learning outcomes covered..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Saving...' : bank ? 'Save Changes' : 'Create Bank'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
