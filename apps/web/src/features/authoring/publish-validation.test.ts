import { describe, expect, it } from 'vitest';
import { validateCourseForPublish } from './utils/publish-validation';
import type { Course, SectionWithLessons } from './types';

const baseCourse: Course = {
  id: '00000000-0000-0000-0000-000000000001',
  workspaceId: '00000000-0000-0000-0000-000000000010',
  slug: 'test-course',
  title: 'Advanced Distributed Systems',
  summary: 'A deep dive into distributed systems and consensus protocols.',
  description: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Full description.' }] }],
  },
  visibility: 'PUBLIC',
  deliveryMode: 'SELF_PACED',
  language: 'en',
  level: 'ADVANCED',
  isFree: false,
  estimatedMinutes: 120,
  coverId: '00000000-0000-0000-0000-000000000010',
  status: 'DRAFT',
  version: 1,
  createdById: '00000000-0000-0000-0000-000000000002',
  publishedAt: null,
  archivedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const validSections: SectionWithLessons[] = [
  {
    id: '00000000-0000-0000-0000-000000000100',
    workspaceId: '00000000-0000-0000-0000-000000000010',
    courseId: baseCourse.id,
    title: 'Section 1: Foundations',
    position: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    lessons: [
      {
        id: '00000000-0000-0000-0000-000000000101',
        workspaceId: '00000000-0000-0000-0000-000000000010',
        courseId: baseCourse.id,
        sectionId: '00000000-0000-0000-0000-000000000100',
        title: 'Introduction to Consensus',
        position: 1,
        isRequired: true,
        isPreview: false,
        isPublished: true,
        estimatedMinutes: 20,
        completionRule: 'WATCH_PERCENT',
        requiredWatchPercent: 80,
        release: { releaseType: 'IMMEDIATE' },
        payload: {
          type: 'VIDEO',
          body: { durationSeconds: 1200 },
        },
        version: 1,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ],
  },
];

describe('validateCourseForPublish', () => {
  it('passes on a valid course with sections and published lessons', () => {
    const result = validateCourseForPublish(baseCourse, validSections);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when course has no sections or no lessons', () => {
    const resultNoSections = validateCourseForPublish(baseCourse, []);
    expect(resultNoSections.isValid).toBe(false);
    expect(resultNoSections.errors.some((e) => e.field === 'sections')).toBe(true);

    const resultEmptyLessons = validateCourseForPublish(baseCourse, [
      {
        ...validSections[0]!,
        lessons: [],
      },
    ]);
    expect(resultEmptyLessons.isValid).toBe(false);
    expect(resultEmptyLessons.errors.some((e) => e.field === 'lessons')).toBe(true);
  });

  it('fails when no lessons are published', () => {
    const sectionsWithUnpublished: SectionWithLessons[] = [
      {
        ...validSections[0]!,
        lessons: [
          {
            ...validSections[0]!.lessons[0]!,
            isPublished: false,
          },
        ],
      },
    ];
    const result = validateCourseForPublish(baseCourse, sectionsWithUnpublished);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'publishedLessons')).toBe(true);
  });

  it('enforces that protected activities cannot be marked as previews', () => {
    const invalidPreviewSections: SectionWithLessons[] = [
      {
        ...validSections[0]!,
        lessons: [
          {
            ...validSections[0]!.lessons[0]!,
            title: 'Pop Quiz',
            isPreview: true, // INVALID for QUIZ
            completionRule: 'ASSESSMENT_PASS',
            payload: {
              type: 'QUIZ',
              body: {},
            },
          },
        ],
      },
    ];
    const result = validateCourseForPublish(baseCourse, invalidPreviewSections);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'isPreview')).toBe(true);
    expect(result.errors[0]?.message).toContain(
      'protected QUIZ and cannot be marked as a free preview',
    );
  });

  it('enforces completion rule constraints (WATCH_PERCENT requires video, ASSESSMENT_PASS requires assessment)', () => {
    const invalidCompletionSections: SectionWithLessons[] = [
      {
        ...validSections[0]!,
        lessons: [
          {
            ...validSections[0]!.lessons[0]!,
            title: 'Reading Document',
            completionRule: 'WATCH_PERCENT', // INVALID for DOCUMENT
            payload: {
              type: 'DOCUMENT',
              body: {},
            },
          },
        ],
      },
    ];
    const result = validateCourseForPublish(baseCourse, invalidCompletionSections);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'completionRule')).toBe(true);
  });

  it('warns about missing cover image and cohort delivery requirements', () => {
    const courseNoCover: Course = {
      ...baseCourse,
      coverId: null,
      deliveryMode: 'COHORT',
    };
    const result = validateCourseForPublish(courseNoCover, validSections);
    expect(result.isValid).toBe(true); // Warnings do not block publish
    expect(result.warnings.some((w) => w.field === 'coverId')).toBe(true);
    expect(result.warnings.some((w) => w.field === 'deliveryMode')).toBe(true);
  });
});
