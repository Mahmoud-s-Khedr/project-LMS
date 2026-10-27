import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { AuthorQuestionPayload, QuestionResponse, AssessmentVersionConfig } from '@lms/shared';

export const ASSESSMENT_ACCESS_POLICY = Symbol.for('lms.learning.AccessPolicy');
export function bad(message: string): never {
  throw new BadRequestException({ code: 'SEMANTIC_RULE_FAILED', message });
}
export function conflict(message: string, code = 'VERSION_CONFLICT'): never {
  throw new ConflictException({ code, message });
}
export const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
export const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Keyed ordering is stable across processes and does not depend on Math.random or database order. */
export function shuffled<T>(
  values: readonly T[],
  seed: string,
  scope: string,
  key: (item: T) => string,
): T[] {
  const rank = (item: T) =>
    createHmac('sha256', seed)
      .update(`${scope}:${key(item)}`)
      .digest('hex');
  return [...values].sort((a, b) => rank(a).localeCompare(rank(b)) || key(a).localeCompare(key(b)));
}
export interface DrawCandidate {
  id: string;
  questionId: string;
}
export interface DrawPool {
  id: string;
  count: number;
  candidates: DrawCandidate[];
}
/** Bipartite augmenting paths prove feasibility even when pools overlap. Identity is the question root. */
export function draw(
  fixed: DrawCandidate[],
  pools: DrawPool[],
  seed: string,
): Map<string, string[]> {
  const reserved = new Set(fixed.map((q) => q.questionId));
  if (reserved.size !== fixed.length) bad('A question cannot occur twice');
  if (fixed.length + pools.reduce((n, p) => n + p.count, 0) > 500)
    bad('Assessment exceeds 500 items');
  const slots = pools.flatMap((p) =>
    Array.from({ length: p.count }, (_, i) => ({
      key: `${p.id}:${i}`,
      pool: p,
      candidates: shuffled(
        p.candidates.filter((q) => !reserved.has(q.questionId)),
        seed,
        p.id,
        (q) => q.id,
      ),
    })),
  );
  const owner = new Map<string, number>();
  const chosen = new Map<number, DrawCandidate>();
  function visit(index: number, seen: Set<string>): boolean {
    for (const q of slots[index]!.candidates) {
      if (seen.has(q.questionId)) continue;
      seen.add(q.questionId);
      const previous = owner.get(q.questionId);
      if (previous === undefined || visit(previous, seen)) {
        owner.set(q.questionId, index);
        chosen.set(index, q);
        return true;
      }
    }
    return false;
  }
  for (let i = 0; i < slots.length; i++)
    if (!visit(i, new Set())) bad('Pools cannot draw enough unique questions');
  const result = new Map<string, string[]>();
  slots.forEach((slot, i) =>
    result.set(slot.pool.id, [...(result.get(slot.pool.id) ?? []), chosen.get(i)!.id]),
  );
  return result;
}

export function validateResponse(payload: AuthorQuestionPayload, response: QuestionResponse): void {
  if (payload.type !== response.type) bad('Response type does not match question');
  const keys = new Set(payload.options.map((o) => o.key));
  if (response.type === 'SINGLE_CHOICE' && !keys.has(response.optionKey)) bad('Unknown option');
  if (
    (response.type === 'MULTIPLE_CHOICE' || response.type === 'ORDERING') &&
    response.optionKeys.some((k) => !keys.has(k))
  )
    bad('Unknown option');
  if (response.type === 'MATCHING') {
    const left = new Set(payload.options.filter((o) => o.group === 'LEFT').map((o) => o.key));
    const right = new Set(payload.options.filter((o) => o.group === 'RIGHT').map((o) => o.key));
    if (response.pairs.some((p) => !left.has(p.leftKey) || !right.has(p.rightKey)))
      bad('Unknown matching option');
  }
}

