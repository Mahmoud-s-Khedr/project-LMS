'use client';

import React, { useState } from 'react';
import { Radio, Calendar, ExternalLink, RefreshCw, AlertCircle, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useJoinLiveSessionMutation } from '../hooks';
import { isContentUnavailableError } from './content-unavailable-view';
import type { LearnerLesson } from '../types';

interface LiveSessionPlayerProps {
  enrollmentId: string;
  lesson: LearnerLesson;
}

export function LiveSessionPlayer({ enrollmentId, lesson }: LiveSessionPlayerProps) {
  const sessionId =
    lesson.payload.type === 'LIVE_SESSION' ? lesson.payload.body.qualifyingSessionId : null;

  const joinMutation = useJoinLiveSessionMutation(enrollmentId);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!sessionId) return;
    setJoinError(null);
    try {
      const cap = await joinMutation.mutateAsync(sessionId);
      setJoinUrl(cap.url);
      window.open(cap.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      if (isContentUnavailableError(err)) {
        setJoinError(
          'Live session join is temporarily unavailable while the learning access policy is being initialized.',
        );
      } else {
        setJoinError(err instanceof Error ? err.message : 'Failed to join live session');
      }
    }
  };

  return (
    <div
      className="flex flex-col gap-6 rounded-xl border bg-card p-6 shadow-xs"
      data-testid="live-session-container"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <Radio className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{lesson.title}</h3>
              <Badge variant="outline" className="text-red-600 border-red-200">
                Live Session
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Live broadcast & interactive workshop
            </p>
          </div>
        </div>

        {sessionId ? (
          <Button
            size="default"
            onClick={handleJoin}
            disabled={joinMutation.isPending}
            className="gap-2 bg-red-600 hover:bg-red-700 text-white font-medium"
            data-testid="join-live-session-button"
          >
            {joinMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Securing Join Link...</span>
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                <span>Join Live Session</span>
              </>
            )}
          </Button>
        ) : (
          <Badge variant="secondary" className="text-xs">
            No Session Scheduled
          </Badge>
        )}
      </div>

      {joinError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{joinError}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Attendance & Credit</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Attendance is automatically recorded during live participation. Keep your session tab
            open to ensure your duration is credited toward course completion.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span>Session Recording</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            If you are unable to attend live or need to review material, recorded replays are
            published here after the session concludes.
          </p>
        </div>
      </div>

      {joinMutation.isError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to join session</p>
            <p className="text-muted-foreground mt-0.5">
              {joinMutation.error.message ||
                'The session link could not be generated. Please check your network or contact course staff.'}
            </p>
          </div>
        </div>
      )}

      {joinUrl && (
        <p className="text-xs text-muted-foreground text-center">
          Pop-up blocked?{' '}
          <a
            href={joinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            Click here to open the session room directly.
          </a>
        </p>
      )}
    </div>
  );
}
