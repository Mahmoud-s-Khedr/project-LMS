import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as c from '../src';

const ids = c.fixtureIds;
const jsonRoundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const doc = c.fixtureDocument;
const option = (key: string, position: number) => ({ key, position, content: doc });
const questionBase = { prompt: doc, explanation: null, defaultPoints: '1.000' };

describe('frozen contracts and serialization', () => {
  it('matches every canonical Prisma enum without importing Prisma', () => {
    const prisma = readFileSync(
      new URL('../../../apps/api/prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    for (const match of prisma.matchAll(/enum (\w+) \{([^}]+)\}/g)) {
      const [, name = '', body = ''] = match;
      const schemaName = `${name[0]?.toLowerCase()}${name.slice(1)}Schema`;
      const schema = (c as Record<string, unknown>)[schemaName] as
        { options?: string[] } | undefined;
      expect(schema, `${name} schema exported`).toBeDefined();
      expect(schema?.options, name).toEqual(body.trim().split(/\s+/));
    }
  });
  it('roundtrips all HTTP fixtures, preserving decimals and counts above Number.MAX_SAFE_INTEGER', () => {
    for (const fixture of Object.values(c.httpFixtures))
      expect(fixture.schema.parse(jsonRoundTrip(fixture.body))).toEqual(fixture.body);
    expect(
      c.courseAnalyticsResponseSchema.parse(jsonRoundTrip(c.courseDashboardFixture)).data
        .learningSeconds,
    ).toBe('9007199254740993');
    expect(
      c.releasedResultResponseSchema.parse(jsonRoundTrip(c.releasedResultFixture)).data
        .awardedPoints,
    ).toBe('8.500');
    expect(c.decimalSchema.safeParse(8.5).success).toBe(false);
    expect(c.digitStringSchema.safeParse(9007199254740993n).success).toBe(false);
    expect(c.timestampSchema.safeParse(new Date()).success).toBe(false);
  });
  it.each(['1e3', 'NaN', 'Infinity', '01', '0x10', '-1'])(
    'rejects noncanonical digit string %s',
    (value) => {
      expect(c.digitStringSchema.safeParse(value).success).toBe(false);
    },
  );
  it('bounds database BigInt, money, percentage, UTC times and real calendar dates', () => {
    expect(c.digitStringSchema.safeParse('9223372036854775808').success).toBe(false);
    for (const value of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(c.moneySchema.safeParse(value).success).toBe(false);
    for (const value of ['-1', '100.01', '1e2', '1.001'])
      expect(c.percentSchema.safeParse(value).success).toBe(false);
    expect(c.percentSchema.parse('100.00')).toBe('100.00');
    expect(c.timestampSchema.safeParse('2026-10-26T10:00:00+02:00').success).toBe(false);
    expect(c.dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(c.timezoneSchema.safeParse('Mars/Base').success).toBe(false);
    expect(c.timezoneSchema.parse('Africa/Cairo')).toBe('Africa/Cairo');
    expect(c.currencySchema.safeParse('USD').success).toBe(false);
  });
  it('distinguishes omitted fields and explicit nullable PATCH changes', () => {
    expect(c.courseUpdateSchema.parse({ version: 1, coverId: null })).toEqual({
      version: 1,
      coverId: null,
    });
    expect(c.courseUpdateSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(c.courseUpdateSchema.safeParse({ title: 'Updated' }).success).toBe(false);
    expect(c.courseUpdateSchema.safeParse({ version: 1, title: null }).success).toBe(false);
    expect(c.workspaceUpdateSchema.safeParse({}).success).toBe(false);
    expect(c.workspaceUpdateSchema.safeParse({ ownerId: ids.user }).success).toBe(false);
  });
});

describe('untrusted queries, headers and payloads', () => {
  it.each([null, false, true, '', ' ', '1.5', '1e2', [], {}, '0x10'])(
    'rejects query number coercion traps: %j',
    (limit) => {
      expect(c.cursorQuerySchema.safeParse({ limit }).success).toBe(false);
    },
  );
  it('disallows mixed pagination, arbitrary filters/sorts, cursor ambiguity and inconsistent metadata', () => {
    expect(c.cursorQuerySchema.safeParse({ page: 1 }).success).toBe(false);
    expect(c.pageQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(false);
    expect(c.catalogCoursesQuerySchema.safeParse({ sort: 'passwordHash' }).success).toBe(false);
    expect(c.catalogCoursesQuerySchema.safeParse({ include: { users: true } }).success).toBe(false);
    expect(
      c.cursorMetaSchema.safeParse({ nextCursor: null, hasMore: true, limit: 20 }).success,
    ).toBe(false);
    expect(
      c.pageMetaSchema.safeParse({ page: 1, pageSize: 20, total: 21, totalPages: 1 }).success,
    ).toBe(false);
    expect(c.cursorQuerySchema.safeParse({ cursor: '../other-tenant' }).success).toBe(false);
    expect(
      c.analyticsQuerySchema.safeParse({ from: '2026-10-27T00:00:00Z', to: '2026-10-26T00:00:00Z' })
        .success,
    ).toBe(false);
  });
  it('requires optimistic versions and bounded idempotency/edit keys', () => {
    expect(c.versionInputSchema.safeParse({ version: 0 }).success).toBe(false);
    expect(c.idempotencyKeySchema.safeParse('too-short').success).toBe(false);
    expect(c.idempotencyKeySchema.safeParse('a'.repeat(129)).success).toBe(false);
    expect(c.idempotencyKeySchema.parse(ids.event)).toBe(ids.event);
    expect(c.ifMatchSchema.safeParse('*').success).toBe(false);
    expect(c.ifMatchSchema.safeParse('"bad\r\nheader"').success).toBe(false);
    expect(c.reorderSchema.safeParse({ ids: [ids.lesson, ids.lesson] }).success).toBe(false);
  });
  it.each([
    '//evil.test',
    'https://evil.test',
    '/\\evil',
    '/student/%2f%2fevil',
    '/student/\nevil',
    '/anything',
    '/student#secret',
  ])('rejects unsafe redirect %s', (path) => {
    expect(c.applicationPathSchema.safeParse(path).success).toBe(false);
  });
  it('accepts canonical checkout and rejects client prices, IDs, quantities and duplicate cohort selections', () => {
    const input = {
      items: [{ priceId: ids.price }],
      successPath: '/student/orders',
      cancelPath: '/catalog',
    };
    expect(c.checkoutSessionInputSchema.parse(input)).toEqual(input);
    for (const extra of [
      { currency: 'usd' },
      { userId: ids.user },
      { unitAmount: 1 },
      { stripeCustomerId: 'cus_bad' },
    ])
      expect(c.checkoutSessionInputSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(
      c.checkoutSessionInputSchema.safeParse({
        ...input,
        items: [{ priceId: ids.price, quantity: 2 }],
      }).success,
    ).toBe(false);
    expect(
      c.checkoutSessionInputSchema.safeParse({
        ...input,
        items: [{ priceId: ids.price }, { priceId: ids.price }],
      }).success,
    ).toBe(false);
    expect(
      c.checkoutSessionInputSchema.safeParse({
        ...input,
        items: [
          {
            priceId: ids.price,
            cohorts: [
              { courseId: ids.course, cohortId: ids.course },
              { courseId: ids.course, cohortId: ids.course },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      c.checkoutSessionResponseSchema.safeParse({
        data: { orderId: ids.order, checkoutUrl: null, expiresAt: c.fixtureTimestamp },
      }).success,
    ).toBe(false);
  });
  it('reconciles monetary line/quote/refund totals', () => {
    expect(
      c.checkoutQuoteResponseSchema.safeParse({
        data: { ...c.checkoutQuoteFixture.data, grandTotal: 1 },
      }).success,
    ).toBe(false);
    expect(
      c.checkoutQuoteResponseSchema.safeParse({
        data: {
          ...c.checkoutQuoteFixture.data,
          items: [{ ...c.checkoutQuoteFixture.data.items[0], totalAmount: 1 }],
        },
      }).success,
    ).toBe(false);
    expect(
      c.refundInputSchema.safeParse({
        amount: 20,
        reason: 'Requested',
        revokeAccess: false,
        items: [{ orderItemId: ids.order, amount: 10, revokeAccess: false }],
      }).success,
    ).toBe(false);
    expect(
      c.priceCreateSchema.safeParse({
        amount: 100,
        currency: 'usd',
        interval: null,
        intervalCount: 1,
        trialDays: 5,
        isActive: true,
      }).success,
    ).toBe(false);
    expect(
      c.revenueMetricSchema.safeParse({ currency: 'usd', paid: 100, refunded: 10, net: 100 })
        .success,
    ).toBe(false);
  });
  it('binds uploads to parent and safe declared metadata, with strict submission limits', () => {
    const upload = {
      purpose: 'SUBMISSION',
      parentId: ids.attempt,
      filename: 'answer.pdf',
      mimeType: 'application/pdf',
      sizeBytes: '10485760',
      sha256: 'a'.repeat(64),
    };
    expect(c.assetUploadSchema.parse(upload)).toEqual(upload);
    for (const extra of [
      { sizeBytes: '10485761' },
      { mimeType: 'text/html' },
      { filename: '../secret' },
      { bucket: 'public' },
      { objectKey: 'other-user' },
    ])
      expect(c.assetUploadSchema.safeParse({ ...upload, ...extra }).success).toBe(false);
  });
});

describe('learner/author boundaries', () => {
  it('rejects secret fields anywhere in learner question delivery', () => {
    const data = c.timedAssessmentFixture.data;
    const question = data.questions[0];
    for (const field of [
      'answerKey',
      'explanation',
      'gradingConfig',
      'correctOptionKeys',
      'rubric',
      'randomSeed',
      'isCorrect',
    ])
      expect(
        c.attemptStartSchema.safeParse({ ...data, questions: [{ ...question, [field]: {} }] })
          .success,
        field,
      ).toBe(false);
    expect(c.attemptStartSchema.safeParse({ ...data, randomSeed: 'private' }).success).toBe(false);
    expect(
      c.attemptStartSchema.safeParse({
        ...data,
        questions: [{ ...question, options: [{ ...question?.options[0], isCorrect: true }] }],
      }).success,
    ).toBe(false);
    expect(
      c.learnerAttemptSchema.safeParse({ ...c.manualAssessmentFixture.data, awardedPoints: '8' })
        .success,
    ).toBe(false);
    expect(
      c.savedAnswerSchema.safeParse({
        ...c.manualAssessmentFixture.data.answers[0],
        feedback: 'Early release',
      }).success,
    ).toBe(false);
  });
  it('rejects privileged fields in public catalog, outline, certificates and asset projections', () => {
    expect(
      c.publicCourseSchema.safeParse({ ...c.catalogFixture.data[0], createdById: ids.user })
        .success,
    ).toBe(false);
    const section = c.lockedOutlineFixture.data.sections[0];
    expect(
      c.learnerOutlineSchema.safeParse({
        enrollmentId: ids.enrollment,
        sections: [{ ...section, lessons: [{ ...section?.lessons[0], body: doc }] }],
      }).success,
    ).toBe(false);
    expect(
      c.certificateVerificationSchema.safeParse({
        ...c.certificateVerificationFixture.data,
        email: 'a@example.test',
      }).success,
    ).toBe(false);
    expect(c.assetSchema.safeParse({ objectKey: 'private/key' }).success).toBe(false);
  });
  it('implements all nine response variants and rejects key/type confusion', () => {
    const responses = [
      { type: 'SINGLE_CHOICE', optionKey: 'a' },
      { type: 'MULTIPLE_CHOICE', optionKeys: ['a', 'b'] },
      { type: 'TRUE_FALSE', value: false },
      { type: 'SHORT_ANSWER', text: '' },
      { type: 'NUMERIC', value: '12.50' },
      { type: 'ESSAY', document: doc },
      { type: 'FILE_UPLOAD', note: '' },
      { type: 'MATCHING', pairs: [{ leftKey: 'l1', rightKey: 'r2' }] },
      { type: 'ORDERING', optionKeys: ['b', 'a'] },
    ];
    for (const response of responses)
      expect(c.questionResponseSchema.parse(response)).toEqual(response);
    expect(c.questionResponseSchema.safeParse({ type: 'TRUE_FALSE', optionKey: 'a' }).success).toBe(
      false,
    );
    expect(c.questionResponseSchema.safeParse({ type: 'NUMERIC', value: 12.5 }).success).toBe(
      false,
    );
    expect(
      c.questionResponseSchema.safeParse({ type: 'MULTIPLE_CHOICE', optionKeys: ['a', 'a'] })
        .success,
    ).toBe(false);
    expect(
      c.answerSaveSchema.safeParse({
        version: 1,
        response: responses[0],
        attachmentIds: [ids.lesson],
      }).success,
    ).toBe(false);
    expect(
      c.answerSaveSchema.safeParse({
        version: 1,
        response: responses[6],
        attachmentIds: Array(6).fill(ids.lesson),
      }).success,
    ).toBe(false);
  });
  it('validates author keys against options and keeps manual keys empty', () => {
    const author = {
      ...questionBase,
      type: 'SINGLE_CHOICE',
      options: [option('a', 0), option('b', 1)],
      answerKey: { correctOptionKeys: ['a'] },
      gradingConfig: {},
    };
    expect(c.authorQuestionPayloadSchema.parse(author)).toEqual(author);
    expect(
      c.authorQuestionPayloadSchema.safeParse({
        ...author,
        answerKey: { correctOptionKeys: ['missing'] },
      }).success,
    ).toBe(false);
    expect(
      c.authorQuestionPayloadSchema.safeParse({
        ...author,
        options: [option('a', 0), option('a', 1)],
      }).success,
    ).toBe(false);
    expect(
      c.authorQuestionPayloadSchema.safeParse({ ...author, type: 'ESSAY', options: [] }).success,
    ).toBe(false);
    expect(
      c.authorQuestionPayloadSchema.safeParse({
        ...author,
        type: 'ORDERING',
        answerKey: { optionKeys: ['a'] },
      }).success,
    ).toBe(false);
    expect(
      c.authorQuestionPayloadSchema.safeParse({
        ...questionBase,
        type: 'NUMERIC',
        options: [],
        answerKey: { value: '12.5', absoluteTolerance: '-1' },
        gradingConfig: {},
      }).success,
    ).toBe(false);
    expect(
      c.rubricSchema.safeParse({
        criteria: [
          { id: 'x', label: 'One', maxPoints: '1' },
          { id: 'x', label: 'Two', maxPoints: '1' },
        ],
      }).success,
    ).toBe(false);
  });
  it('uses strict lesson variants and rejects raw scripts, host URLs and preview assessments', () => {
    expect(c.lessonPayloadSchema.parse({ type: 'TEXT', body: doc })).toEqual({
      type: 'TEXT',
      body: doc,
    });
    expect(
      c.lessonPayloadSchema.safeParse({ type: 'TEXT', body: { html: '<script>alert(1)</script>' } })
        .success,
    ).toBe(false);
    expect(
      c.lessonPayloadSchema.safeParse({
        type: 'LIVE_SESSION',
        body: { hostUrl: 'https://example.test/private' },
      }).success,
    ).toBe(false);
    expect(c.lessonPayloadSchema.safeParse({ type: 'QUIZ', body: { answerKey: {} } }).success).toBe(
      false,
    );
    expect(
      c.lessonReleaseSchema.safeParse({
        releaseType: 'ABSOLUTE',
        releaseAt: c.fixtureTimestamp,
        availableUntil: '2026-10-25T08:00:00Z',
      }).success,
    ).toBe(false);
  });
  it('does not let the learner grant, grade, or complete an assessment through telemetry', () => {
    expect(
      c.manualGrantSchema.safeParse({
        startsAt: c.fixtureTimestamp,
        expiresAt: null,
        reason: 'Support',
        source: 'ORDER_ITEM',
      }).success,
    ).toBe(false);
    expect(c.freeEnrollmentSchema.safeParse({ userId: ids.user }).success).toBe(false);
    expect(
      c.progressUpdateSchema.safeParse({ type: 'ACKNOWLEDGE', eventId: ids.event, passed: true })
        .success,
    ).toBe(false);
    expect(
      c.activityBatchSchema.safeParse({
        events: [
          {
            eventId: ids.event,
            type: 'assessment.graded',
            occurredAt: c.fixtureTimestamp,
            courseId: ids.course,
            lessonId: ids.lesson,
            enrollmentId: ids.enrollment,
            properties: { passed: true },
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('tenant scope, notifications and events', () => {
  it('requires tenant scope on business events and null on allowlisted security events', () => {
    expect(c.domainEventSchema.parse(jsonRoundTrip(c.businessEventFixture))).toEqual(
      c.businessEventFixture,
    );
    expect(c.domainEventSchema.parse(jsonRoundTrip(c.securityEventFixture))).toEqual(
      c.securityEventFixture,
    );
    expect(
      c.domainEventSchema.safeParse({ ...c.businessEventFixture, workspaceId: null }).success,
    ).toBe(false);
    expect(
      c.domainEventSchema.safeParse({ ...c.securityEventFixture, workspaceId: ids.workspace })
        .success,
    ).toBe(false);
    expect(
      c.domainEventSchema.safeParse({ ...c.businessEventFixture, schemaVersion: 2 }).success,
    ).toBe(false);
    expect(
      c.domainEventSchema.safeParse({ ...c.businessEventFixture, type: 'anything.v1' }).success,
    ).toBe(false);
    expect(
      c.domainEventSchema.safeParse({
        ...c.businessEventFixture,
        payload: { orderId: ids.order, refreshToken: 'secret' },
      }).success,
    ).toBe(false);
    expect(
      c.domainEventSchema.safeParse({ ...c.businessEventFixture, payload: { refundId: ids.order } })
        .success,
    ).toBe(false);
  });
  it('supports encrypted mail capability and scrubbing without raw one-time tokens', () => {
    const event = {
      ...c.securityEventFixture,
      type: 'identity.password-reset.requested.v1',
      payload: {
        userId: ids.user,
        mailCapability: {
          keyId: 'mail-key-1',
          ciphertext: 'encrypted-envelope',
          expiresAt: c.fixtureTimestamp,
        },
      },
    };
    expect(c.domainEventSchema.safeParse(event).success).toBe(true);
    expect(c.domainEventSchema.safeParse({ ...event, payload: { userId: ids.user } }).success).toBe(
      true,
    );
    expect(
      c.domainEventSchema.safeParse({ ...event, payload: { userId: ids.user, token: 'raw' } })
        .success,
    ).toBe(false);
  });
  it('prevents null tenant notifications, secret data and mandatory mail suppression', () => {
    expect(
      c.notificationSchema.safeParse({ ...c.notificationFixture.data, workspaceId: null }).success,
    ).toBe(false);
    expect(
      c.notificationSchema.safeParse({ ...c.notificationFixture.data, data: { token: 'private' } })
        .success,
    ).toBe(false);
    expect(
      c.notificationPreferencesUpdateSchema.safeParse({
        preferences: [
          { workspaceId: null, type: 'security.password_reset', channel: 'EMAIL', enabled: false },
        ],
      }).success,
    ).toBe(false);
    expect(
      c.notificationPreferencesUpdateSchema.safeParse({
        preferences: [
          { workspaceId: ids.workspace, type: 'live.reminder', channel: 'EMAIL', enabled: false },
        ],
      }).success,
    ).toBe(true);
    expect(c.workspaceRoleSchema.safeParse('SUPER_ADMIN').success).toBe(false);
  });
  it('exposes export download only in READY projections', () => {
    expect(
      c.exportOperationSchema.safeParse({
        ...c.exportFixture.data,
        url: 'https://example.test/export',
      }).success,
    ).toBe(false);
    expect(
      c.exportOperationSchema.safeParse({
        ...c.exportFixture.data,
        status: 'READY',
        url: 'https://example.test/export',
      }).success,
    ).toBe(true);
    expect(
      c.exportOperationSchema.safeParse({
        ...c.exportFixture.data,
        status: 'EXPIRED',
        url: 'https://example.test/export',
      }).success,
    ).toBe(false);
  });
});

describe('API route manifest', () => {
  it('covers exactly every method/path in API.md and expands every abbreviation', () => {
    const api = readFileSync(new URL('../../../docs/API.md', import.meta.url), 'utf8');
    const expected = [...api.matchAll(/^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`/gm)]
      .map(
        ([, method, path = '']) =>
          `${method} ${path.replace(/^C(?=\/)/, '/workspaces/:workspaceId/courses/:courseId').replace(/^W(?=\/)/, '/workspaces/:workspaceId')}`,
      )
      .sort();
    const actual = c.endpointContracts.map((x) => `${x.method} ${x.path}`).sort();
    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
    for (const route of c.endpointContracts) {
      expect(route.path.startsWith('/')).toBe(true);
      expect(route.response).toBeDefined();
      const params = Object.fromEntries(
        [...route.path.matchAll(/:([A-Za-z]+)/g)].map(([, key = '']) => [
          key,
          key === 'slug'
            ? 'reliable-software'
            : key === 'verificationCode'
              ? 'a'.repeat(32)
              : ids.course,
        ]),
      );
      expect(route.params.safeParse(params).success, route.path).toBe(true);
      expect(route.params.safeParse({ ...params, unknown: ids.course }).success).toBe(false);
    }
  });
  it('marks required idempotency at the endpoint boundary', () => {
    const checkout = c.endpointContracts.find((x) => x.path.endsWith('/checkout/sessions'));
    expect(checkout?.headers?.safeParse({}).success).toBe(false);
    expect(checkout?.headers?.safeParse({ 'Idempotency-Key': ids.event }).success).toBe(true);
  });
});

describe('malformed input cannot escape schema validation', () => {
  it('rejects bad numeric strings and URLs without throwing from refinements', () => {
    for (const value of ['NaN', '1e3', 'garbage', '', '-1', '9223372036854775808']) {
      expect(() =>
        c.assetUploadSchema.safeParse({
          purpose: 'SUBMISSION',
          parentId: ids.attempt,
          filename: 'answer.pdf',
          mimeType: 'application/pdf',
          sizeBytes: value,
          sha256: 'a'.repeat(64),
        }),
      ).not.toThrow();
      expect(() => c.pointsSchema.safeParse(value)).not.toThrow();
      expect(() => c.percentSchema.safeParse(value)).not.toThrow();
    }
    for (const value of [
      '',
      'not a URL',
      ':',
      'https://',
      'javascript:alert(1)',
      'https://user:pass@example.test',
    ]) {
      expect(() => c.httpsUrlSchema.safeParse(value)).not.toThrow();
      expect(c.httpsUrlSchema.safeParse(value).success).toBe(false);
      expect(() => c.capabilityUrlSchema.safeParse(value)).not.toThrow();
      expect(c.capabilityUrlSchema.safeParse(value).success).toBe(false);
    }
  });
  it('rejects path normalization escapes and empty reason-only enrollment edits', () => {
    for (const value of ['/student/../private', '/student/%2e%2e/private', '/student/./orders'])
      expect(c.applicationPathSchema.safeParse(value).success).toBe(false);
    expect(c.enrollmentUpdateSchema.safeParse({ reason: 'No actual change' }).success).toBe(false);
    expect(
      c.enrollmentUpdateSchema.parse({ reason: 'Move to self-paced course', cohortId: null }),
    ).toEqual({ reason: 'Move to self-paced course', cohortId: null });
  });
  it('enforces grade and scheduling bounds with exact decimals', () => {
    expect(
      c.releasedResultSchema.safeParse({ ...c.releasedResultFixture.data, awardedPoints: '10.001' })
        .success,
    ).toBe(false);
    expect(
      c.releasedResultSchema.safeParse({ ...c.releasedResultFixture.data, totalPoints: '0' })
        .success,
    ).toBe(false);
    expect(
      c.cohortUpdateSchema.safeParse({
        startsAt: '2026-10-27T00:00:00Z',
        endsAt: '2026-10-26T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      c.liveSessionUpdateSchema.safeParse({
        startsAt: '2026-10-27T00:00:00Z',
        endsAt: '2026-10-26T00:00:00Z',
      }).success,
    ).toBe(false);
  });
});

describe('contract revision manifest', () => {
  it('publishes every runtime root export with its source path', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../src/contract-manifest.json', import.meta.url), 'utf8'),
    ) as { revision: string; symbols: { symbol: string; kind: string; source: string }[] };
    expect(manifest.revision).toBe(c.CONTRACT_REVISION);
    const actual = Object.keys(c).sort();
    const expected = [
      ...new Set(
        manifest.symbols
          .filter((x) => !['type', 'interface'].includes(x.kind))
          .map((x) => x.symbol),
      ),
    ].sort();
    expect(actual).toEqual(expected);
  });
});
