import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  type QuestionBank,
  type Question,
  type QuestionVersion,
  type QuestionOption,
  type AssessmentVersion,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  authorQuestionPayloadSchema,
  assessmentVersionConfigSchema,
  cursorPayloadSchema,
  type AuthorQuestionPayload,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService, type CourseCapability } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { AuditService } from '../audit/audit.service';
import { bad, iso, json, decimal } from './assessment-domain';
export type Tx = Prisma.TransactionClient;
export type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
export type FullQuestionVersion = QuestionVersion & { questionOptions: QuestionOption[] };
export const versionInclude = { questionOptions: { orderBy: { position: 'asc' as const } } };
export function payload(v: FullQuestionVersion): AuthorQuestionPayload {
  return authorQuestionPayloadSchema.parse({
    type: v.type,
    prompt: v.prompt,
    answerKey: v.answerKey,
    explanation: v.explanation,
    defaultPoints: v.defaultPoints.toString(),
    gradingConfig: v.gradingConfig,
    options: v.questionOptions.map((o) => ({
      key: o.key,
      position: o.position,
      ...(o.content as object),
    })),
  });
}
export function questionVersionDto(v: FullQuestionVersion) {
  return {
    id: v.id,
    workspaceId: v.workspaceId,
    questionId: v.questionId,
    version: v.version,
    createdAt: v.createdAt.toISOString(),
    payload: payload(v),
  };
}
export const entityDto = (r: {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}) => ({
  id: r.id,
  workspaceId: r.workspaceId,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
export const bankDto = (r: QuestionBank) => ({
  ...entityDto(r),
  name: r.name,
  description: r.description,
  createdById: r.createdById,
});
export function questionDto(r: Question & { questionVersions: FullQuestionVersion[] }) {
  return {
    ...entityDto(r),
    bankId: r.bankId,
    createdById: r.createdById,
    title: r.title,
    tags: r.tags,
    archivedAt: iso(r.archivedAt),
    latestVersion: questionVersionDto(r.questionVersions[0]!),
  };
}
export function configDto(r: AssessmentVersion) {
  return assessmentVersionConfigSchema.parse({
    ...Object.fromEntries(
      Object.keys(assessmentVersionConfigSchema.shape).map((k) => [
        k,
        r[k as keyof AssessmentVersion],
      ]),
    ),
    availableFrom: iso(r.availableFrom),
    availableUntil: iso(r.availableUntil),
    dueAt: iso(r.dueAt),
    maxUploadBytes: r.maxUploadBytes.toString(),
    passPercent: r.passPercent.toString(),
    latePenaltyPercent: r.latePenaltyPercent.toString(),
  });
}
export const assessmentVersionDto = (r: AssessmentVersion) => ({
  ...entityDto(r),
  ...configDto(r),
  assessmentId: r.assessmentId,
  version: r.version,
  status: r.status,
  publishedAt: iso(r.publishedAt),
});
export function pageScope(
  scope: unknown,
  cursor?: string,
): { after?: { createdAt: Date; id: string }; hash: string } {
  const hash = createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  if (!cursor) return { hash };
  try {
    const p = cursorPayloadSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
    const date = new Date(p.value);
    if (p.filterHash !== hash || p.sort !== 'createdAt' || Number.isNaN(date.getTime()))
      throw new Error();
    return { hash, after: { createdAt: date, id: p.id } };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
}
export function page<T extends { id: string; createdAt: Date }, R>(
  rows: T[],
  limit: number,
  hash: string,
  project: (row: T) => R,
) {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    data: selected.map(project),
    meta: {
      hasMore,
      limit,
      nextCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({
                revision: 1,
                sort: 'createdAt',
                value: last.createdAt.toISOString(),
                id: last.id,
                filterHash: hash,
              }),
            ).toString('base64url')
          : null,
    },
  };
}
export const afterWhere = (after?: { createdAt: Date; id: string }) =>
  after
    ? {
        OR: [
          { createdAt: { gt: after.createdAt } },
          { createdAt: after.createdAt, id: { gt: after.id } },
        ],
      }
    : {};
export const pageOrder = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
@Injectable()
export class AssessmentRepository {
  constructor(
    readonly prisma: PrismaService,
    readonly policy: PolicyService,
    readonly audit: AuditService,
  ) {}
  async course(
    actor: Actor,
    workspaceId: string,
    courseId: string,
    capability: CourseCapability = 'edit',
  ) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, workspaceId, deletedAt: null },
    });
    if (!course || !(await this.policy.canManageCourse(actor, course, capability)))
      throw new NotFoundException();
    return course;
  }
  async bank(actor: Actor, workspaceId: string, bankId: string, tx: Tx = this.prisma) {
    const bank = await tx.questionBank.findFirst({
      where: { id: bankId, workspaceId, deletedAt: null },
    });
    if (!bank) throw new NotFoundException();
    if (await this.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])) return bank;
    if (
      bank.createdById === actor.id &&
      (await this.policy.hasWorkspaceRole(actor, workspaceId, ['INSTRUCTOR']))
    )
      return bank;
    // A TA can use a bank only through an assessment reference in a course they can edit.
    if (await this.policy.hasWorkspaceRole(actor, workspaceId, ['TEACHING_ASSISTANT'])) {
      const refs = await tx.assessment.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          OR: [
            { assessmentVersions: { some: { assessmentPools: { some: { bankId } } } } },
            {
              assessmentVersions: {
                some: {
                  assessmentQuestions: { some: { questionVersion: { question: { bankId } } } },
                },
              },
            },
          ],
        },
        select: { courseId: true },
      });
      for (const ref of refs)
        if (await this.policy.canManageCourse(actor, { id: ref.courseId, workspaceId }, 'edit'))
          return bank;
    }
    throw new NotFoundException();
  }
  async lock(tx: Tx, scope: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  }
  async auditChange(
    tx: Tx,
    actor: Actor | null,
    workspaceId: string,
    id: string,
    action: string,
    requestId: string = randomUUID(),
  ) {
    await this.audit.append(tx, {
      actorId: actor?.id ?? null,
      workspaceId,
      resourceType: 'Assessment',
      resourceId: id,
      action,
      requestId,
    });
  }
  async createQuestionVersion(
    tx: Tx,
    workspaceId: string,
    questionId: string,
    version: number,
    input: AuthorQuestionPayload,
  ) {
    const v = authorQuestionPayloadSchema.parse(input);
    if (decimal(v.defaultPoints).gt('9999999.999'))
      bad('Default points exceed supported precision');
    if (v.type === 'MATCHING' && !v.answerKey.pairs.length)
      bad('Matching requires at least one pair');
    const created = await tx.questionVersion.create({
      data: {
        workspaceId,
        questionId,
        version,
        type: v.type,
        prompt: json(v.prompt),
        answerKey: json(v.answerKey),
        gradingConfig: json(v.gradingConfig),
        explanation: v.explanation === null ? Prisma.DbNull : json(v.explanation),
        defaultPoints: v.defaultPoints,
      },
    });
    await tx.questionOption.createMany({
      data: v.options.map((o) => ({
        workspaceId,
        questionVersionId: created.id,
        key: o.key,
        position: o.position,
        content: json({ content: o.content, ...(o.group ? { group: o.group } : {}) }),
      })),
    });
    return tx.questionVersion.findUniqueOrThrow({
      where: { id: created.id },
      include: versionInclude,
    });
  }
}
