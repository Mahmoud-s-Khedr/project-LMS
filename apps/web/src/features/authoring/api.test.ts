import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import * as authoringApi from './api';

describe('Authoring API Client', () => {
  const workspaceId = 'a0000000-0000-4000-8000-000000000010';
  const courseId = 'a0000000-0000-4000-8000-000000000001';
  const sectionId = 'a0000000-0000-4000-8000-000000000100';
  const userId = 'a0000000-0000-4000-8000-000000000002';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchStaffCourses calls GET /workspaces/:workspaceId/courses with searchParams', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: [],
      meta: { nextCursor: null, hasMore: false, limit: 20 },
    });

    await authoringApi.fetchStaffCourses(workspaceId, { status: 'DRAFT', search: 'Distributed' });

    expect(getSpy).toHaveBeenCalledWith(
      expect.stringContaining(`/workspaces/${workspaceId}/courses?status=DRAFT&search=Distributed`),
    );
  });

  it('createCourse calls POST /workspaces/:workspaceId/courses', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        id: courseId,
        workspaceId,
        slug: 'systems',
        title: 'Systems Programming',
        summary: 'Summary',
        description: { type: 'doc', content: [] },
        visibility: 'PUBLIC',
        deliveryMode: 'SELF_PACED',
        language: 'en',
        level: 'ADVANCED',
        isFree: false,
        estimatedMinutes: 60,
        coverId: null,
        status: 'DRAFT',
        version: 1,
        createdById: userId,
        publishedAt: null,
        archivedAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    });

    const result = await authoringApi.createCourse(workspaceId, {
      slug: 'systems',
      title: 'Systems Programming',
      summary: 'Summary',
      description: { type: 'doc', content: [] },
      visibility: 'PUBLIC',
      deliveryMode: 'SELF_PACED',
      language: 'en',
      level: 'ADVANCED',
      isFree: false,
      estimatedMinutes: 60,
      coverId: null,
    });

    expect(postSpy).toHaveBeenCalledWith(
      `/workspaces/${workspaceId}/courses`,
      expect.objectContaining({ title: 'Systems Programming' }),
    );
    expect(result.id).toBe(courseId);
  });

  it('updateCourse sends version in PATCH payload', async () => {
    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: {
        id: courseId,
        workspaceId,
        slug: 'systems',
        title: 'Updated Systems',
        summary: 'Summary',
        description: { type: 'doc', content: [] },
        visibility: 'PUBLIC',
        deliveryMode: 'SELF_PACED',
        language: 'en',
        level: 'ADVANCED',
        isFree: false,
        estimatedMinutes: 60,
        coverId: null,
        status: 'DRAFT',
        version: 2,
        createdById: userId,
        publishedAt: null,
        archivedAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    });

    const result = await authoringApi.updateCourse(workspaceId, courseId, {
      title: 'Updated Systems',
      version: 1,
    });

    expect(patchSpy).toHaveBeenCalledWith(
      `/workspaces/${workspaceId}/courses/${courseId}`,
      { title: 'Updated Systems', version: 1 },
    );
    expect(result.version).toBe(2);
  });

  it('atomic sibling reordering calls PUT on order endpoints', async () => {
    const putSectionsSpy = vi.spyOn(api, 'put').mockResolvedValueOnce({
      data: [],
    });

    const ids = ['a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'];
    await authoringApi.reorderSections(workspaceId, courseId, ids);

    expect(putSectionsSpy).toHaveBeenCalledWith(
      `/workspaces/${workspaceId}/courses/${courseId}/sections/order`,
      { ids },
    );

    const putLessonsSpy = vi.spyOn(api, 'put').mockResolvedValueOnce({
      data: [],
    });

    await authoringApi.reorderLessons(workspaceId, courseId, sectionId, ids);

    expect(putLessonsSpy).toHaveBeenCalledWith(
      `/workspaces/${workspaceId}/courses/${courseId}/sections/${sectionId}/lessons/order`,
      { ids },
    );
  });

  it('lifecycle transitions pass version payload', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      data: {
        id: courseId,
        workspaceId,
        slug: 'systems',
        title: 'Systems',
        summary: 'Summary',
        description: { type: 'doc', content: [] },
        visibility: 'PUBLIC',
        deliveryMode: 'SELF_PACED',
        language: 'en',
        level: 'ADVANCED',
        isFree: false,
        estimatedMinutes: 60,
        coverId: null,
        status: 'PUBLISHED',
        version: 3,
        createdById: userId,
        publishedAt: '2026-10-26T10:00:00.000Z',
        archivedAt: null,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-26T10:00:00.000Z',
      },
    });

    await authoringApi.publishCourse(workspaceId, courseId, 2);
    expect(postSpy).toHaveBeenCalledWith(
      `/workspaces/${workspaceId}/courses/${courseId}/publish`,
      { version: 2 },
    );
  });
});
