'use client';

import React, { useState, useRef } from 'react';
import { ExternalLink, Maximize, Minimize, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InteractiveLessonPlayerProps {
  embedUrl: string;
  sandbox?: string[];
  title?: string;
}

export function InteractiveLessonPlayer({
  embedUrl,
  sandbox = ['allow-scripts', 'allow-same-origin', 'allow-presentation'],
  title = 'Interactive Activity',
}: InteractiveLessonPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [key, setKey] = useState(0);

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Fullscreen failed:', err);
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const sandboxAttr = sandbox.join(' ');

  return (
    <div
      ref={containerRef}
      className="flex flex-col rounded-xl border bg-card overflow-hidden shadow-xs"
      data-testid="interactive-lesson-container"
    >
      <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/30">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">
            Sandboxed Interactive Environment
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setKey((k) => k + 1)}
            aria-label="Reload interactive embed"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            asChild
            className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <a href={embedUrl} target="_blank" rel="noopener noreferrer">
              <span>Open in new tab</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </div>

      <div className="relative h-[70vh] min-h-[500px] w-full bg-background">
        <iframe
          key={key}
          src={embedUrl}
          title={title}
          sandbox={sandboxAttr}
          allow="presentation"
          className="h-full w-full border-0"
          data-testid="interactive-iframe"
        />
      </div>
    </div>
  );
}