/** Decimal arithmetic throughout, including tolerance and bounded partial credit. */
export function score(
  payload: AuthorQuestionPayload,
  response: QuestionResponse | null,
  points: string,
): { points: string | null; correct: boolean | null } {
  if (payload.type === 'ESSAY' || payload.type === 'FILE_UPLOAD')
    return { points: null, correct: null };
  if (!response) return { points: '0', correct: false };
  validateResponse(payload, response);
  let fraction = decimal(0);
  if (payload.type === 'SINGLE_CHOICE' && response.type === payload.type)
    fraction = decimal(Number(payload.answerKey.correctOptionKeys[0] === response.optionKey));
  if (payload.type === 'TRUE_FALSE' && response.type === payload.type)
    fraction = decimal(Number(payload.answerKey.value === response.value));
  if (payload.type === 'NUMERIC' && response.type === payload.type)
    fraction = decimal(
      Number(
        decimal(response.value)
          .minus(payload.answerKey.value)
          .abs()
          .lte(payload.answerKey.absoluteTolerance),
      ),
    );
  if (payload.type === 'SHORT_ANSWER' && response.type === payload.type) {
    const normalize = (s: string) => {
      let v = s.normalize('NFKC');
      if (payload.gradingConfig.trim) v = v.trim();
      if (payload.gradingConfig.collapseWhitespace) v = v.replace(/\s+/gu, ' ');
      return payload.gradingConfig.caseSensitive ? v : v.toLocaleLowerCase('en-US');
    };
    fraction = decimal(
      Number(payload.answerKey.accepted.some((s) => normalize(s) === normalize(response.text))),
    );
  }
  if (payload.type === 'MULTIPLE_CHOICE' && response.type === payload.type) {
    const correct = new Set(payload.answerKey.correctOptionKeys);
    const hits = response.optionKeys.filter((k) => correct.has(k)).length;
    const wrong = response.optionKeys.length - hits;
    fraction = payload.gradingConfig.partialCredit
      ? Prisma.Decimal.max(0, decimal(hits - wrong).div(correct.size))
      : decimal(Number(hits === correct.size && wrong === 0));
  }
  if (payload.type === 'MATCHING' && response.type === payload.type) {
    const hits = payload.answerKey.pairs.filter((k) =>
      response.pairs.some((p) => p.leftKey === k.leftKey && p.rightKey === k.rightKey),
    ).length;
    fraction = payload.gradingConfig.partialCredit
      ? decimal(hits).div(payload.answerKey.pairs.length)
      : decimal(Number(hits === payload.answerKey.pairs.length));
  }
  if (payload.type === 'ORDERING' && response.type === payload.type) {
    const hits = payload.answerKey.optionKeys.filter((k, i) => response.optionKeys[i] === k).length;
    fraction = decimal(
      Number(hits === payload.answerKey.optionKeys.length && hits === response.optionKeys.length),
    );
  }
  return {
    points: decimal(points).mul(fraction).toDecimalPlaces(3, Prisma.Decimal.ROUND_DOWN).toString(),
    correct: fraction.eq(1),
  };
}
export function deadline(
  config: AssessmentVersionConfig,
  now: Date,
  extraTime: number,
  until: Date | null,
): Date | null {
  const times = [
    config.timeLimitSeconds === null
      ? null
      : now.getTime() + (config.timeLimitSeconds + extraTime) * 1000,
    until?.getTime() ?? null,
  ].filter((v): v is number => v !== null);
  return times.length ? new Date(Math.min(...times)) : null;
}
export function released(
  config: AssessmentVersionConfig,
  gradedAt: Date | null,
  now: Date,
): boolean {
  if (!gradedAt || config.feedbackPolicy === 'NEVER') return false;
  return (
    config.feedbackPolicy !== 'AFTER_DUE' ||
    (!!config.dueAt && now.getTime() >= Date.parse(config.dueAt))
  );
}

export const assessmentEtag = (row: { id: string; updatedAt: Date | string }) =>
  `"${row.id}:${new Date(row.updatedAt).getTime()}"`;
export function checkAssessmentEtag(row: { id: string; updatedAt: Date }, supplied?: string) {
  if (!supplied)
    throw new HttpException(
      { code: 'PRECONDITION_REQUIRED', message: 'If-Match is required' },
      428,
    );
  if (supplied !== assessmentEtag(row)) conflict('Resource changed; reload before editing');
}
export const nextUpdate = (previous: Date) =>
  new Date(Math.max(Date.now(), previous.getTime() + 1));

export const ASSESSMENT_PUBLISH_VALIDATOR = Symbol.for('lms.assessments.PublishValidator');
