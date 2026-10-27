import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fixtureDocument, fixtureIds } from '@lms/shared';
import * as apiModule from '../api';
import { PreviewLessonModal } from './preview-lesson-modal';
import type { PublicOutlineLesson } from '../types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('PreviewLessonModal component', () => {
  const mockLesson: PublicOutlineLesson = {
    lessonId: fixtureIds.lesson,
    title: 'Introduction to Transactions',
    type: 'TEXT',
    position: 0,
    isPreview: true,
    estimatedMinutes: 10,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <PreviewLessonModal
        courseId={fixtureIds.course}
        lesson={mockLesson}
        isOpen={false}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('loads and displays preview content and downloadable assets', async () => {
    vi.spyOn(apiModule, 'fetchPreviewLesson').mockResolvedValueOnce({
      lessonId: fixtureIds.lesson,
      title: 'Introduction to Transactions',
      payload: {
        type: 'TEXT',
        body: fixtureDocument,
      },
      assets: [
        {
          assetId: fixtureIds.grant,
          filename: 'system-cheatsheet.pdf',
          mimeType: 'application/pdf',
          purpose: 'notes',
        },
      ],
    });

    const downloadSpy = vi.spyOn(apiModule, 'requestPreviewAssetDownload').mockResolvedValueOnce({
      url: 'https://cdn.local/download?sig=xyz',
      expiresAt: '2026-10-27T00:00:00.000Z',
    });

    render(
      <PreviewLessonModal
        courseId={fixtureIds.course}
        lesson={mockLesson}
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Introduction to Transactions')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Practice building dependable software.')).toBeInTheDocument();
    });

    expect(screen.getByText('system-cheatsheet.pdf')).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: /download/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(
        fixtureIds.course,
        fixtureIds.lesson,
        fixtureIds.grant,
      );
    });
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <PreviewLessonModal
        courseId={fixtureIds.course}
        lesson={mockLesson}
        isOpen={true}
        onClose={handleClose}
      />,
      { wrapper: createWrapper() },
    );

    const closeBtn = screen.getByRole('button', { name: /close preview modal/i });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
