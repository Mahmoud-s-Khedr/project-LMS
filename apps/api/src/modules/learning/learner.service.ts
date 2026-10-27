import {
  ForbiddenException,
  ConflictException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  enrollmentsQuerySchema,
  learnerLessonSchema,
  learnerOutlineSchema,
  lessonPayloadSchema,
  lessonProgressSchema,
  type EnrollmentsQuery,
  type ProgressUpdate,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/authz';
import { ContentPagination } from '../content/content.support';
import { AssessmentAttemptsService } from '../assessments/attempts.service';
import { evaluateEnrollmentAccess, evaluateLessonAccess } from './availability';
import { LearningCompletionService } from './completion.service';
import { enrollmentDto } from './enrollment-dto';
import {
  LearnerAccessPolicy,
  enrollmentAccessInclude,
  toAccessEnrollment,
} from './learner-access-policy';
import {
  LEARNING_CLOCK,
  accessDenied,
  lockEnrollmentRow,
  required,
  semantic,
  systemClock,
  type LearningClock,
  type Tx,
} from './learning.support';
import { clampOccurredAt, floorPercent, percentToNumber, playbackCredit } from './progress-math';

type Actor = Pick<AuthenticatedUser, 'id'>;

/** Owner-scoped learner reads and the bounded progress projection (API.md §8, `/me/enrollments/**`). */
@Injectable()
export class LearnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: LearnerAccessPolicy,
    private readonly completion: LearningCompletionService,
    private readonly pagination: ContentPagination,
    @Optional() private readonly attempts?: AssessmentAttemptsService,
    @Optional() @Inject(LEARNING_CLOCK) private readonly clock: LearningClock = systemClock,
  ) {}

  /** Every learner path starts here: the enrollment must be the caller's own, else 404. */
  private async own(
    db: Prisma.TransactionClient | PrismaService,
    actor: Actor,
    enrollmentId: string,
  ) {
    return required(
      await db.enrollment.findFirst({ where: { id: enrollmentId, userId: actor.id } }),
    );
  }

  async list(actor: Actor, query: EnrollmentsQuery) {
    const q = enrollmentsQuerySchema.parse(query);
    const { cursor: _cursor, limit: _limit, ...filters } = q;
    const scope = { owner: actor.id, ...filters };
    const c = this.pagination.decode(q, scope);
    const rows = await this.prisma.enrollment.findMany({
      where: {
        userId: actor.id,
        ...(q.status ? { status: q.status } : {}),
        ...(q.courseId ? { courseId: q.courseId } : {}),
        ...(q.cohortId ? { cohortId: q.cohortId } : {}),
        ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
        ...(c
          ? {
              OR: [
                { createdAt: { lt: new Date(c.value) } },
                { createdAt: new Date(c.value), id: { lt: c.id } },
              ],
            }
          : {}),
      },
      include: enrollmentAccessInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const at = this.clock.now();
    const page = this.pagination.page(rows, q, scope, (r) => r.createdAt.toISOString());
    return { ...page, data: page.data.map((r) => enrollmentDto(r, at)) };
  }

  async get(actor: Actor, enrollmentId: string) {
    await this.own(this.prisma, actor, enrollmentId);
    await this.completion.reconcile(enrollmentId);
    const row = required(
      await this.prisma.enrollment.findFirst({
        where: { id: enrollmentId, userId: actor.id },
        include: enrollmentAccessInclude,
      }),
    );
    return enrollmentDto(row, this.clock.now());
  }

  /** Titles, completion and per-lesson lock reasons; lesson bodies are never part of the outline. */
  async outline(actor: Actor, enrollmentId: string) {
    const enrollment = await this.own(this.prisma, actor, enrollmentId);
    await this.completion.reconcile(enrollmentId);
    const at = this.clock.now();
    const loaded = required(
      await this.policy.loadEnrollment(this.prisma, {
        workspaceId: enrollment.workspaceId,
        enrollmentId,
        userId: actor.id,
      }),
    );
    const access = toAccessEnrollment(loaded);
    const [sections, facts, progress] = await Promise.all([
      this.prisma.section.findMany({
        where: {
          workspaceId: enrollment.workspaceId,
          courseId: enrollment.courseId,
          deletedAt: null,
        },
        orderBy: { position: 'asc' },
        include: {
          lessons: {
            where: { deletedAt: null, isPublished: true },
            orderBy: { position: 'asc' },
            select: { id: true, title: true, type: true, position: true, isRequired: true },
          },
        },
      }),
      this.policy.lessonFacts(this.prisma, loaded, 'ALL'),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId, completedAt: { not: null } },
        select: { lessonId: true, completedAt: true },
      }),
    ]);
    const completedAt = new Map(progress.map((p) => [p.lessonId, p.completedAt]));
    return learnerOutlineSchema.parse({
      enrollmentId,
      sections: sections.map((s) => ({
        sectionId: s.id,
        title: s.title,
        position: s.position,
        lessons: s.lessons.map((l) => {
          const f = facts.get(l.id);
          return {
            lessonId: l.id,
            title: l.title,
            type: l.type,
            position: l.position,
            isRequired: l.isRequired,
            completedAt: completedAt.get(l.id)?.toISOString() ?? null,
            access: f ? evaluateLessonAccess(access, f, at) : evaluateEnrollmentAccess(access, at),
          };
        }),
      })),
    });
  }

  private async publishedLesson(
    db: Tx | PrismaService,
    enrollment: { workspaceId: string; courseId: string },
    lessonId: string,
  ) {
    return required(
      await db.lesson.findFirst({
        where: {
          id: lessonId,
          workspaceId: enrollment.workspaceId,
          courseId: enrollment.courseId,
          deletedAt: null,
          isPublished: true,
          section: { deletedAt: null },
        },
        include: {
          lessonAssets: {
            orderBy: { position: 'asc' },
            include: { asset: true },
          },
        },
      }),
    );
  }

  /** Authorized lesson body + resource metadata. Signed links are requested separately (media). */
  async lesson(actor: Actor, enrollmentId: string, lessonId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, userId: actor.id },
    });
    if (!enrollment) throw new ForbiddenException('Lesson access denied');
    const lesson = await this.publishedLesson(this.prisma, enrollment, lessonId);
    const access = await this.policy.evaluate({
      workspaceId: enrollment.workspaceId,
      userId: actor.id,
      enrollmentId,
      lessonId,
      at: this.clock.now().toISOString(),
    });
    if (!access.allowed) accessDenied(access);
    const progress = await this.prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    });
    const assessment = await this.prisma.assessment.findFirst({
      where: {
        lessonId,
        workspaceId: enrollment.workspaceId,
        courseId: enrollment.courseId,
        deletedAt: null,
      },
      select: { id: true },
    });
    return learnerLessonSchema.parse({
      assessmentId: assessment?.id ?? null,
      lessonId: lesson.id,
      title: lesson.title,
      payload: lessonPayloadSchema.parse({ type: lesson.type, body: lesson.body }),
      assets: lesson.lessonAssets
        .filter((la) => la.asset.status === 'READY' && !la.asset.deletedAt)
        .map((la) => ({
          assetId: la.asset.id,
          filename: la.asset.filename,
          mimeType: la.asset.mimeType,
          purpose: la.purpose,
        })),
      progress: progress ? progressDto(progress) : null,
    });
  }

  /** Learner-reported activity. Never accepts or derives grades/pass state from the client. */
  async progress(actor: Actor, enrollmentId: string, lessonId: string, update: ProgressUpdate) {
    return this.prisma.$transaction(
      async (tx) => {
        const head = await this.own(tx, actor, enrollmentId);
        await lockEnrollmentRow(tx, head.workspaceId, enrollmentId);
        const enrollment = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
        const lesson = await this.publishedLesson(tx, enrollment, lessonId);
        const now = this.clock.now();
        const access = await this.policy.evaluate(
          {
            workspaceId: enrollment.workspaceId,
            userId: actor.id,
            enrollmentId,
            lessonId,
            at: now.toISOString(),
          },
          tx,
        );
        if (!access.allowed) accessDenied(access);
        if (update.type === 'PLAYBACK' && lesson.type !== 'VIDEO')
          semantic('PROGRESS_NOT_APPLICABLE', 'Playback progress only applies to video lessons');

        const occurredAt =
          update.type === 'PLAYBACK' ? clampOccurredAt(new Date(update.occurredAt), now) : now;
        // Event-ID dedupe: a replayed heartbeat is acknowledged without moving progress again.
        const inserted = await tx.activityEvent.createMany({
          data: [
            {
              workspaceId: enrollment.workspaceId,
              eventId: update.eventId,
              type: `lesson.${update.type.toLowerCase()}`,
              occurredAt,
              userId: actor.id,
              courseId: enrollment.courseId,
              lessonId,
              enrollmentId,
              properties:
                update.type === 'PLAYBACK'
                  ? {
                      positionSeconds: update.positionSeconds,
                      elapsedSeconds: update.elapsedSeconds,
                    }
                  : {},
            },
          ],
          skipDuplicates: true,
        });
        const existing = await tx.lessonProgress.findUnique({
          where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
        });
        if (inserted.count === 0 && existing) return progressDto(existing);

        const snapshot = await this.completion.ensureStarted(tx, enrollment, now);
        const fresh = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
        const criteria = snapshot.criteria[lessonId] ?? {
          rule: lesson.completionRule,
          requiredWatchPercent: lesson.requiredWatchPercent,
        };

        let position = existing?.positionSeconds ?? 0;
        let watched = existing?.watchedSeconds ?? 0;
        let percent = existing ? percentToNumber(existing.completionPercent) : 0;
        let complete = Boolean(existing?.completedAt);
        if (update.type === 'PLAYBACK') {
          const duration = await this.videoDuration(tx, lesson);
          const credit = playbackCredit({
            claimedElapsedSeconds: update.elapsedSeconds,
            lastContactAt: existing?.lastViewedAt ?? null,
            now,
          });
          position = duration ? Math.min(update.positionSeconds, duration) : update.positionSeconds;
          watched = duration ? Math.min(duration, watched + credit) : watched + credit;
          if (duration) percent = Math.max(percent, Number(floorPercent(watched, duration)));
          if (
            criteria.rule === 'WATCH_PERCENT' &&
            duration &&
            percent >= criteria.requiredWatchPercent
          )
            complete = true;
        }
        const completesByRule =
          (update.type === 'ACKNOWLEDGE' && criteria.rule === 'ACKNOWLEDGE') ||
          ((update.type === 'VIEW' || update.type === 'PLAYBACK') && criteria.rule === 'VIEW');
        if (completesByRule) complete = true;

        const row = await tx.lessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
          create: {
            workspaceId: enrollment.workspaceId,
            courseId: enrollment.courseId,
            enrollmentId,
            lessonId,
            positionSeconds: position,
            watchedSeconds: watched,
            completionPercent: new Prisma.Decimal(percent),
            lastViewedAt: now,
          },
          update: {
            positionSeconds: position,
            watchedSeconds: watched,
            completionPercent: new Prisma.Decimal(percent),
            lastViewedAt: now,
          },
        });
        let result = row;
        if (complete && !row.completedAt) {
          await this.completion.completeLesson(tx, enrollment, lessonId, now);
          result = await tx.lessonProgress.findUniqueOrThrow({ where: { id: row.id } });
        }
        await tx.enrollment.update({ where: { id: enrollmentId }, data: { lastActivityAt: now } });
        await this.completion.recompute(tx, fresh, now);
        return progressDto(result);
      },
      { timeout: 20000 },
    );
  }

  private async videoDuration(
    tx: Tx,
    lesson: {
      body: Prisma.JsonValue;
      lessonAssets: { asset: { status: string; metadata: Prisma.JsonValue } }[];
    },
  ): Promise<number | null> {
    const own = (lesson.body as { durationSeconds?: unknown } | null)?.durationSeconds;
    if (typeof own === 'number' && own > 0) return Math.floor(own);
    for (const la of lesson.lessonAssets) {
      const d = (la.asset.metadata as { durationSeconds?: unknown } | null)?.durationSeconds;
      if (la.asset.status === 'READY' && typeof d === 'number' && d > 0) return Math.floor(d);
    }
    void tx;
    return null;
  }

  /** Released results for the learner's own attempts; historical access is allowed after expiry. */
  async results(actor: Actor, enrollmentId: string) {
    const enrollment = await this.own(this.prisma, actor, enrollmentId);
    if (!this.attempts) return [];
    const graded = await this.prisma.assessmentAttempt.findMany({
      where: { enrollmentId, workspaceId: enrollment.workspaceId, status: 'GRADED' },
      orderBy: [{ gradedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
      take: 200,
    });
    const out = [];
    for (const a of graded) {
      try {
        out.push(await this.attempts.result(actor.id, a.id));
      } catch (error) {
        const code =
          error instanceof ConflictException
            ? (error.getResponse() as { code?: string }).code
            : undefined;
        if (code !== 'GRADE_NOT_RELEASED') throw error;
      }
    }
    return out;
  }
}

export function progressDto(row: Prisma.LessonProgressGetPayload<object>) {
  return lessonProgressSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    enrollmentId: row.enrollmentId,
    lessonId: row.lessonId,
    positionSeconds: row.positionSeconds,
    watchedSeconds: row.watchedSeconds,
    completionPercent: row.completionPercent.toString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    lastViewedAt: row.lastViewedAt?.toISOString() ?? null,
  });
}
