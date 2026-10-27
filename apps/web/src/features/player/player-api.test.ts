import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import {
  fetchEnrollment,
  fetchLearnerOutline,
  fetchLearnerLesson,
  updateLessonProgress,
  requestLessonAssetDownload,
  joinLiveSession,
  fetchEnrollmentResults,
} from './api';

const mockIds = {
  enrollment: '10000000-0000-4000-8000-000000000003',
  lesson: '10000000-0000-4000-8000-000000000005',
  section: '10000000-0000-4000-8000-000000000006',
  asset: '10000000-0000-4000-8000-000000000016',
  session: '10000000-0000-4000-8000-000000000017',
  event: '10000000-0000-4000-8000-000000000015',
  course: '10000000-0000-4000-8000-000000000002',
  user: '10000000-0000-4000-8000-000000000004',
  workspace: '10000000-0000-4000-8000-000000000001',
};

describe('Player API Client Functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchEnrollment returns parsed enrollment', async () => {
    const mockEnrollment = {
      id: mockIds.enrollment,
      workspaceId: mockIds.workspace,
      userId: mockIds.user,
      courseId: mockIds.course,
      cohortId: null,
      status: 'ACTIVE',
      enrolledAt: '2026-10-26T08:00:00.000Z',
      startedAt: '2026-10-26T08:00:00.000Z',
      completedAt: null,
      lastActivityAt: '2026-10-26T08:00:00.000Z',
      completionPercent: '25.00',
      createdAt: '2026-10-26T08:00:00.000Z',
      updatedAt: '2026-10-26T08:00:00.000Z',
      access: { allowed: true, expiresAt: null },
      grants: [
        {
          id: '10000000-0000-4000-8000-000000000013',
          source: 'FREE',
          startsAt: '2026-10-26T08:00:00.000Z',
          expiresAt: null,
          revokedAt: null,
        },
      ],
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockEnrollment });

    const result = await fetchEnrollment(mockIds.enrollment);
    expect(result.id).toBe(mockIds.enrollment);
    expect(result.completionPercent).toBe('25.00');
    expect(api.get).toHaveBeenCalledWith(`/me/enrollments/${mockIds.enrollment}`);
  });

  it('fetchLearnerOutline returns outline with locked and unlocked lessons', async () => {
    const mockOutline = {
      enrollmentId: mockIds.enrollment,
      sections: [
        {
          sectionId: mockIds.section,
          title: 'Section 1',
          position: 0,
          lessons: [
            {
              lessonId: mockIds.lesson,
              title: 'Lesson 1',
              type: 'TEXT',
              position: 0,
              isRequired: true,
              completedAt: null,
              access: { allowed: true, expiresAt: null },
            },
          ],
        },
      ],
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockOutline });

    const result = await fetchLearnerOutline(mockIds.enrollment);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.lessons[0]?.title).toBe('Lesson 1');
    expect(api.get).toHaveBeenCalledWith(`/me/enrollments/${mockIds.enrollment}/outline`);
  });

  it('fetchLearnerLesson returns lesson body and assets', async () => {
    const mockLesson = {
      assessmentId: null,
      lessonId: mockIds.lesson,
      title: 'Video Lesson',
      payload: {
        type: 'VIDEO',
        body: { durationSeconds: 300 },
      },
      assets: [
        {
          assetId: mockIds.asset,
          filename: 'intro.mp4',
          mimeType: 'video/mp4',
          purpose: 'PRIMARY_VIDEO',
        },
      ],
      progress: null,
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockLesson });

    const result = await fetchLearnerLesson(mockIds.enrollment, mockIds.lesson);
    expect(result.lessonId).toBe(mockIds.lesson);
    expect(result.payload.type).toBe('VIDEO');
    expect(result.assets).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson}`,
    );
  });

  it('updateLessonProgress validates and sends ACKNOWLEDGE', async () => {
    const mockProgress = {
      id: '10000000-0000-4000-8000-000000000099',
      workspaceId: mockIds.workspace,
      enrollmentId: mockIds.enrollment,
      lessonId: mockIds.lesson,
      positionSeconds: 0,
      watchedSeconds: 0,
      completionPercent: '100.00',
      completedAt: '2026-10-26T08:30:00.000Z',
      lastViewedAt: '2026-10-26T08:30:00.000Z',
      createdAt: '2026-10-26T08:00:00.000Z',
      updatedAt: '2026-10-26T08:30:00.000Z',
    };

    vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockProgress });

    const result = await updateLessonProgress(mockIds.enrollment, mockIds.lesson, {
      type: 'ACKNOWLEDGE',
      eventId: mockIds.event,
    });

    expect(result.completionPercent).toBe('100.00');
    expect(api.put).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson}/progress`,
      {
        type: 'ACKNOWLEDGE',
        eventId: mockIds.event,
      },
    );
  });

  it('updateLessonProgress sends bounded PLAYBACK heartbeat', async () => {
    const mockProgress = {
      id: '10000000-0000-4000-8000-000000000099',
      workspaceId: mockIds.workspace,
      enrollmentId: mockIds.enrollment,
      lessonId: mockIds.lesson,
      positionSeconds: 65,
      watchedSeconds: 60,
      completionPercent: '20.00',
      completedAt: null,
      lastViewedAt: '2026-10-26T08:30:00.000Z',
      createdAt: '2026-10-26T08:00:00.000Z',
      updatedAt: '2026-10-26T08:30:00.000Z',
    };

    vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockProgress });

    const result = await updateLessonProgress(mockIds.enrollment, mockIds.lesson, {
      type: 'PLAYBACK',
      eventId: mockIds.event,
      positionSeconds: 65,
      elapsedSeconds: 10,
      occurredAt: '2026-10-26T08:30:00.000Z',
    });

    expect(result.positionSeconds).toBe(65);
    expect(api.put).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson}/progress`,
      expect.objectContaining({
        type: 'PLAYBACK',
        elapsedSeconds: 10,
      }),
    );
  });

  it('requestLessonAssetDownload returns signed capability URL', async () => {
    const mockCap = {
      url: 'https://storage.example.com/asset-signed?sig=abc',
      expiresAt: '2026-10-26T08:31:00.000Z',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCap });

    const result = await requestLessonAssetDownload(
      mockIds.enrollment,
      mockIds.lesson,
      mockIds.asset,
    );
    expect(result.url).toBe(mockCap.url);
    expect(result.expiresAt).toBe(mockCap.expiresAt);
    expect(api.post).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/lessons/${mockIds.lesson}/assets/${mockIds.asset}/download`,
      {},
    );
  });

  it('joinLiveSession returns session capability URL', async () => {
    const mockCap = {
      url: 'https://live.example.com/join?token=xyz',
      expiresAt: '2026-10-26T08:35:00.000Z',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCap });

    const result = await joinLiveSession(mockIds.enrollment, mockIds.session);
    expect(result.url).toBe(mockCap.url);
    expect(api.post).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/live-sessions/${mockIds.session}/join`,
      {},
    );
  });

  it('fetchEnrollmentResults returns released results', async () => {
    const mockResults = [
      {
        attemptId: '10000000-0000-4000-8000-000000000008',
        assessmentId: '10000000-0000-4000-8000-000000000007',
        number: 1,
        status: 'GRADED',
        totalPoints: '10.000',
        awardedPoints: '10.000',
        percent: '100.00',
        passed: true,
        gradedAt: '2026-10-26T08:00:00.000Z',
        answers: [],
      },
    ];

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockResults });

    const result = await fetchEnrollmentResults(mockIds.enrollment);
    expect(result).toHaveLength(1);
    expect(result[0]?.passed).toBe(true);
    expect(api.get).toHaveBeenCalledWith(`/me/enrollments/${mockIds.enrollment}/results`);
  });
});
