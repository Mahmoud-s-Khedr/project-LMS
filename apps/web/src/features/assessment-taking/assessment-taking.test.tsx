import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssessmentTimer } from './components/assessment-timer';
import { AutosaveIndicator } from './components/autosave-indicator';
import { QuestionPalette } from './components/question-palette';
import { SubmitConfirmationDialog } from './components/submit-confirmation-dialog';
import { AssessmentStartCard } from './components/assessment-start-card';
import { AssessmentResultView } from './components/assessment-result-view';
import { SingleChoiceQuestion } from './components/questions/single-choice-question';
import { MultipleChoiceQuestion } from './components/questions/multiple-choice-question';
import { TrueFalseQuestion } from './components/questions/true-false-question';
import { ShortAnswerQuestion } from './components/questions/short-answer-question';
import { NumericQuestion } from './components/questions/numeric-question';
import { EssayQuestion } from './components/questions/essay-question';
import { FileUploadQuestion } from './components/questions/file-upload-question';
import { MatchingQuestion } from './components/questions/matching-question';
import { OrderingQuestion } from './components/questions/ordering-question';
import type { LearnerQuestion, LearnerAssessment, ReleasedResult } from './types';

const mockIds = {
  attempt: '10000000-0000-4000-8000-000000000008',
  assessment: '10000000-0000-4000-8000-000000000007',
  enrollment: '10000000-0000-4000-8000-000000000003',
  workspace: '10000000-0000-4000-8000-000000000001',
  q1: '10000000-0000-4000-8000-000000000009',
  q2: '10000000-0000-4000-8000-000000000010',
};

const makePrompt = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
});

const mockSingleChoiceQuestion: LearnerQuestion = {
  attemptQuestionId: mockIds.q1,
  type: 'SINGLE_CHOICE',
  prompt: makePrompt('What is the default isolation level?'),
  options: [
    { key: 'rc', position: 0, content: makePrompt('Read Committed') },
    { key: 'rr', position: 1, content: makePrompt('Repeatable Read') },
    { key: 'ser', position: 2, content: makePrompt('Serializable') },
  ],
  points: '5.000',
  isRequired: true,
  position: 0,
};

const mockMultipleChoiceQuestion: LearnerQuestion = {
  attemptQuestionId: mockIds.q2,
  type: 'MULTIPLE_CHOICE',
  prompt: makePrompt('Select all valid HTTP idempotency methods:'),
  options: [
    { key: 'get', position: 0, content: makePrompt('GET') },
    { key: 'put', position: 1, content: makePrompt('PUT') },
    { key: 'delete', position: 2, content: makePrompt('DELETE') },
    { key: 'post', position: 3, content: makePrompt('POST') },
  ],
  points: '10.000',
  isRequired: true,
  position: 1,
};

const mockMatchingQuestion: LearnerQuestion = {
  attemptQuestionId: '10000000-0000-4000-8000-000000000011',
  type: 'MATCHING',
  prompt: makePrompt('Match each protocol to its transport layer:'),
  options: [
    { key: 'dns', position: 0, group: 'LEFT', content: makePrompt('DNS') },
    { key: 'http', position: 1, group: 'LEFT', content: makePrompt('HTTP/2') },
    { key: 'udp', position: 0, group: 'RIGHT', content: makePrompt('UDP') },
    { key: 'tcp', position: 1, group: 'RIGHT', content: makePrompt('TCP') },
  ],
  points: '10.000',
  isRequired: false,
  position: 2,
};

const mockOrderingQuestion: LearnerQuestion = {
  attemptQuestionId: '10000000-0000-4000-8000-000000000012',
  type: 'ORDERING',
  prompt: makePrompt('Order the phases of 2-Phase Commit:'),
  options: [
    { key: 'prepare', position: 0, content: makePrompt('Prepare Phase') },
    { key: 'vote', position: 1, content: makePrompt('Coordinator Gathers Votes') },
    { key: 'commit', position: 2, content: makePrompt('Commit / Abort Decision') },
  ],
  points: '10.000',
  isRequired: true,
  position: 3,
};

