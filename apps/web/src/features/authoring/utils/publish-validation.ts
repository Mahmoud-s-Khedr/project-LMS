import type { Course, SectionWithLessons, PublishValidationResult, PublishValidationIssue } from '../types';

/**
 * Validates course aggregate state against publishing invariants.
 * Returns errors (which block publishing) and warnings (advisory recommendations).
 */
export function validateCourseForPublish(
  course: Course,
  sections: SectionWithLessons[],
): PublishValidationResult {
  const errors: PublishValidationIssue[] = [];
  const warnings: PublishValidationIssue[] = [];

  // 1. Course Metadata Checks
  if (!course.title || course.title.trim().length === 0) {
    errors.push({
      severity: 'ERROR',
      field: 'title',
      message: 'Course title is required before publishing.',
    });
  }

  if (!course.summary || course.summary.trim().length === 0) {
    errors.push({
      severity: 'ERROR',
      field: 'summary',
      message: 'Course summary is required for the public catalog.',
    });
  }

  if (!course.coverId) {
    warnings.push({
      severity: 'WARNING',
      field: 'coverId',
      message: 'Course does not have a cover image. A visual thumbnail is strongly recommended.',
    });
  }

  // 2. Sections and Lessons Count
  if (sections.length === 0) {
    errors.push({
      severity: 'ERROR',
      field: 'sections',
      message: 'Course must contain at least one section before publishing.',
    });
  }

  const allLessons = sections.flatMap((s) => s.lessons);
  const publishedLessons = allLessons.filter((l) => l.isPublished);

  if (allLessons.length === 0) {
    errors.push({
      severity: 'ERROR',
      field: 'lessons',
      message: 'Course must contain at least one lesson before publishing.',
    });
  } else if (publishedLessons.length === 0) {
    errors.push({
      severity: 'ERROR',
      field: 'publishedLessons',
      message: 'At least one lesson must be marked as published.',
    });
  }

  // 3. Lesson Invariants
  const protectedTypes = new Set(['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION']);
  const assessmentTypes = new Set(['QUIZ', 'ASSIGNMENT', 'EXAM']);

  for (const section of sections) {
    for (const lesson of section.lessons) {
      // Invariant: Protected activities cannot be previews
      if (lesson.isPreview && protectedTypes.has(lesson.payload.type)) {
        errors.push({
          severity: 'ERROR',
          field: 'isPreview',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Lesson "${lesson.title}" is a protected ${lesson.payload.type} and cannot be marked as a free preview.`,
        });
      }

      // Invariant: Watch percent completion requires video
      if (lesson.completionRule === 'WATCH_PERCENT' && lesson.payload.type !== 'VIDEO') {
        errors.push({
          severity: 'ERROR',
          field: 'completionRule',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Lesson "${lesson.title}" specifies WATCH_PERCENT completion but its type is ${lesson.payload.type}.`,
        });
      }

      // Invariant: Assessment pass requires assessment lesson
      if (lesson.completionRule === 'ASSESSMENT_PASS' && !assessmentTypes.has(lesson.payload.type)) {
        errors.push({
          severity: 'ERROR',
          field: 'completionRule',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Lesson "${lesson.title}" specifies ASSESSMENT_PASS completion but is not a Quiz, Assignment, or Exam.`,
        });
      }

      // Invariant: Attendance requires live session
      if (lesson.completionRule === 'ATTENDANCE' && lesson.payload.type !== 'LIVE_SESSION') {
        errors.push({
          severity: 'ERROR',
          field: 'completionRule',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Lesson "${lesson.title}" specifies ATTENDANCE completion but is not a Live Session.`,
        });
      }

      // Invariant: Missing video duration
      if (lesson.payload.type === 'VIDEO' && !lesson.payload.body?.durationSeconds) {
        warnings.push({
          severity: 'WARNING',
          field: 'payload.durationSeconds',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Video lesson "${lesson.title}" does not have duration specified.`,
        });
      }

      // Invariant: Interactive embed URL
      if (lesson.payload.type === 'INTERACTIVE' && !lesson.payload.body?.embedUrl) {
        errors.push({
          severity: 'ERROR',
          field: 'payload.embedUrl',
          sectionId: section.id,
          lessonId: lesson.id,
          message: `Interactive lesson "${lesson.title}" requires a valid HTTPS embed URL.`,
        });
      }
    }
  }

  // 4. Delivery Mode Warnings
  if (course.deliveryMode === 'COHORT') {
    warnings.push({
      severity: 'WARNING',
      field: 'deliveryMode',
      message: 'This is a cohort-based course. Ensure at least one cohort has scheduled enrollment windows.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
