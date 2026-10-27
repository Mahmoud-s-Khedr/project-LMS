import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  textToRichText,
  richTextToText,
  formatPoints,
  formatPercent,
  validateAssessmentPublishFeasibility,
} from './utils';
import { QuestionEditor } from './components/question-editor';
import { AssessmentVersionEditor } from './components/assessment-version-editor';
import { AssessmentStatus, type AuthorQuestion, type Assessment } from './types';
import { api } from '@/lib/api';

const U = {
  workspace: '10000000-0000-4000-8000-000000000001',
  course: '10000000-0000-4000-8000-000000000002',
  enrollment: '10000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  lesson: '10000000-0000-4000-8000-000000000005',
  bank: '10000000-0000-4000-8000-000000000006',
  assessment: '10000000-0000-4000-8000-000000000007',
  question1: '10000000-0000-4000-8000-000000000011',
  questionVersion1: '10000000-0000-4000-8000-000000000013',
  questionVersion2: '10000000-0000-4000-8000-000000000014',
  assessmentVersion: '10000000-0000-4000-8000-000000000016',
};

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Assessment Authoring Utilities', () => {
  describe('textToRichText & richTextToText', () => {
    it('converts plain text to ProseMirror doc format and back', () => {
      const input = 'Explain the Paxos consensus algorithm.';
      const doc = textToRichText(input);

      expect(doc.type).toBe('doc');
      expect(doc.content).toHaveLength(1);
      expect(doc.content[0]?.type).toBe('paragraph');

      const extracted = richTextToText(doc);
      expect(extracted).toBe(input);
    });

    it('handles empty strings and null gracefully', () => {
      const emptyDoc = textToRichText('');
      expect(richTextToText(emptyDoc)).toBe('');
      expect(richTextToText(null)).toBe('');
      expect(richTextToText(undefined)).toBe('');
    });
  });

  describe('formatPoints and formatPercent', () => {
    it('formats points to 3 decimal places', () => {
      expect(formatPoints(5)).toBe('5.000');
      expect(formatPoints('2.5')).toBe('2.500');
      expect(formatPoints('')).toBe('0.000');
      expect(formatPoints(null)).toBe('0.000');
    });

    it('formats percentages to 2 decimal places', () => {
      expect(formatPercent(75)).toBe('75.00');
      expect(formatPercent('82.5')).toBe('82.50');
      expect(formatPercent('')).toBe('0.00');
    });
  });

  describe('validateAssessmentPublishFeasibility', () => {
    it('rejects assessment with no fixed questions and no pools', () => {
      const res = validateAssessmentPublishFeasibility({
        config: {},
        fixedQuestions: [],
        pools: [],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain(
        'Assessment must contain at least one fixed question or random pool draw.',
      );
    });

    it('rejects invalid time windows', () => {
      const res = validateAssessmentPublishFeasibility({
        config: {
          availableFrom: '2026-10-26T12:00:00Z',
          dueAt: '2026-10-26T10:00:00Z', // due before availableFrom!
          availableUntil: '2026-10-26T15:00:00Z',
        },
        fixedQuestions: [{ questionVersionId: U.questionVersion1, points: '5.000', position: 0 }],
        pools: [],
      });
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Due date must be after availability start date.');
    });

    it('detects insufficient questions in pool bank inventory', () => {
      const bankId = U.bank;
      const availableQuestions: AuthorQuestion[] = [
        {
          id: U.question1,
          workspaceId: U.workspace,
          bankId,
          createdById: U.user,
          title: 'Question 1',
          tags: ['database'],
          archivedAt: null,
          createdAt: '2026-10-26T00:00:00Z',
          updatedAt: '2026-10-26T00:00:00Z',
          latestVersion: {
            id: U.questionVersion1,
            workspaceId: U.workspace,
            questionId: U.question1,
            version: 1,
            createdAt: '2026-10-26T00:00:00Z',
            payload: {
              type: 'SINGLE_CHOICE',
              prompt: textToRichText('Test prompt'),
              explanation: null,
              defaultPoints: '1.000',
              options: [
                { key: 'a', position: 0, content: textToRichText('A') },
                { key: 'b', position: 1, content: textToRichText('B') },
              ],
              answerKey: { correctOptionKeys: ['a'] },
              gradingConfig: {},
            },
          },
        },
      ];

      const res = validateAssessmentPublishFeasibility({
        config: {},
        fixedQuestions: [],
        pools: [{ bankId, count: 5, tags: ['database'], questionType: 'SINGLE_CHOICE' }],
        availableBankQuestions: {
          [bankId]: availableQuestions,
        },
      });

      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Pool requests 5 question(s) but only 1 eligible');
    });

    it('validates rubric criteria labels and positive max points', () => {
      const res = validateAssessmentPublishFeasibility({
        config: {
          rubric: {
            criteria: [
              { id: 'c-1', label: '', maxPoints: '5.000' },
              { id: 'c-2', label: 'Testing', maxPoints: '0.000' },
            ],
          },
        },
        fixedQuestions: [{ questionVersionId: U.questionVersion1, points: '5.000', position: 0 }],
        pools: [],
      });

      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Rubric criterion #1 is missing a title.');
      expect(res.errors).toContain('Rubric criterion "Testing" must have positive max points.');
    });
  });
});

