import { randomUUID } from 'node:crypto';

export function createCourseFixture(overrides: Partial<any> = {}) {
  const id = overrides.id ?? randomUUID();
  return {
    id,
    title: 'Production Software Engineering',
    slug: `prod-eng-${id.slice(0, 8)}`,
    summary: 'A comprehensive engineering masterclass.',
    description: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Master modern scalable systems.' }],
        },
      ],
    },
    level: 'INTERMEDIATE',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    isFree: false,
    ...overrides,
  };
}

export function createQuizFixture(overrides: Partial<any> = {}) {
  const assessmentId = overrides.id ?? randomUUID();
  return {
    id: assessmentId,
    title: 'Architecture & Concurrency Quiz',
    kind: 'QUIZ',
    timeLimitSeconds: 1800, // 30 minutes
    maxAttempts: 2,
    passingScorePercent: '80.00',
    questions: [
      {
        type: 'SINGLE_CHOICE',
        prompt: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'What prevents refresh token replay?' }],
            },
          ],
        },
        points: '10.00',
        options: [
          { key: 'a', text: 'Family-wide revocation upon second use' },
          { key: 'b', text: 'Ignoring reuse attempts' },
          { key: 'c', text: 'Increasing token expiry' },
        ],
        answerKey: { correctOptionKeys: ['a'] },
      },
    ],
    ...overrides,
  };
}

export function createAssignmentFixture(overrides: Partial<any> = {}) {
  const assessmentId = overrides.id ?? randomUUID();
  return {
    id: assessmentId,
    title: 'System Design Submission',
    kind: 'ASSIGNMENT',
    maxAttempts: 1,
    passingScorePercent: '70.00',
    rubric: {
      criteria: [
        { id: 'crit-arch', label: 'Architecture soundness', maxPoints: '50.00' },
        { id: 'crit-sec', label: 'Security & idempotency', maxPoints: '50.00' },
      ],
    },
    questions: [
      {
        type: 'ESSAY',
        prompt: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Submit your architectural review.' }],
            },
          ],
        },
        points: '100.00',
      },
    ],
    ...overrides,
  };
}

export function createOrderQuoteFixture(overrides: Partial<any> = {}) {
  const subtotal = overrides.subtotal ?? 10000;
  const discountTotal = overrides.discountTotal ?? 2000;
  const taxTotal = overrides.taxTotal ?? 800;
  const grandTotal = subtotal - discountTotal + taxTotal;

  return {
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal,
    currency: 'usd',
    items: [
      {
        priceId: overrides.priceId ?? randomUUID(),
        unitAmount: subtotal,
        quantity: 1,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        totalAmount: grandTotal,
      },
    ],
    ...overrides,
  };
}
