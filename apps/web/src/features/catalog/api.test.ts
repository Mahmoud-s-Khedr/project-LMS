import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import {
  catalogFixture,
  catalogDetailFixture,
  fixtureIds,
  fixtureDocument,
  fixtureTimestamp,
  type FreeEnrollment,
} from '@lms/shared';
import {
  fetchCatalogCourses,
  fetchCatalogCourseDetail,
  findCatalogCourseBySlug,
  fetchPreviewLesson,
  requestPreviewAssetDownload,
  fetchCatalogCohorts,
  fetchCatalogProducts,
  fetchCatalogProductDetail,
  fetchPublicWorkspace,
  enrollFreeCourse,
  fetchMyCourseEnrollments,
  isUuid,
} from './api';

describe('Catalog API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isUuid', () => {
    it('correctly identifies valid and invalid UUIDs', () => {
      expect(isUuid(fixtureIds.course)).toBe(true);
      expect(isUuid('distributed-systems-101')).toBe(false);
      expect(isUuid('not-a-uuid')).toBe(false);
    });
  });

  describe('fetchCatalogCourses', () => {
    it('requests /catalog/courses with query parameters and returns parsed result', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(catalogFixture);

      const result = await fetchCatalogCourses({
        search: 'reliable',
        category: 'software-engineering',
        level: 'Intermediate',
        deliveryMode: 'SELF_PACED',
        language: 'en',
        sort: 'publishedAt',
        limit: 10,
      });

      expect(getSpy).toHaveBeenCalledWith(
        expect.stringContaining('/catalog/courses?'),
        expect.objectContaining({ skipAuthRefresh: true }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe(fixtureIds.course);
      expect(result.meta.limit).toBe(20);
    });
  });

  describe('fetchCatalogCourseDetail', () => {
    it('requests /catalog/courses/:courseId and returns parsed course detail', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(catalogDetailFixture);

      const result = await fetchCatalogCourseDetail(fixtureIds.course);

      expect(getSpy).toHaveBeenCalledWith(
        `/catalog/courses/${fixtureIds.course}`,
        expect.objectContaining({ skipAuthRefresh: true }),
      );
      expect(result.id).toBe(fixtureIds.course);
      expect(result.outline).toHaveLength(1);
      expect(result.prices).toHaveLength(1);
    });
  });

  describe('findCatalogCourseBySlug', () => {
    it('directly fetches by UUID when input is a valid UUID', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce(catalogDetailFixture);

      const result = await findCatalogCourseBySlug(fixtureIds.course);

      expect(result?.id).toBe(fixtureIds.course);
    });

    it('resolves exact slug through the dedicated endpoint', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(catalogDetailFixture);

      const result = await findCatalogCourseBySlug('reliable-software');

      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(getSpy).toHaveBeenCalledWith('/catalog/courses/by-slug/reliable-software', {
        skipAuthRefresh: true,
      });
      expect(result?.slug).toBe('reliable-software');
    });

    it('returns null when slug cannot be found', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [],
        meta: { nextCursor: null, hasMore: false, limit: 10 },
      });

      const result = await findCatalogCourseBySlug('nonexistent-slug');
      expect(result).toBeNull();
    });

    it('returns null when search result has single unrelated course with non-matching slug', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [
          {
            ...catalogFixture.data[0]!,
            slug: 'unrelated-course-slug',
          },
        ],
        meta: { nextCursor: null, hasMore: false, limit: 10 },
      });

      const result = await findCatalogCourseBySlug('requested-different-slug');
      expect(result).toBeNull();
    });
  });

  describe('fetchPreviewLesson', () => {
    it('requests /catalog/courses/:courseId/preview-lessons/:lessonId and returns preview payload', async () => {
      const mockPreview = {
        data: {
          lessonId: fixtureIds.lesson,
          title: 'Introduction Preview',
          payload: {
            type: 'TEXT' as const,
            body: fixtureDocument,
          },
          assets: [
            {
              assetId: fixtureIds.grant,
              filename: 'cheatsheet.pdf',
              mimeType: 'application/pdf',
              purpose: 'handout',
            },
          ],
        },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(mockPreview);

      const result = await fetchPreviewLesson(fixtureIds.course, fixtureIds.lesson);

      expect(getSpy).toHaveBeenCalledWith(
        `/catalog/courses/${fixtureIds.course}/preview-lessons/${fixtureIds.lesson}`,
        expect.objectContaining({ skipAuthRefresh: true }),
      );
      expect(result.lessonId).toBe(fixtureIds.lesson);
      expect(result.payload.type).toBe('TEXT');
      expect(result.assets).toHaveLength(1);
    });
  });

  describe('requestPreviewAssetDownload', () => {
    it('posts to download endpoint and returns signed capability URL', async () => {
      const mockDownload = {
        data: {
          url: 'https://storage.local/downloads/preview-asset?token=xyz',
          expiresAt: '2026-10-27T00:00:00.000Z',
        },
      };

      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce(mockDownload);

      const result = await requestPreviewAssetDownload(
        fixtureIds.course,
        fixtureIds.lesson,
        fixtureIds.grant,
      );

      expect(postSpy).toHaveBeenCalledWith(
        `/catalog/courses/${fixtureIds.course}/preview-lessons/${fixtureIds.lesson}/assets/${fixtureIds.grant}/download`,
        {},
        expect.objectContaining({ skipAuthRefresh: true }),
      );
      expect(result.url).toBe(mockDownload.data.url);
    });
  });

  describe('fetchCatalogCohorts', () => {
    it('requests /catalog/courses/:courseId/cohorts and returns cohort list', async () => {
      const mockCohorts = {
        data: [
          {
            id: fixtureIds.enrollment,
            workspaceId: fixtureIds.workspace,
            courseId: fixtureIds.course,
            name: 'Fall 2026 Batch',
            startsAt: '2026-11-01T00:00:00.000Z',
            endsAt: '2026-12-15T00:00:00.000Z',
            enrollmentOpensAt: '2026-10-01T00:00:00.000Z',
            enrollmentClosesAt: '2026-10-31T00:00:00.000Z',
            capacity: 50,
            timezone: 'UTC',
            seatsAvailable: 25,
            isPublished: true as const,
          },
        ],
        meta: { nextCursor: null, hasMore: false, limit: 20 },
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce(mockCohorts);

      const result = await fetchCatalogCohorts(fixtureIds.course);

      expect(getSpy).toHaveBeenCalledWith(
        `/catalog/courses/${fixtureIds.course}/cohorts`,
        expect.objectContaining({ skipAuthRefresh: true }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe('Fall 2026 Batch');
    });
  });

  describe('fetchCatalogProducts & fetchCatalogProductDetail', () => {
    it('requests products list and single product detail with schema validation', async () => {
      const mockProduct = {
        id: fixtureIds.product,
        workspaceId: fixtureIds.workspace,
        type: 'BUNDLE' as const,
        status: 'ACTIVE' as const,
        slug: 'master-bundle',
        name: 'Distributed Systems Master Bundle',
        description: fixtureDocument,
        accessDurationDays: 365,
        courses: catalogFixture.data,
        prices: [
          {
            id: fixtureIds.price,
            workspaceId: fixtureIds.workspace,
            productId: fixtureIds.product,
            currency: 'usd',
            amount: 9900,
            interval: null,
            intervalCount: 1,
            trialDays: 0,
            isActive: true,
            createdAt: fixtureTimestamp,
            updatedAt: fixtureTimestamp,
          },
        ],
      };

      vi.spyOn(api, 'get')
        .mockResolvedValueOnce({
          data: [mockProduct],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        })
        .mockResolvedValueOnce({ data: mockProduct });

      const listResult = await fetchCatalogProducts({ type: 'BUNDLE' });
      expect(listResult.data).toHaveLength(1);
      expect(listResult.data[0]?.type).toBe('BUNDLE');

      const detailResult = await fetchCatalogProductDetail(fixtureIds.product);
      expect(detailResult.name).toBe('Distributed Systems Master Bundle');
      expect(detailResult.courses).toHaveLength(1);
    });
  });

  describe('fetchPublicWorkspace', () => {
    it('requests /catalog/workspaces/:slug and returns workspace branding', async () => {
      const mockWorkspace = {
        data: {
          id: fixtureIds.workspace,
          kind: 'ACADEMY' as const,
          slug: 'systems-academy',
          name: 'Systems Academy',
          description: 'Premier distributed systems training.',
          logoUrl: 'https://images.local/logo.png',
          timezone: 'America/New_York',
        },
      };

      vi.spyOn(api, 'get').mockResolvedValueOnce(mockWorkspace);

      const result = await fetchPublicWorkspace('systems-academy');
      expect(result.name).toBe('Systems Academy');
      expect(result.kind).toBe('ACADEMY');
    });
  });

  describe('enrollFreeCourse', () => {
    const mockEnrollment = {
      id: fixtureIds.enrollment,
      workspaceId: fixtureIds.workspace,
      courseId: fixtureIds.course,
      userId: fixtureIds.user,
      cohortId: null,
      status: 'ACTIVE' as const,
      enrolledAt: fixtureTimestamp,
      startedAt: null,
      completedAt: null,
      lastActivityAt: null,
      completionPercent: '0.00',
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
      access: {
        allowed: true,
        expiresAt: null,
      },
      grants: [
        {
          id: '10000000-0000-4000-8000-000000000088',
          source: 'FREE' as const,
          startsAt: fixtureTimestamp,
          expiresAt: null,
          revokedAt: null,
        },
      ],
    };

    it('sends POST /courses/:courseId/enroll with default body and Idempotency-Key header', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockEnrollment });

      const result = await enrollFreeCourse(fixtureIds.course);

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [path, body, options] = postSpy.mock.calls[0] as [
        string,
        unknown,
        { headers?: Record<string, string> },
      ];
      expect(path).toBe(`/courses/${fixtureIds.course}/enroll`);
      expect(body).toEqual({});
      expect(options.headers?.['Idempotency-Key']).toBeDefined();
      const idempotencyKey = options.headers?.['Idempotency-Key'] as string;
      expect(idempotencyKey.length).toBeGreaterThanOrEqual(16);
      expect(idempotencyKey.length).toBeLessThanOrEqual(128);
      expect(/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)).toBe(true);

      expect(result.id).toBe(fixtureIds.enrollment);
      expect(result.status).toBe('ACTIVE');
    });

    it('sends POST with cohortId when provided and adheres to freeEnrollmentSchema', async () => {
      const mockCohortId = '10000000-0000-4000-8000-000000000099';
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: { ...mockEnrollment, cohortId: mockCohortId },
      });

      const result = await enrollFreeCourse(fixtureIds.course, { cohortId: mockCohortId });

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [path, body] = postSpy.mock.calls[0] as [string, unknown];
      expect(path).toBe(`/courses/${fixtureIds.course}/enroll`);
      expect(body).toEqual({ cohortId: mockCohortId });
      expect(result.cohortId).toBe(mockCohortId);
    });

    it('reuses provided idempotencyKey on retry', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockEnrollment });
      const customKey = 'idemp-key-test-1234567890';

      await enrollFreeCourse(fixtureIds.course, {}, customKey);

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [, , options] = postSpy.mock.calls[0] as [
        string,
        unknown,
        { headers?: Record<string, string> },
      ];
      expect(options.headers?.['Idempotency-Key']).toBe(customKey);
    });

    it('throws validation error when body violates freeEnrollmentSchema', async () => {
      await expect(
        enrollFreeCourse(fixtureIds.course, {
          extraField: 'disallowed',
        } as unknown as FreeEnrollment),
      ).rejects.toThrow();
    });
  });

  describe('fetchMyCourseEnrollments', () => {
    it('requests GET /me/enrollments?courseId=:id and returns the first enrollment', async () => {
      const mockEnrollment = {
        id: fixtureIds.enrollment,
        workspaceId: fixtureIds.workspace,
        courseId: fixtureIds.course,
        userId: fixtureIds.user,
        cohortId: null,
        status: 'ACTIVE' as const,
        enrolledAt: fixtureTimestamp,
        startedAt: null,
        completedAt: null,
        lastActivityAt: null,
        completionPercent: '0.00',
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
        access: { allowed: true, expiresAt: null },
        grants: [],
      };

      const getSpy = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [mockEnrollment] });

      const result = await fetchMyCourseEnrollments(fixtureIds.course);

      expect(getSpy).toHaveBeenCalledWith(`/me/enrollments?courseId=${fixtureIds.course}`);
      expect(result?.id).toBe(fixtureIds.enrollment);
    });

    it('returns null when no enrollment exists for the course', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: [] });

      const result = await fetchMyCourseEnrollments(fixtureIds.course);
      expect(result).toBeNull();
    });
  });
});