describe('QuestionEditor Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders question editor with choice options and supports adding/removing options', async () => {
    const handleSuccess = vi.fn();
    const handleCancel = vi.fn();

    renderWithQueryClient(
      <QuestionEditor
        workspaceId={U.workspace}
        bankId={U.bank}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />,
    );

    expect(screen.getByText('Author New Question')).toBeInTheDocument();
    expect(screen.getByLabelText(/Question Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Question Prompt/i)).toBeInTheDocument();

    const addOptionBtn = screen.getByRole('button', { name: /Add Option/i });
    expect(addOptionBtn).toBeInTheDocument();

    // Default 3 options exist
    const optionInputs = screen.getAllByPlaceholderText('Option text...');
    expect(optionInputs.length).toBe(3);

    // Add another option
    fireEvent.click(addOptionBtn);
    const updatedInputs = screen.getAllByPlaceholderText('Option text...');
    expect(updatedInputs.length).toBe(4);
  });

  it('creates an immutable new version when saving an existing question', async () => {
    const existingQuestion: AuthorQuestion = {
      id: U.question1,
      workspaceId: U.workspace,
      bankId: U.bank,
      createdById: U.user,
      title: 'Original Title',
      tags: ['algorithms'],
      archivedAt: null,
      createdAt: '2026-10-26T00:00:00Z',
      updatedAt: '2026-10-26T00:00:00Z',
      latestVersion: {
        id: U.questionVersion1,
        workspaceId: U.workspace,
        questionId: U.question1,
        version: 1,
        createdAt: '2026-10-26T00:00:00Z',
        payload: {
          type: 'SINGLE_CHOICE',
          prompt: textToRichText('Original prompt text'),
          explanation: null,
          defaultPoints: '2.000',
          options: [
            { key: 'opt-1', position: 0, content: textToRichText('First') },
            { key: 'opt-2', position: 1, content: textToRichText('Second') },
          ],
          answerKey: { correctOptionKeys: ['opt-1'] },
          gradingConfig: {},
        },
      },
    };

    const patchSpy = vi.spyOn(api, 'patch').mockResolvedValueOnce({
      data: { ...existingQuestion, title: 'Updated Title' },
    });
    const postVersionSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        id: U.questionVersion2,
        workspaceId: U.workspace,
        questionId: U.question1,
        version: 2,
        createdAt: '2026-10-26T01:00:00Z',
        payload: existingQuestion.latestVersion.payload,
      },
    });

    const handleSuccess = vi.fn();
    renderWithQueryClient(
      <QuestionEditor
        workspaceId={U.workspace}
        bankId={U.bank}
        question={existingQuestion}
        onSuccess={handleSuccess}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Edit Question: Original Title/i)).toBeInTheDocument();
    const saveBtn = screen.getByRole('button', { name: /Save New Version/i });

    // Update title
    const titleInput = screen.getByLabelText(/Question Title/i);
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith(
        `/workspaces/${U.workspace}/questions/${U.question1}`,
        expect.objectContaining({ title: 'Updated Title' }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'If-Match': expect.any(String),
          }),
        }),
      );
      expect(postVersionSpy).toHaveBeenCalledWith(
        `/workspaces/${U.workspace}/questions/${U.question1}/versions`,
        expect.objectContaining({ type: 'SINGLE_CHOICE' }),
      );
      expect(handleSuccess).toHaveBeenCalled();
    });
  });
});

