import {
  authorQuestionPayloadSchema,
  type AuthorQuestionPayload,
  type QuestionResponse,
} from '@lms/shared';
import { draw, score, shuffled, deadline, released } from './assessment-domain';
import { assessmentVersionConfigSchema } from '@lms/shared';
const document = { type: 'doc', content: [] };
function author(
  type: string,
  key: object,
  config: object = {},
  options: object[] = [],
): AuthorQuestionPayload {
  return authorQuestionPayloadSchema.parse({
    type,
    prompt: document,
    options,
    explanation: null,
    defaultPoints: '3',
    answerKey: key,
    gradingConfig: config,
  });
}
const options = ['a', 'b', 'c'].map((key, position) => ({ key, position, content: document }));
describe('Assessment domain: objective scoring and deterministic constrained draws', () => {
  it('uses decimal tolerance at exact boundary', () => {
    const a = author('NUMERIC', { value: '999999999.999', absoluteTolerance: '0.001' });
    expect(score(a, { type: 'NUMERIC', value: '1000000000' }, '3').points).toBe('3');
    expect(score(a, { type: 'NUMERIC', value: '1000000000.001' }, '3').points).toBe('0');
  });
  it('bounds multi choice partial credit and penalizes guessing all options', () => {
    const a = author(
      'MULTIPLE_CHOICE',
      { correctOptionKeys: ['a', 'b'] },
      { partialCredit: true },
      options,
    );
    expect(score(a, { type: 'MULTIPLE_CHOICE', optionKeys: ['a'] }, '3').points).toBe('1.5');
    expect(score(a, { type: 'MULTIPLE_CHOICE', optionKeys: ['c'] }, '3').points).toBe('0');
    expect(score(a, { type: 'MULTIPLE_CHOICE', optionKeys: ['a', 'b', 'c'] }, '3').points).toBe(
      '1.5',
    );
    expect(() => score(a, { type: 'MULTIPLE_CHOICE', optionKeys: ['unknown'] }, '3')).toThrow();
  });
  it.each([
    [
      author('SINGLE_CHOICE', { correctOptionKeys: ['b'] }, {}, options),
      { type: 'SINGLE_CHOICE', optionKey: 'b' },
      '3',
    ],
    [author('TRUE_FALSE', { value: true }), { type: 'TRUE_FALSE', value: false }, '0'],
    [
      author(
        'SHORT_ANSWER',
        { accepted: ['Hello world'] },
        { trim: true, caseSensitive: false, collapseWhitespace: true },
      ),
      { type: 'SHORT_ANSWER', text: ' HELLO  WORLD ' },
      '3',
    ],
    [
      author('ORDERING', { optionKeys: ['b', 'a', 'c'] }, {}, options),
      { type: 'ORDERING', optionKeys: ['a', 'b', 'c'] },
      '0',
    ],
    [author('ESSAY', {}), { type: 'ESSAY', document }, null],
    [author('FILE_UPLOAD', {}), null, null],
  ] as Array<[AuthorQuestionPayload, QuestionResponse | null, string | null]>)(
    'scores %j',
    (a, r, points) => expect(score(a, r, '3').points).toBe(points),
  );
  it('scores matching by stable groups, never position', () => {
    const a = author(
      'MATCHING',
      { pairs: [{ leftKey: 'l', rightKey: 'r' }] },
      { partialCredit: true },
      [
        { key: 'l', position: 0, group: 'LEFT', content: document },
        { key: 'r', position: 1, group: 'RIGHT', content: document },
      ],
    );
    expect(
      score(a, { type: 'MATCHING', pairs: [{ leftKey: 'l', rightKey: 'r' }] }, '0.333').points,
    ).toBe('0.333');
    expect(() =>
      score(a, { type: 'MATCHING', pairs: [{ leftKey: 'r', rightKey: 'l' }] }, '1'),
    ).toThrow();
  });
  it('finds a feasible matching where a greedy pool draw can fail', () => {
    const a = { id: 'a1', questionId: 'a' };
    const b = { id: 'b1', questionId: 'b' };
    const pools = [
      { id: 'broad', count: 1, candidates: [a, b] },
      { id: 'narrow', count: 1, candidates: [a] },
    ];
    for (let i = 0; i < 30; i++) {
      const result = draw([], pools, String(i));
      expect(result.get('narrow')).toEqual(['a1']);
      expect(result.get('broad')).toEqual(['b1']);
    }
  });
  it('rejects duplicate roots across fixed versions and impossible overlapping pools', () => {
    expect(() =>
      draw(
        [
          { id: 'v1', questionId: 'q' },
          { id: 'v2', questionId: 'q' },
        ],
        [],
        's',
      ),
    ).toThrow();
    expect(() =>
      draw(
        [],
        [
          {
            id: 'p',
            count: 2,
            candidates: [
              { id: 'v1', questionId: 'q' },
              { id: 'v2', questionId: 'q' },
            ],
          },
        ],
        's',
      ),
    ).toThrow();
  });
  it('keeps seeded shuffles stable independent of input ordering', () => {
    expect(shuffled(['a', 'b', 'c'], 'seed', 'options', (x) => x)).toEqual(
      shuffled(['c', 'b', 'a'], 'seed', 'options', (x) => x),
    );
  });
  it('applies cutoff and feedback boundaries', () => {
    const c = assessmentVersionConfigSchema.parse({
      instructions: document,
      maxAttempts: 2,
      timeLimitSeconds: 60,
      availableFrom: null,
      availableUntil: '2026-10-26T12:02:00.000Z',
      dueAt: '2026-10-26T12:01:00.000Z',
      allowLateSubmission: true,
      latePenaltyPercent: '10',
      passPercent: '60',
      gradePolicy: 'HIGHEST',
      feedbackPolicy: 'AFTER_DUE',
      shuffleQuestions: false,
      shuffleOptions: false,
      rubric: null,
      allowedFileTypes: ['application/pdf'],
      maxUploadBytes: '1000',
      maxFiles: 1,
    });
    const start = new Date('2026-10-26T12:00:00Z');
    expect(deadline(c, start, 90, new Date(c.availableUntil!))?.toISOString()).toBe(
      c.availableUntil,
    );
    expect(released(c, start, start)).toBe(false);
    expect(released(c, start, new Date(c.dueAt!))).toBe(true);
    expect(released({ ...c, feedbackPolicy: 'NEVER' }, start, new Date(c.dueAt!))).toBe(false);
  });
});
