import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import {
  fetchLearnerAssessment,
  startAssessmentAttempt,
  fetchAttempt,
  saveAnswer,
  submitAttempt,
  fetchAttemptResult,
  downloadAttemptAttachment,
} from './api';

const mockIds = {
  enrollment: '10000000-0000-4000-8000-000000000003',
  assessment: '10000000-0000-4000-8000-000000000007',
  attempt: '10000000-0000-4000-8000-000000000008',
  attemptQuestion: '10000000-0000-4000-8000-000000000009',
  asset: '10000000-0000-4000-8000-000000000016',
};

const mockPrompt = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph' as const,
      content: [
        {
          type: 'text' as const,
          text: 'Explain the difference between at-least-once and exactly-once delivery.',
        },
      ],
    },
  ],
};

describe('Assessment Taking API Client Functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchLearnerAssessment returns parsed learner-safe assessment instructions and policy', async () => {
    const mockAssessment = {
      assessmentId: mockIds.assessment,
      kind: 'QUIZ',
      title: 'Distributed Systems Quiz',
      version: 1,
      instructions: mockPrompt,
      remainingAttempts: 2,
      timeLimitSeconds: 1800,
      availableFrom: '2026-10-26T00:00:00.000Z',
      dueAt: '2026-10-27T00:00:00.000Z',
      availableUntil: '2026-10-28T00:00:00.000Z',
      passPercent: '80.00',
      feedbackPolicy: 'IMMEDIATE',
      allowedFileTypes: ['application/pdf'],
      maxUploadBytes: '5242880',
      maxFiles: 2,
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockAssessment });

    const result = await fetchLearnerAssessment(mockIds.enrollment, mockIds.assessment);
    expect(result.assessmentId).toBe(mockIds.assessment);
    expect(result.kind).toBe('QUIZ');
    expect(result.remainingAttempts).toBe(2);
    expect(api.get).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/assessments/${mockIds.assessment}`,
    );
  });

  it('startAssessmentAttempt returns attemptStart with questions and excludes answer keys', async () => {
    const mockAttemptStart = {
      attemptId: mockIds.attempt,
      version: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-26T08:00:00.000Z',
      deadlineAt: '2026-10-26T08:30:00.000Z',
      questions: [
        {
          attemptQuestionId: mockIds.attemptQuestion,
          type: 'SINGLE_CHOICE',
          prompt: mockPrompt,
          options: [
            { key: 'opt-a', position: 0, content: mockPrompt },
            { key: 'opt-b', position: 1, content: mockPrompt },
          ],
          points: '10.000',
          isRequired: true,
          position: 0,
        },
      ],
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockAttemptStart });

    const result = await startAssessmentAttempt(mockIds.enrollment, mockIds.assessment);
    expect(result.attemptId).toBe(mockIds.attempt);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.questions).toHaveLength(1);
    // Verified: No answer keys in learner payload
    expect((result.questions[0] as Record<string, unknown>).answerKey).toBeUndefined();
    expect(api.post).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/assessments/${mockIds.assessment}/attempts`,
      {},
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^[\x21-\x7E]{16,128}$/),
        },
      },
    );
  });

  it('startAssessmentAttempt reuses provided stable idempotency key on retry', async () => {
    const mockAttemptStart = {
      attemptId: mockIds.attempt,
      version: 1,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-26T08:00:00.000Z',
      deadlineAt: '2026-10-26T08:30:00.000Z',
      questions: [],
    };

    const customKey = 'stable-retry-action-key-12345';
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockAttemptStart });

    await startAssessmentAttempt(mockIds.enrollment, mockIds.assessment, customKey);
    expect(api.post).toHaveBeenCalledWith(
      `/me/enrollments/${mockIds.enrollment}/assessments/${mockIds.assessment}/attempts`,
      {},
      {
        headers: {
          'Idempotency-Key': customKey,
        },
      },
    );
  });

  it('fetchAttempt returns attempt snapshot with questions and saved answers', async () => {
    const mockAttempt = {
      attemptId: mockIds.attempt,
      version: 2,
      status: 'IN_PROGRESS',
      startedAt: '2026-10-26T08:00:00.000Z',
      deadlineAt: '2026-10-26T08:30:00.000Z',
      submittedAt: null,
      questions: [
        {
          attemptQuestionId: mockIds.attemptQuestion,
          type: 'SHORT_ANSWER',
          prompt: mockPrompt,
          options: [],
          points: '5.000',
          isRequired: true,
          position: 0,
        },
      ],
      answers: [
        {
          attemptQuestionId: mockIds.attemptQuestion,
          version: 1,
          response: { type: 'SHORT_ANSWER', text: 'Idempotency key' },
          attachmentIds: [],
          savedAt: '2026-10-26T08:05:00.000Z',
        },
      ],
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockAttempt });

    const result = await fetchAttempt(mockIds.attempt);
    expect(result.attemptId).toBe(mockIds.attempt);
    expect(result.answers).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith(`/me/attempts/${mockIds.attempt}`);
  });

  it('saveAnswer saves single response with version', async () => {
    const mockSavedAnswer = {
      attemptQuestionId: mockIds.attemptQuestion,
      version: 2,
      response: { type: 'SINGLE_CHOICE', optionKey: 'opt-b' },
      attachmentIds: [],
      savedAt: '2026-10-26T08:10:00.000Z',
    };

    vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockSavedAnswer });

    const result = await saveAnswer(mockIds.attempt, mockIds.attemptQuestion, {
      version: 1,
      response: { type: 'SINGLE_CHOICE', optionKey: 'opt-b' },
    });

    expect(result.version).toBe(2);
    expect(api.put).toHaveBeenCalledWith(
      `/me/attempts/${mockIds.attempt}/answers/${mockIds.attemptQuestion}`,
      {
        version: 1,
        response: { type: 'SINGLE_CHOICE', optionKey: 'opt-b' },
      },
    );
  });

  it('submitAttempt finalizes attempt idempotently with Idempotency-Key header', async () => {
    const mockState = {
      attemptId: mockIds.attempt,
      version: 3,
      status: 'SUBMITTED',
      submittedAt: '2026-10-26T08:25:00.000Z',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockState });

    const result = await submitAttempt(mockIds.attempt);
    expect(result.status).toBe('SUBMITTED');
    expect(result.submittedAt).toBe(mockState.submittedAt);
    expect(api.post).toHaveBeenCalledWith(
      `/me/attempts/${mockIds.attempt}/submit`,
      {},
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^[\x21-\x7E]{16,128}$/),
        },
      },
    );
  });

  it('submitAttempt reuses provided stable idempotency key on retry', async () => {
    const mockState = {
      attemptId: mockIds.attempt,
      version: 3,
      status: 'SUBMITTED',
      submittedAt: '2026-10-26T08:25:00.000Z',
    };

    const customKey = 'stable-submit-action-key-67890';
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockState });

    await submitAttempt(mockIds.attempt, customKey);
    expect(api.post).toHaveBeenCalledWith(
      `/me/attempts/${mockIds.attempt}/submit`,
      {},
      {
        headers: {
          'Idempotency-Key': customKey,
        },
      },
    );
  });

  it('fetchAttemptResult returns released scores when available', async () => {
    const mockResult = {
      attemptId: mockIds.attempt,
      assessmentId: mockIds.assessment,
      number: 1,
      status: 'GRADED',
      totalPoints: '20.000',
      awardedPoints: '18.000',
      percent: '90.00',
      passed: true,
      gradedAt: '2026-10-26T08:26:00.000Z',
      answers: [
        {
          attemptQuestionId: mockIds.attemptQuestion,
          awardedPoints: '10.000',
          isCorrect: true,
          feedback: 'Excellent explanation.',
        },
      ],
    };

    vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockResult });

    const result = await fetchAttemptResult(mockIds.attempt);
    expect(result.passed).toBe(true);
    expect(result.percent).toBe('90.00');
    expect(api.get).toHaveBeenCalledWith(`/me/attempts/${mockIds.attempt}/result`);
  });

  it('downloadAttemptAttachment returns signed download capability', async () => {
    const mockCap = {
      url: 'https://cdn.example.com/submission.pdf?sig=789',
      expiresAt: '2026-10-26T08:35:00.000Z',
    };

    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockCap });

    const result = await downloadAttemptAttachment(mockIds.attempt, mockIds.asset);
    expect(result.url).toBe(mockCap.url);
    expect(api.post).toHaveBeenCalledWith(
      `/me/attempts/${mockIds.attempt}/attachments/${mockIds.asset}/download`,
      {},
    );
  });
});
