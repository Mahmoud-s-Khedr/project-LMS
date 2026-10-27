import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerHeader } from './components/player-header';
import { PlayerSidebar } from './components/player-sidebar';
import { PlayerNavigation } from './components/player-navigation';
import { VideoLessonPlayer } from './components/video-lesson-player';
import { DocumentLessonViewer } from './components/document-lesson-viewer';
import { TextLessonViewer } from './components/text-lesson-viewer';
import { InteractiveLessonPlayer } from './components/interactive-lesson-player';
import { LiveSessionPlayer } from './components/live-session-player';
import { LessonResources } from './components/lesson-resources';
import { LessonLockView } from './components/lesson-lock-view';
import { ContentUnavailableView } from './components/content-unavailable-view';
import { siteConfig } from '@/features/marketing/site-config';
import { api } from '@/lib/api';
import type { LearnerOutline, LearnerLesson } from './types';

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockIds = {
  enrollment: '10000000-0000-4000-8000-000000000003',
  lesson1: '10000000-0000-4000-8000-000000000005',
  lesson2: '10000000-0000-4000-8000-000000000006',
  section: '10000000-0000-4000-8000-000000000007',
  videoAsset: '10000000-0000-4000-8000-000000000010',
  docAsset: '10000000-0000-4000-8000-000000000011',
};

const mockOutline: LearnerOutline = {
  enrollmentId: mockIds.enrollment,
  sections: [
    {
      sectionId: mockIds.section,
      title: 'Foundations of Architecture',
      position: 0,
      lessons: [
        {
          lessonId: mockIds.lesson1,
          title: 'Introduction to Services',
          type: 'VIDEO',
          position: 0,
          isRequired: true,
          completedAt: '2026-10-26T08:00:00.000Z',
          access: { allowed: true, expiresAt: null },
        },
        {
          lessonId: mockIds.lesson2,
          title: 'Advanced Concurrency',
          type: 'TEXT',
          position: 1,
          isRequired: true,
          completedAt: null,
          access: {
            allowed: false,
            reason: 'NOT_RELEASED',
            unlockAt: '2026-10-30T10:00:00.000Z',
          },
        },
      ],
    },
  ],
};

const mockVideoLesson: LearnerLesson = {
  assessmentId: null,
  lessonId: mockIds.lesson1,
  title: 'Introduction to Services',
  payload: {
    type: 'VIDEO',
    body: { durationSeconds: 600 },
  },
  assets: [
    {
      assetId: mockIds.videoAsset,
      filename: 'lecture.mp4',
      mimeType: 'video/mp4',
      purpose: 'PRIMARY_VIDEO',
    },
  ],
  progress: {
    id: '10000000-0000-4000-8000-000000000099',
    workspaceId: '10000000-0000-4000-8000-000000000001',
    enrollmentId: mockIds.enrollment,
    lessonId: mockIds.lesson1,
    positionSeconds: 120,
    watchedSeconds: 100,
    completionPercent: '20.00',
    completedAt: null,
    lastViewedAt: '2026-10-26T08:00:00.000Z',
    createdAt: '2026-10-26T08:00:00.000Z',
    updatedAt: '2026-10-26T08:00:00.000Z',
  },
};