describe('AssessmentVersionEditor Component', () => {
  const mockAssessment: Assessment = {
    id: U.assessment,
    workspaceId: U.workspace,
    courseId: U.course,
    lessonId: U.lesson,
    kind: 'QUIZ',
    title: 'Distributed Systems Midterm',
    currentPublishedVersion: null,
    createdAt: '2026-10-26T00:00:00Z',
    updatedAt: '2026-10-26T00:00:00Z',
  };

  it('renders draft mode with active editing controls and settings tabs', () => {
    renderWithQueryClient(
      <AssessmentVersionEditor
        workspaceId={U.workspace}
        courseId={U.course}
        assessment={mockAssessment}
        initialStatus={AssessmentStatus.DRAFT}
        initialVersionNumber={1}
      />,
    );

    expect(screen.getByText('Distributed Systems Midterm')).toBeInTheDocument();
    expect(screen.getByText('v1 (Draft)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Settings/i })).toBeInTheDocument();
  });

  it('locks inputs and displays published banner when version is published', () => {
    renderWithQueryClient(
      <AssessmentVersionEditor
        workspaceId={U.workspace}
        courseId={U.course}
        assessment={{ ...mockAssessment, currentPublishedVersion: 1 }}
        initialStatus={AssessmentStatus.PUBLISHED}
        initialVersionNumber={1}
      />,
    );

    expect(screen.getByText(/v1 \(Published\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Version v1 is published and frozen/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create New Draft Version/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Settings/i })).not.toBeInTheDocument();
  });

  it('clones published version into new draft version when clicking Create New Draft', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: [
        {
          id: U.assessmentVersion,
          workspaceId: U.workspace,
          assessmentId: U.assessment,
          version: 1,
          status: 'PUBLISHED',
          instructions: textToRichText('Original instructions'),
          maxAttempts: 3,
          timeLimitSeconds: 3600,
          availableFrom: null,
          dueAt: null,
          availableUntil: null,
          allowLateSubmission: false,
          latePenaltyPercent: '10.00',
          passPercent: '70.00',
          gradePolicy: 'HIGHEST',
          feedbackPolicy: 'IMMEDIATE',
          shuffleQuestions: true,
          shuffleOptions: true,
          rubric: null,
          allowedFileTypes: ['application/pdf'],
          maxUploadBytes: '10485760',
          maxFiles: 1,
          createdAt: '2026-10-26T00:00:00Z',
          updatedAt: '2026-10-26T00:00:00Z',
          publishedAt: '2026-10-26T00:00:00Z',
        },
      ],
      meta: { limit: 20, hasMore: false, nextCursor: null },
    });

    const postVersionSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        id: '10000000-0000-4000-8000-000000000099',
        workspaceId: U.workspace,
        assessmentId: U.assessment,
        version: 2,
        status: 'DRAFT',
        instructions: textToRichText('Draft copy'),
        maxAttempts: 3,
        timeLimitSeconds: 3600,
        availableFrom: null,
        dueAt: null,
        availableUntil: null,
        allowLateSubmission: false,
        latePenaltyPercent: '10.00',
        passPercent: '70.00',
        gradePolicy: 'HIGHEST',
        feedbackPolicy: 'IMMEDIATE',
        shuffleQuestions: true,
        shuffleOptions: true,
        rubric: null,
        allowedFileTypes: ['application/pdf'],
        maxUploadBytes: '10485760',
        maxFiles: 1,
        createdAt: '2026-10-26T00:00:00Z',
        updatedAt: '2026-10-26T00:00:00Z',
        publishedAt: null,
      },
    });

    renderWithQueryClient(
      <AssessmentVersionEditor
        workspaceId={U.workspace}
        courseId={U.course}
        assessment={{ ...mockAssessment, currentPublishedVersion: 1 }}
        initialStatus={AssessmentStatus.PUBLISHED}
        initialVersionNumber={1}
      />,
    );

    const createDraftBtn = screen.getByRole('button', { name: /Create New Draft Version/i });
    fireEvent.click(createDraftBtn);

    await waitFor(() => {
      expect(postVersionSpy).toHaveBeenCalledWith(
        `/workspaces/${U.workspace}/courses/${U.course}/assessments/${U.assessment}/versions`,
        {},
      );
      expect(screen.getByText(/Created new draft version/i)).toBeInTheDocument();
    });
  });
});