const mockAssessment: LearnerAssessment = {
  assessmentId: mockIds.assessment,
  kind: 'EXAM',
  title: 'Midterm Examination',
  version: 1,
  instructions: makePrompt('Calculators permitted. Complete all sections before time expires.'),
  remainingAttempts: 1,
  timeLimitSeconds: 3600,
  availableFrom: '2026-10-26T00:00:00.000Z',
  dueAt: '2026-10-27T00:00:00.000Z',
  availableUntil: '2026-10-28T00:00:00.000Z',
  passPercent: '75.00',
  feedbackPolicy: 'IMMEDIATE',
  allowedFileTypes: ['application/pdf'],
  maxUploadBytes: '10485760',
  maxFiles: 3,
};

describe('Assessment Taking Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AssessmentTimer — Strict Server Deadline', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calculates countdown from server deadlineAt and executes onExpire when time passes', () => {
      const now = new Date('2026-10-26T12:00:00.000Z').getTime();
      vi.setSystemTime(now);

      const serverDeadline = new Date(now + 65_000).toISOString(); // 1 minute 5 seconds from now
      const onExpire = vi.fn();

      render(<AssessmentTimer deadlineAt={serverDeadline} onExpire={onExpire} />);

      expect(screen.getByRole('timer')).toBeInTheDocument();
      expect(screen.getByText('1:05')).toBeInTheDocument();

      // Advance by 30 seconds
      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByText('0:35')).toBeInTheDocument();

      // Advance past deadline
      act(() => {
        vi.advanceTimersByTime(40_000);
      });
      expect(onExpire).toHaveBeenCalledTimes(1);
    });
  });

  describe('AutosaveIndicator', () => {
    it('renders all autosave statuses', () => {
      const { rerender } = render(<AutosaveIndicator status="SAVING" />);
      expect(screen.getByText('Saving...')).toBeInTheDocument();

      rerender(<AutosaveIndicator status="SAVED" lastSavedAt="2026-10-26T12:00:00.000Z" />);
      expect(screen.getByText(/Saved/i)).toBeInTheDocument();

      rerender(<AutosaveIndicator status="OFFLINE" />);
      expect(screen.getByText(/Offline - changes cached locally/i)).toBeInTheDocument();

      rerender(<AutosaveIndicator status="ERROR" />);
      expect(screen.getByText(/Save failed/i)).toBeInTheDocument();
    });
  });

  describe('QuestionPalette', () => {
    it('displays question numbers, indicators, and handles selection', () => {
      const onSelect = vi.fn();
      const answersMap = new Map();
      answersMap.set(mockIds.q1, {
        attemptQuestionId: mockIds.q1,
        version: 1,
        response: { type: 'SINGLE_CHOICE', optionKey: 'rc' },
        attachmentIds: [],
        savedAt: '2026-10-26T12:00:00.000Z',
      });

      render(
        <QuestionPalette
          questions={[mockSingleChoiceQuestion, mockMultipleChoiceQuestion]}
          answers={answersMap}
          flaggedIds={new Set([mockIds.q2])}
          currentIndex={0}
          onSelectIndex={onSelect}
        />,
      );

      expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();
      const q2Btn = screen.getByTestId('palette-question-2');
      fireEvent.click(q2Btn);
      expect(onSelect).toHaveBeenCalledWith(1);
    });
  });

  describe('Question Types Rendering & Interaction', () => {
    it('SINGLE_CHOICE: selects option and fires onChange', () => {
      const onChange = vi.fn();
      render(
        <SingleChoiceQuestion
          question={mockSingleChoiceQuestion}
          value={null}
          onChange={onChange}
        />,
      );

      const radio = screen.getByTestId('option-radio-rc');
      fireEvent.click(radio);
      expect(onChange).toHaveBeenCalledWith({
        type: 'SINGLE_CHOICE',
        optionKey: 'rc',
      });
    });

    it('MULTIPLE_CHOICE: toggles options into array', () => {
      const onChange = vi.fn();
      render(
        <MultipleChoiceQuestion
          question={mockMultipleChoiceQuestion}
          value={{ type: 'MULTIPLE_CHOICE', optionKeys: ['get'] }}
          onChange={onChange}
        />,
      );

      const putCheckbox = screen.getByTestId('option-checkbox-put');
      fireEvent.click(putCheckbox);
      expect(onChange).toHaveBeenCalledWith({
        type: 'MULTIPLE_CHOICE',
        optionKeys: ['get', 'put'],
      });
    });

    it('TRUE_FALSE: selects boolean value', () => {
      const onChange = vi.fn();
      const tfQuestion: LearnerQuestion = {
        attemptQuestionId: '10000000-0000-4000-8000-000000000015',
        type: 'TRUE_FALSE',
        prompt: makePrompt('Idempotency keys prevent duplicate payments.'),
        options: [],
        points: '2.000',
        isRequired: true,
        position: 0,
      };

      render(<TrueFalseQuestion question={tfQuestion} value={null} onChange={onChange} />);

      const trueRadio = screen.getByTestId('true-radio');
      fireEvent.click(trueRadio);
      expect(onChange).toHaveBeenCalledWith({
        type: 'TRUE_FALSE',
        value: true,
      });
    });

    it('SHORT_ANSWER: enters string', () => {
      const onChange = vi.fn();
      const saQuestion: LearnerQuestion = {
        attemptQuestionId: '10000000-0000-4000-8000-000000000016',
        type: 'SHORT_ANSWER',
        prompt: makePrompt('Enter the algorithm name:'),
        options: [],
        points: '5.000',
        isRequired: true,
        position: 0,
      };

      render(<ShortAnswerQuestion question={saQuestion} value={null} onChange={onChange} />);

      const input = screen.getByTestId('short-answer-input');
      fireEvent.change(input, { target: { value: 'Raft' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'SHORT_ANSWER',
        text: 'Raft',
      });
    });

    it('NUMERIC: accepts valid decimal input', () => {
      const onChange = vi.fn();
      const numQuestion: LearnerQuestion = {
        attemptQuestionId: '10000000-0000-4000-8000-000000000017',
        type: 'NUMERIC',
        prompt: makePrompt('Enter consensus quorum size for 5 nodes:'),
        options: [],
        points: '5.000',
        isRequired: true,
        position: 0,
      };

      render(<NumericQuestion question={numQuestion} value={null} onChange={onChange} />);

      const input = screen.getByTestId('numeric-input');
      fireEvent.change(input, { target: { value: '3' } });
      expect(onChange).toHaveBeenCalledWith({
        type: 'NUMERIC',
        value: '3',
      });
    });

    it('ESSAY: updates RichText document response', () => {
      const onChange = vi.fn();
      const essayQuestion: LearnerQuestion = {
        attemptQuestionId: '10000000-0000-4000-8000-000000000018',
        type: 'ESSAY',
        prompt: makePrompt('Discuss CAP theorem trade-offs:'),
        options: [],
        points: '20.000',
        isRequired: true,
        position: 0,
      };

      render(<EssayQuestion question={essayQuestion} value={null} onChange={onChange} />);

      const textarea = screen.getByTestId('essay-textarea');
      fireEvent.change(textarea, { target: { value: 'In network partitions, choose CP or AP.' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ESSAY',
          document: expect.objectContaining({
            type: 'doc',
          }),
        }),
      );
    });

    it('MATCHING: pairs left keys to right keys', () => {
      const onChange = vi.fn();
      render(<MatchingQuestion question={mockMatchingQuestion} value={null} onChange={onChange} />);

      const select = screen.getByTestId('match-select-dns');
      fireEvent.change(select, { target: { value: 'udp' } });

      expect(onChange).toHaveBeenCalledWith({
        type: 'MATCHING',
        pairs: [{ leftKey: 'dns', rightKey: 'udp' }],
      });
    });

    it('ORDERING: moves items up and down', () => {
      const onChange = vi.fn();
      render(<OrderingQuestion question={mockOrderingQuestion} value={null} onChange={onChange} />);

      const moveDownBtn = screen.getByTestId('move-down-prepare');
      fireEvent.click(moveDownBtn);

      expect(onChange).toHaveBeenCalledWith({
        type: 'ORDERING',
        optionKeys: ['vote', 'prepare', 'commit'],
      });
    });

    it('FILE_UPLOAD: renders upload dropzone and note input', () => {
      const onChange = vi.fn();
      const fileQuestion: LearnerQuestion = {
        attemptQuestionId: '10000000-0000-4000-8000-000000000019',
        type: 'FILE_UPLOAD',
        prompt: makePrompt('Upload your code repository zip or pdf design document:'),
        options: [],
        points: '25.000',
        isRequired: true,
        position: 0,
      };

      render(
        <FileUploadQuestion
          question={fileQuestion}
          attemptId={mockIds.attempt}
          workspaceId={mockIds.workspace}
          value={null}
          onChange={onChange}
        />,
      );

      expect(screen.getByTestId('file-upload-question')).toBeInTheDocument();
      expect(screen.getByText(/Upload Submission File/i)).toBeInTheDocument();
      const noteInput = screen.getByTestId('file-upload-note-input');
      fireEvent.change(noteInput, { target: { value: 'Final architecture document attached.' } });
      expect(onChange).toHaveBeenCalledWith(
        { type: 'FILE_UPLOAD', note: 'Final architecture document attached.' },
        [],
      );
    });
  });

  describe('SubmitConfirmationDialog', () => {
    it('warns when unanswered questions exist and triggers submit on confirm', () => {
      const onConfirm = vi.fn();
      const onClose = vi.fn();

      render(
        <SubmitConfirmationDialog
          isOpen={true}
          onClose={onClose}
          onConfirm={onConfirm}
          totalQuestions={5}
          answeredCount={3}
          unansweredCount={2}
          hasUnansweredRequired={true}
        />,
      );

      expect(screen.getByText('Submit Assessment?')).toBeInTheDocument();
      expect(screen.getByText(/Unanswered questions:/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Warning: Some required questions are not answered/i),
      ).toBeInTheDocument();

      const submitBtn = screen.getByTestId('confirm-submit-button');
      fireEvent.click(submitBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('AssessmentStartCard', () => {
    it('renders assessment parameters and starts attempt', () => {
      const onStart = vi.fn();

      render(<AssessmentStartCard assessment={mockAssessment} onStart={onStart} />);

      expect(screen.getByText('Midterm Examination')).toBeInTheDocument();
      expect(screen.getByText('1 attempt')).toBeInTheDocument();
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText(/Calculators permitted/i)).toBeInTheDocument();

      const startBtn = screen.getByTestId('start-attempt-button');
      fireEvent.click(startBtn);
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });

  describe('AssessmentResultView — Grading States', () => {
    it('renders pending grading view when status is GRADING or result is pending', () => {
      render(
        <AssessmentResultView
          enrollmentId={mockIds.enrollment}
          result={null}
          isPendingGrading={true}
        />,
      );

      expect(screen.getByTestId('grading-pending-view')).toBeInTheDocument();
      expect(screen.getByText('Grading in Progress')).toBeInTheDocument();
      expect(screen.getByText(/Your answers have been securely recorded/i)).toBeInTheDocument();
      expect(screen.getByTestId('back-to-course-button')).toBeInTheDocument();
    });

    it('renders released graded result with score, points, and answers feedback', () => {
      const mockResult: ReleasedResult = {
        attemptId: mockIds.attempt,
        assessmentId: mockIds.assessment,
        number: 1,
        status: 'GRADED',
        totalPoints: '50.000',
        awardedPoints: '45.000',
        percent: '90.00',
        passed: true,
        gradedAt: '2026-10-26T12:00:00.000Z',
        answers: [
          {
            attemptQuestionId: mockIds.q1,
            awardedPoints: '5.000',
            isCorrect: true,
            feedback: 'Great job!',
          },
        ],
      };

      render(
        <AssessmentResultView
          enrollmentId={mockIds.enrollment}
          result={mockResult}
          questions={[mockSingleChoiceQuestion]}
        />,
      );

      expect(screen.getByTestId('assessment-result-view')).toBeInTheDocument();
      expect(screen.getByText('Assessment Passed')).toBeInTheDocument();
      expect(screen.getByText('90%')).toBeInTheDocument();
      expect(screen.getByText('45.0 / 50.0')).toBeInTheDocument();
      expect(screen.getByText('Great job!')).toBeInTheDocument();
    });
  });
});