describe('Player Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('PlayerHeader', () => {
    it('renders course title, completion percentage, and brand name', () => {
      render(
        <PlayerHeader
          enrollmentId={mockIds.enrollment}
          courseTitle="Distributed Systems Engineering"
          completionPercent="60.00"
        />,
      );

      expect(screen.getByText('Distributed Systems Engineering')).toBeInTheDocument();
      expect(screen.getByText('60% completed')).toBeInTheDocument();
      expect(screen.getByText(siteConfig.name)).toBeInTheDocument();
      expect(screen.getByTestId('back-to-dashboard-link')).toBeInTheDocument();
    });
  });

  describe('PlayerSidebar', () => {
    it('renders section title, lessons, checkmarks, and lock reasons', () => {
      render(
        <PlayerSidebar
          enrollmentId={mockIds.enrollment}
          outline={mockOutline}
          currentLessonId={mockIds.lesson1}
          isOpen={true}
        />,
      );

      expect(screen.getByText(/Section 1: Foundations of Architecture/i)).toBeInTheDocument();
      expect(screen.getByText('Introduction to Services')).toBeInTheDocument();
      expect(screen.getByText('Advanced Concurrency')).toBeInTheDocument();

      // Check locked lesson representation
      expect(screen.getByTestId(`sidebar-lesson-${mockIds.lesson2}-locked`)).toBeInTheDocument();
      expect(screen.getByText(/Unlocks/i)).toBeInTheDocument();
    });
  });

  describe('PlayerNavigation', () => {
    it('renders navigation buttons and mark complete button', () => {
      const onMarkComplete = vi.fn();

      render(
        <PlayerNavigation
          enrollmentId={mockIds.enrollment}
          prevLesson={null}
          nextLesson={mockOutline.sections[0]?.lessons[1] ?? null}
          isCompleted={false}
          onMarkComplete={onMarkComplete}
        />,
      );

      // Next lesson is locked in mockOutline, so next button should be locked/disabled
      const nextLockedBtn = screen.getByTestId('next-lesson-locked-button');
      expect(nextLockedBtn).toBeDisabled();

      const markCompleteBtn = screen.getByTestId('mark-complete-button');
      fireEvent.click(markCompleteBtn);
      expect(onMarkComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('VideoLessonPlayer & Secure Delivery', () => {
    it('requests signed capability URL and does NOT render download button for video', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          url: 'https://cdn.example.com/stream.mp4?token=signed-123',
          expiresAt: '2026-10-26T08:35:00.000Z',
        },
      });

      renderWithQueryClient(
        <VideoLessonPlayer enrollmentId={mockIds.enrollment} lesson={mockVideoLesson} />,
      );

      expect(screen.getByTestId('video-player-container')).toBeInTheDocument();
      expect(screen.getByTestId('video-element')).toBeInTheDocument();

      // STRICT SECURITY REQUIREMENT: No download button for protected video!
      expect(screen.queryByText(/Download Video/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('download-video-button')).not.toBeInTheDocument();

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson1}/assets/${mockIds.videoAsset}/download`,
          {},
        );
      });
    });

    it('handles playback stream error with renew link button', async () => {
      vi.spyOn(api, 'post').mockResolvedValue({
        data: {
          url: 'https://cdn.example.com/stream.mp4',
          expiresAt: '2026-10-26T08:35:00.000Z',
        },
      });

      renderWithQueryClient(
        <VideoLessonPlayer enrollmentId={mockIds.enrollment} lesson={mockVideoLesson} />,
      );

      const video = screen.getByTestId('video-element');
      fireEvent.error(video);

      await waitFor(() => {
        expect(screen.getByTestId('renew-playback-button')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('renew-playback-button'));
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('DocumentLessonViewer', () => {
    it('requests signed capability and renders document viewer with download option', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          url: 'https://cdn.example.com/handout.pdf?token=signed-456',
          expiresAt: '2026-10-26T08:35:00.000Z',
        },
      });

      const docLesson: LearnerLesson = {
        assessmentId: null,
        lessonId: mockIds.lesson2,
        title: 'System Handout',
        payload: { type: 'DOCUMENT', body: {} },
        assets: [
          {
            assetId: mockIds.docAsset,
            filename: 'architecture.pdf',
            mimeType: 'application/pdf',
            purpose: 'PRIMARY_DOCUMENT',
          },
        ],
        progress: null,
      };

      renderWithQueryClient(
        <DocumentLessonViewer enrollmentId={mockIds.enrollment} lesson={docLesson} />,
      );

      expect(screen.getByTestId('document-viewer-container')).toBeInTheDocument();
      expect(screen.getByText('architecture.pdf')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('download-document-button')).toBeInTheDocument();
        expect(screen.getByTestId('open-document-button')).toBeInTheDocument();
      });
    });
  });

  describe('TextLessonViewer', () => {
    it('renders rich text document AST with headings, paragraphs, and code blocks', () => {
      const richDoc = {
        type: 'doc' as const,
        content: [
          {
            type: 'heading' as const,
            content: [{ type: 'text' as const, text: 'Core Invariants' }],
          },
          {
            type: 'paragraph' as const,
            content: [
              {
                type: 'text' as const,
                text: 'Linearizability requires all operations to appear atomic.',
              },
            ],
          },
          {
            type: 'codeBlock' as const,
            content: [{ type: 'text' as const, text: 'const x = await cas(key, oldVal, newVal);' }],
          },
        ],
      };

      render(<TextLessonViewer content={richDoc} />);

      expect(screen.getByText('Core Invariants')).toBeInTheDocument();
      expect(screen.getByText(/Linearizability requires/i)).toBeInTheDocument();
      expect(screen.getByText(/const x = await cas/i)).toBeInTheDocument();
    });
  });

  describe('InteractiveLessonPlayer', () => {
    it('renders sandboxed iframe with permitted flags', () => {
      render(
        <InteractiveLessonPlayer
          embedUrl="https://interactive.example.com/lab"
          sandbox={['allow-scripts', 'allow-same-origin']}
          title="SQL Query Lab"
        />,
      );

      const iframe = screen.getByTestId('interactive-iframe') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toBe('https://interactive.example.com/lab');
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
    });
  });

  describe('LiveSessionPlayer', () => {
    it('renders live session details and initiates join action', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          url: 'https://zoom.example.com/j/123456',
          expiresAt: '2026-10-26T08:35:00.000Z',
        },
      });

      const liveLesson: LearnerLesson = {
        assessmentId: null,
        lessonId: mockIds.lesson2,
        title: 'Weekly Office Hours',
        payload: {
          type: 'LIVE_SESSION',
          body: { qualifyingSessionId: '10000000-0000-4000-8000-000000000088' },
        },
        assets: [],
        progress: null,
      };

      renderWithQueryClient(
        <LiveSessionPlayer enrollmentId={mockIds.enrollment} lesson={liveLesson} />,
      );

      expect(screen.getByText('Weekly Office Hours')).toBeInTheDocument();
      const joinBtn = screen.getByTestId('join-live-session-button');
      expect(joinBtn).toBeInTheDocument();

      fireEvent.click(joinBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/me/enrollments/${mockIds.enrollment}/live-sessions/10000000-0000-4000-8000-000000000088/join`,
          {},
        );
      });
    });
  });

  describe('LessonResources', () => {
    it('filters out PRIMARY_VIDEO and only provides downloads for non-video resources', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          url: 'https://cdn.example.com/sheet.pdf?token=123',
          expiresAt: '2026-10-26T08:35:00.000Z',
        },
      });

      const mixedLesson: LearnerLesson = {
        assessmentId: null,
        lessonId: mockIds.lesson1,
        title: 'Lesson With Files',
        payload: { type: 'VIDEO', body: {} },
        assets: [
          {
            assetId: mockIds.videoAsset,
            filename: 'protected-lecture.mp4',
            mimeType: 'video/mp4',
            purpose: 'PRIMARY_VIDEO',
          },
          {
            assetId: mockIds.docAsset,
            filename: 'worksheet.pdf',
            mimeType: 'application/pdf',
            purpose: 'RESOURCE',
          },
        ],
        progress: null,
      };

      render(<LessonResources enrollmentId={mockIds.enrollment} lesson={mixedLesson} />);

      // Protected video must NOT be listed as downloadable resource
      expect(screen.queryByText('protected-lecture.mp4')).not.toBeInTheDocument();
      // Non-video resource MUST be listed
      expect(screen.getByText('worksheet.pdf')).toBeInTheDocument();

      const dlBtn = screen.getByTestId(`download-asset-${mockIds.docAsset}`);
      fireEvent.click(dlBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(
          `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson1}/assets/${mockIds.docAsset}/download`,
          {},
        );
      });
    });
  });

  describe('LessonLockView', () => {
    it('renders lock view with NOT_RELEASED reason and formatted unlock time', () => {
      render(
        <LessonLockView
          access={{
            allowed: false,
            reason: 'NOT_RELEASED',
            unlockAt: '2026-10-30T10:00:00.000Z',
          }}
        />,
      );

      expect(screen.getByTestId('lesson-lock-view')).toBeInTheDocument();
      expect(screen.getByText('Content is Locked')).toBeInTheDocument();
      expect(screen.getByText(/Unlocks on/i)).toBeInTheDocument();
    });
  });

  describe('ContentUnavailableView & 503 Handling', () => {
    it('renders clean temporarily unavailable state on learner access 503', () => {
      render(
        <ContentUnavailableView
          backHref="/student"
          message="Learning AccessPolicy evaluator is initializing."
        />,
      );

      expect(screen.getByTestId('content-unavailable-view')).toBeInTheDocument();
      expect(screen.getByText('Content Temporarily Unavailable')).toBeInTheDocument();
      expect(
        screen.getByText('Learning AccessPolicy evaluator is initializing.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Back to My Courses')).toBeInTheDocument();
    });

    it('renders temporarily unavailable message in document viewer when 503 error occurs', async () => {
      const error503 = Object.assign(new Error('Learning AccessPolicy is not bound'), {
        status: 503,
      });
      vi.spyOn(api, 'post').mockRejectedValueOnce(error503);

      const docLesson: LearnerLesson = {
        assessmentId: null,
        lessonId: mockIds.lesson1,
        title: 'Document Lesson',
        payload: { type: 'DOCUMENT', body: {} },
        assets: [
          {
            assetId: mockIds.docAsset,
            filename: 'handout.pdf',
            mimeType: 'application/pdf',
            purpose: 'PRIMARY_DOCUMENT',
          },
        ],
        progress: null,
      };

      renderWithQueryClient(
        <DocumentLessonViewer enrollmentId={mockIds.enrollment} lesson={docLesson} />,
      );

      expect(await screen.findByText('Document Temporarily Unavailable')).toBeInTheDocument();
    });
  });
});
