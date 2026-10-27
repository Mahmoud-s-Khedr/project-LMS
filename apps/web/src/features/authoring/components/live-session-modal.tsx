'use client';

import * as React from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Video, Loader2 } from 'lucide-react';
import type { LiveSessionCreate } from '../types';

interface LiveSessionModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: LiveSessionCreate) => Promise<void>;
  initialData?: Partial<LiveSessionCreate>;
  isSaving?: boolean;
}

export function LiveSessionModal({
  isOpen,
  onOpenChange,
  onSubmit,
  initialData,
  isSaving = false,
}: LiveSessionModalProps) {
  const [title, setTitle] = React.useState(initialData?.title ?? '');
  const [provider, setProvider] = React.useState(initialData?.provider ?? 'Zoom');
  const [joinUrl, setJoinUrl] = React.useState(initialData?.joinUrl ?? '');
  const [hostUrl, setHostUrl] = React.useState(initialData?.hostUrl ?? '');
  const [startsAt, setStartsAt] = React.useState(
    initialData?.startsAt ?? new Date(Date.now() + 3600000).toISOString().slice(0, 16),
  );
  const [endsAt, setEndsAt] = React.useState(
    initialData?.endsAt ?? new Date(Date.now() + 7200000).toISOString().slice(0, 16),
  );
  const [validationError, setValidationError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!title.trim()) {
      setValidationError('Title is required');
      return;
    }

    if (!joinUrl.trim() || !joinUrl.startsWith('https://')) {
      setValidationError('Join URL must be a valid HTTPS link');
      return;
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setValidationError('Please provide valid start and end dates');
      return;
    }

    if (startDate >= endDate) {
      setValidationError('Session start time must be before end time');
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        provider: provider.trim(),
        joinUrl: joinUrl.trim(),
        hostUrl: hostUrl?.trim() ? hostUrl.trim() : null,
        startsAt: startDate.toISOString(),
        endsAt: endDate.toISOString(),
      });
      onOpenChange(false);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : 'Failed to save live session');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              <DialogTitle>Schedule Live Session</DialogTitle>
            </div>
            <DialogDescription className="text-left text-sm text-muted-foreground">
              Configure video broadcast details and access links for learners and hosts.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 space-y-3.5">
            {validationError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive"
              >
                {validationError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="session-title" className="text-xs font-medium">
                Session Title
              </Label>
              <Input
                id="session-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekly Live Q&A and Code Review"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-provider" className="text-xs font-medium">
                Provider
              </Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger id="session-provider">
                  <SelectValue placeholder="Select video provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Zoom">Zoom Meeting / Webinar</SelectItem>
                  <SelectItem value="Google Meet">Google Meet</SelectItem>
                  <SelectItem value="Microsoft Teams">Microsoft Teams</SelectItem>
                  <SelectItem value="Custom">Custom WebRTC / RTMP</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-join-url" className="text-xs font-medium">
                Learner Join URL (HTTPS)
              </Label>
              <Input
                id="session-join-url"
                type="url"
                value={joinUrl}
                onChange={(e) => setJoinUrl(e.target.value)}
                placeholder="https://zoom.us/j/123456789"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="session-host-url" className="text-xs font-medium">
                Host / Instructor Start URL (Optional)
              </Label>
              <Input
                id="session-host-url"
                type="url"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                placeholder="https://zoom.us/s/123456789"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="session-starts-at" className="text-xs font-medium">
                  Starts At
                </Label>
                <Input
                  id="session-starts-at"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="session-ends-at" className="text-xs font-medium">
                  Ends At
                </Label>
                <Input
                  id="session-ends-at"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Session
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
