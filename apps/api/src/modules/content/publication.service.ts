import {
  Injectable,
  Optional,
  Inject,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { courseSchema, lessonCreateSchema } from '@lms/shared';
import {
  required,
  lessonDto,
  lessonData,
  releaseWindow,
  assertAcyclic,
  ASSESSMENT_PUBLISH_VALIDATOR,
  type AssessmentPublishValidator,
  type Scope,
} from './content.support';
const dto = (row: unknown) => {
  const v = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  return courseSchema.parse(
    Object.fromEntries(Object.keys(courseSchema.shape).map((k) => [k, v[k]])),
  );
};
/** One validator shared by publication and edits of currently delivered content. */
@Injectable()
export class ContentPublicationService {
  constructor(
    @Optional()
    @Inject(ASSESSMENT_PUBLISH_VALIDATOR)
    private readonly assessments?: AssessmentPublishValidator,
  ) {}
  async cover(tx: Prisma.TransactionClient, workspaceId: string, id: string, courseId?: string) {
    const a = required(
      await tx.asset.findFirst({ where: { id, workspaceId, status: 'READY', deletedAt: null } }),
    );
    const m = a.metadata as Record<string, unknown>;
    if (
      m.purpose !== 'COURSE_COVER' ||
      (courseId && m.parentId !== courseId) ||
      !a.mimeType.startsWith('image/')
    )
      throw new BadRequestException('Invalid cover');
  }
  async validatePublish(tx: Prisma.TransactionClient, scope: Scope) {
    const c = required(
      await tx.course.findFirst({ where: { id: scope.courseId, workspaceId: scope.workspaceId } }),
    );
    dto(c);
    const lessons = await tx.lesson.findMany({
      where: { ...scope, deletedAt: null, section: { deletedAt: null } },
      include: {
        lessonAssets: { include: { asset: true } },
        assessment: true,
        liveSessions: { where: { deletedAt: null, status: 'SCHEDULED' } },
      },
    });
    if (!lessons.some((l) => l.isRequired && l.isPublished))
      throw new BadRequestException('At least one published required lesson is required');
    for (const l of lessons.filter((x) => x.isPublished)) {
      const v = lessonDto(l);
      lessonData(
        lessonCreateSchema.parse(
          Object.fromEntries(
            Object.keys(lessonCreateSchema.shape).map((k) => [
              k,
              (v as Record<string, unknown>)[k],
            ]),
          ),
        ),
      );
      if (c.deliveryMode === 'SELF_PACED' && l.releaseType === 'COHORT_OFFSET')
        throw new BadRequestException('Cohort release requires cohort delivery');
      if (l.availableUntil && l.releaseAt && l.availableUntil <= l.releaseAt)
        throw new BadRequestException('Unusable release window');
      for (const link of l.lessonAssets)
        if (link.asset.status !== 'READY' || link.asset.deletedAt)
          throw new BadRequestException('Asset is not usable');
      for (const link of l.lessonAssets) {
        if (
          (link.purpose === 'PRIMARY_VIDEO' &&
            (l.type !== 'VIDEO' || link.asset.mimeType !== 'video/mp4')) ||
          (link.purpose === 'PRIMARY_DOCUMENT' &&
            (l.type !== 'DOCUMENT' || link.asset.mimeType !== 'application/pdf')) ||
          (link.purpose === 'CAPTIONS' && link.asset.mimeType !== 'text/vtt')
        )
          throw new BadRequestException('Asset purpose does not match lesson type');
      }
      if (
        l.type === 'VIDEO' &&
        !l.lessonAssets.some(
          (a) => a.purpose === 'PRIMARY_VIDEO' && a.asset.mimeType === 'video/mp4',
        )
      )
        throw new BadRequestException('Video source required');
      if (
        l.type === 'DOCUMENT' &&
        !l.lessonAssets.some(
          (a) => a.purpose === 'PRIMARY_DOCUMENT' && a.asset.mimeType === 'application/pdf',
        )
      )
        throw new BadRequestException('PDF required');
      if (['QUIZ', 'EXAM', 'ASSIGNMENT'].includes(l.type)) {
        if (!l.assessment || l.assessment.kind !== l.type)
          throw new BadRequestException('Assessment kind mismatch');
      } else if (l.assessment)
        throw new BadRequestException('Assessment attached to non-assessment lesson');
      if (l.type === 'LIVE_SESSION' && !l.liveSessions.length)
        throw new BadRequestException('Scheduled live session required');
    }
    if (c.deliveryMode === 'COHORT') {
      const cohorts = await tx.cohort.findMany({
        where: { ...scope, isPublished: true, deletedAt: null },
        include: { cohortLessonReleases: true },
      });
      for (const cohort of cohorts)
        for (const lesson of lessons.filter((l) => l.isRequired && l.isPublished)) {
          const override = cohort.cohortLessonReleases.find((r) => r.lessonId === lesson.id);
          const window = releaseWindow(
            lesson,
            cohort.enrollmentOpensAt ?? new Date(),
            cohort.startsAt,
            override,
          );
          const latestClose =
            window.closesAt && cohort.endsAt
              ? new Date(Math.min(window.closesAt.getTime(), cohort.endsAt.getTime()))
              : (window.closesAt ?? cohort.endsAt);
          if (
            !window.satisfiable ||
            (latestClose && (window.opensAt ?? cohort.startsAt) >= latestClose)
          )
            throw new BadRequestException(
              'Required lesson has no satisfiable cohort release window',
            );
        }
    }
    const edges = await tx.lessonPrerequisite.findMany({ where: scope });
    assertAcyclic(edges.map((e) => ({ from: e.lessonId, to: e.requiredLessonId })));
    const published = new Set(lessons.filter((l) => l.isPublished).map((l) => l.id));
    if (edges.some((e) => published.has(e.lessonId) && !published.has(e.requiredLessonId)))
      throw new BadRequestException('Unpublished prerequisite');
    const courseEdges = await tx.coursePrerequisite.findMany({
      where: { workspaceId: scope.workspaceId },
    });
    assertAcyclic(courseEdges.map((e) => ({ from: e.courseId, to: e.requiredCourseId })));
    if (lessons.some((l) => ['QUIZ', 'EXAM', 'ASSIGNMENT'].includes(l.type) && l.isPublished)) {
      if (!this.assessments)
        throw new ServiceUnavailableException('Assessment publish validator is not bound');
      await this.assessments.validateCourse(tx, scope);
    }
    if (c.coverId) await this.cover(tx, scope.workspaceId, c.coverId, scope.courseId);
    if (
      c.deliveryMode === 'COHORT' &&
      !(await tx.cohort.count({ where: { ...scope, isPublished: true, deletedAt: null } }))
    )
      throw new BadRequestException('Published cohort required');
    if (
      !c.isFree &&
      !(await tx.price.count({
        where: {
          workspaceId: scope.workspaceId,
          isActive: true,
          product: {
            status: 'ACTIVE',
            deletedAt: null,
            productCourses: { some: { courseId: scope.courseId } },
          },
        },
      }))
    )
      throw new BadRequestException('Active purchasable price required');
  }
}
