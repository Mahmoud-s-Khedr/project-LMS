'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Subtitles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssetSignedUrl, usePlaybackHeartbeat } from '../hooks';
import type { LearnerLesson } from '../types';

interface VideoLessonPlayerProps {
  enrollmentId: string;
  lesson: LearnerLesson;
  onEnded?: () => void;
}

export function VideoLessonPlayer({ enrollmentId, lesson, onEnded }: VideoLessonPlayerProps) {
  // Find primary video asset
  const videoAsset = lesson.assets.find(
    (a) => a.purpose === 'PRIMARY_VIDEO' || a.mimeType.startsWith('video/'),
  );
  // Find optional captions asset
  const captionAsset = lesson.assets.find((a) => a.purpose === 'CAPTIONS');

  const {
    url: videoUrl,
    expiresAt: videoExpiresAt,
    error: videoError,
    isLoading: isVideoLoading,
    renew: renewVideoUrl,
  } = useAssetSignedUrl(enrollmentId, lesson.lessonId, videoAsset?.assetId ?? null);

  const { url: captionUrl } = useAssetSignedUrl(
    enrollmentId,
    lesson.lessonId,
    captionAsset?.assetId ?? null,
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Send bounded PLAYBACK heartbeats every 10s while video is playing
  usePlaybackHeartbeat({
    enrollmentId,
    lessonId: lesson.lessonId,
    isPlaying,
    currentTime,
  });

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch((err) => {
        console.warn('Playback error:', err);
      });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current) {
      videoRef.current.currentTime = targetTime;
    }
    // For short-lived signed URLs (<=60s), re-request if approaching expiration
    if (videoExpiresAt) {
      const remainingMs = Date.parse(videoExpiresAt) - Date.now();
      if (remainingMs < 20_000) {
        void renewVideoUrl().then((newUrl) => {
          if (newUrl && videoRef.current) {
            videoRef.current.src = newUrl;
            videoRef.current.currentTime = targetTime;
            if (isPlaying) void videoRef.current.play();
          }
        });
      }
    }
  };

  const handleVideoError = () => {
    setMediaError('Playback stream failed');
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Fullscreen request failed:', err);
      }
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Keyboard accessibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime += 5;
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) videoRef.current.currentTime -= 5;
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        void toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, toggleMute]);

  if (!videoAsset) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">Video Not Found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          No video asset is associated with this lesson.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="group relative flex flex-col overflow-hidden rounded-xl bg-black text-white shadow-2xl"
      data-testid="video-player-container"
    >
      {/* Media error or URL expiry overlay */}
      {(mediaError || videoError) && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
          <h4 className="text-sm font-semibold">
            {typeof videoError === 'object' &&
            videoError !== null &&
            ((videoError as { status?: number }).status === 503 ||
              (videoError as { message?: string }).message?.includes('503') ||
              (videoError as { message?: string }).message?.includes('AccessPolicy'))
              ? 'Content Temporarily Unavailable'
              : 'Playback URL Expired or Interrupted'}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {typeof videoError === 'object' &&
            videoError !== null &&
            ((videoError as { status?: number }).status === 503 ||
              (videoError as { message?: string }).message?.includes('503') ||
              (videoError as { message?: string }).message?.includes('AccessPolicy'))
              ? 'Learning access evaluation is temporarily offline while services initialize. Your course progress is preserved.'
              : 'For security, video streams use expiring capabilities. Refresh your session link below.'}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setMediaError(null);
              void renewVideoUrl();
            }}
            className="mt-4 gap-2 text-xs"
            data-testid="renew-playback-button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Renew Playback Link</span>
          </Button>
        </div>
      )}

      {isVideoLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs font-medium">Securing playback stream...</span>
          </div>
        </div>
      )}

      {/* HTML5 video element */}
      <video
        ref={videoRef}
        src={videoUrl ?? undefined}
        className="w-full aspect-video object-contain cursor-pointer"
        onClick={togglePlay}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration);
            // Restore playback position if previously saved
            if (lesson.progress?.positionSeconds) {
              videoRef.current.currentTime = lesson.progress.positionSeconds;
            }
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        onError={handleVideoError}
        playsInline
        controlsList="nodownload" // Disables browser default download button
        data-testid="video-element"
      >
        {captionUrl && showCaptions && (
          <track kind="subtitles" src={captionUrl} srcLang="en" label="English" default />
        )}
      </video>

      {/* Accessible Player Controls Bar */}
      <div className="flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 transition-opacity duration-200">
        {/* Progress Seekbar */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-white/20 accent-primary"
            aria-label="Seek video position"
            data-testid="video-seek-slider"
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause video' : 'Play video'}
              data-testid="video-play-toggle"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentTime - 10);
              }}
              aria-label="Skip back 10 seconds"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>

            <div className="flex items-center gap-1.5 ml-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-white/20 accent-primary"
                aria-label="Volume slider"
              />
            </div>

            <span className="text-[11px] text-white/80 tabular-nums ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Playback speed selector */}
            <div className="flex items-center gap-1">
              {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleRateChange(rate)}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    playbackRate === rate
                      ? 'bg-primary text-primary-foreground'
                      : 'text-white/70 hover:bg-white/20'
                  }`}
                  aria-label={`Playback speed ${rate}x`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* Captions toggle */}
            {captionAsset && (
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 text-white hover:bg-white/20 ${
                  showCaptions ? 'text-primary' : 'text-white/60'
                }`}
                onClick={() => setShowCaptions(!showCaptions)}
                aria-label={showCaptions ? 'Disable captions' : 'Enable captions'}
              >
                <Subtitles className="h-4 w-4" />
              </Button>
            )}

            {/* Fullscreen toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
