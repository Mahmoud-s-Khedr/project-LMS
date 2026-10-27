import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GradingQueueView } from './components/grading-queue-view';
import { AttemptGradingView } from './components/attempt-grading-view';
import { VoidDialog } from './components/void-dialog';
import { RegradeDialog } from './components/regrade-dialog';
import { textToRichText } from '@/features/assessment-authoring/utils';
import { AttemptStatus, type StaffAttempt } from './types';
import { Role } from '@lms/shared';
import { api } from '@/lib/api';

const U = {
  workspace: '10000000-0000-4000-8000-000000000001',
  course: '10000000-0000-4000-8000-000000000002',
  enrollment: '30000000-0000-4000-8000-000000000003',
  user: '10000000-0000-4000-8000-000000000004',
  assessment: '10000000-0000-4000-8000-000000000007',
  attempt: '10000000-0000-4000-8000-000000000008',
  attemptQuestion1: '10000000-0000-4000-8000-000000000009',
  attemptQuestion2: '10000000-0000-4000-8000-000000000010',
  question1: '10000000-0000-4000-8000-000000000011',
  question2: '10000000-0000-4000-8000-000000000012',
  questionVersion1: '10000000-0000-4000-8000-000000000013',
  questionVersion2: '10000000-0000-4000-8000-000000000014',
  asset: '20000000-0000-4000-8000-000000000015',
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

const mockStaffAttempt: StaffAttempt = {
  attemptId: U.attempt,
  workspaceId: U.workspace,
  assessmentId: U.assessment,
  enrollmentId: U.enrollment,
  number: 1,
  status: AttemptStatus.SUBMITTED,
  version: 1,
  startedAt: '2026-10-26T10:00:00Z',
  deadlineAt: '2026-10-26T11:00:00Z',
  submittedAt: '2026-10-26T10:45:00Z',
  gradedAt: null,
  totalPoints: '20.000',
  awardedPoints: null,
  percent: null,
  passed: null,
  questions: [
    {
      delivery: {
        attemptQuestionId: U.attemptQuestion1,
        type: 'ESSAY',
        prompt: textToRichText('Explain the 2-phase commit protocol.'),
        options: [],
        points: '10.000',
        isRequired: true,
        position: 0,
      },
      authorVersion: {
        id: U.questionVersion1,
        workspaceId: U.workspace,
        questionId: U.question1,
        version: 1,
        createdAt: '2026-10-26T00:00:00Z',
        payload: {
          type: 'ESSAY',
          prompt: textToRichText('Explain the 2-phase commit protocol.'),
          explanation: textToRichText(
            'Expect mention of prepare, commit, coordinator crash handling.',
          ),
          defaultPoints: '10.000',
          options: [],
          answerKey: {},
          gradingConfig: {},
        },
      },
      answer: {
        attemptQuestionId: U.attemptQuestion1,
        version: 1,
        response: {
          type: 'ESSAY',
          document: textToRichText(
            'In phase 1, the coordinator asks all participants to prepare...',
          ),
        },
        attachmentIds: [],
        savedAt: '2026-10-26T10:30:00Z',
      },
    },
    {
      delivery: {
        attemptQuestionId: U.attemptQuestion2,
        type: 'FILE_UPLOAD',
        prompt: textToRichText('Upload your raft leader election log file.'),
        options: [],
        points: '10.000',
        isRequired: true,
        position: 1,
      },
      authorVersion: {
        id: U.questionVersion2,
        workspaceId: U.workspace,
        questionId: U.question2,
        version: 1,
        createdAt: '2026-10-26T00:00:00Z',
        payload: {
          type: 'FILE_UPLOAD',
          prompt: textToRichText('Upload your raft leader election log file.'),
          explanation: null,
          defaultPoints: '10.000',
          options: [],
          answerKey: {},
          gradingConfig: {},
        },
      },
      answer: {
        attemptQuestionId: U.attemptQuestion2,
        version: 1,
        response: {
          type: 'FILE_UPLOAD',
          note: 'Contains logs from node 1 and node 2.',
        },
        attachmentIds: [U.asset],
        savedAt: '2026-10-26T10:40:00Z',
      },
    },
  ],
  gradeEvents: [],
};

describe('Grading Queue Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders queue attempts and filters by status tabs', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: [
        {
          attemptId: U.attempt,
          workspaceId: U.workspace,
          assessmentId: U.assessment,
          enrollmentId: U.enrollment,
          number: 1,
          status: 'SUBMITTED',
          version: 1,
          startedAt: '2026-10-26T10:00:00Z',
          deadlineAt: null,
          submittedAt: '2026-10-26T10:40:00Z',
          gradedAt: null,
          totalPoints: '20.000',
          awardedPoints: null,
          percent: null,
          passed: null,
        },
      ],
      meta: { limit: 20, hasMore: false, nextCursor: null },
    });

    renderWithQueryClient(
      <GradingQueueView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
      />,
    );

    expect(screen.getByText('Manual Grading Queue')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(new RegExp(U.enrollment.slice(0, 8), 'i'))).toBeInTheDocument();
      expect(screen.getAllByText('Pending Review').length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('AttemptGradingView Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders attempt details, student essay, and file upload attachment', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockStaffAttempt,
    });

    renderWithQueryClient(
      <AttemptGradingView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
        attemptId={U.attempt}
        userRoles={[Role.INSTRUCTOR]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Attempt #1')).toBeInTheDocument();
      expect(screen.getByText(U.enrollment)).toBeInTheDocument();
      expect(screen.getByText(/Explain the 2-phase commit protocol/i)).toBeInTheDocument();
      expect(
        screen.getByText(/In phase 1, the coordinator asks all participants/i),
      ).toBeInTheDocument();
      expect(screen.getByText(new RegExp(U.asset.slice(0, 8), 'i'))).toBeInTheDocument();
    });
  });

  it('triggers secure signed download for uploaded attachment file', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockStaffAttempt,
    });
    const downloadSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        url: 'https://minio.lms.local/download-signed-url',
        expiresAt: '2026-10-26T12:00:00Z',
      },
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithQueryClient(
      <AttemptGradingView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
        attemptId={U.attempt}
        userRoles={[Role.INSTRUCTOR]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /Download/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(
        `/workspaces/${U.workspace}/attempts/${U.attempt}/attachments/${U.asset}/download`,
      );
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://minio.lms.local/download-signed-url',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('submits final grade with documented reason', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockStaffAttempt,
    });
    const submitGradeSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        ...mockStaffAttempt,
        status: AttemptStatus.GRADED,
        awardedPoints: '18.000',
        percent: '90.00',
        passed: true,
      },
    });

    renderWithQueryClient(
      <AttemptGradingView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
        attemptId={U.attempt}
        userRoles={[Role.INSTRUCTOR]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Final Grade/i })).toBeInTheDocument();
    });

    const submitFinalBtn = screen.getByRole('button', { name: /Submit Final Grade/i });
    fireEvent.click(submitFinalBtn);

    await waitFor(() => {
      expect(submitGradeSpy).toHaveBeenCalledWith(
        `/workspaces/${U.workspace}/courses/${U.course}/assessments/${U.assessment}/attempts/${U.attempt}/grades`,
        expect.objectContaining({
          final: true,
          version: 1,
        }),
      );
    });
  });

  it('submits frozen rubric criteria and matching points for a manual answer', async () => {
    const attempt = {
      ...mockStaffAttempt,
      questions: mockStaffAttempt.questions.slice(0, 1),
      rubric: { criteria: [{ id: 'reason', label: 'Reasoning', maxPoints: '10' }] },
    };
    vi.spyOn(api, 'get').mockResolvedValue({ data: attempt });
    const submit = vi.spyOn(api, 'post').mockResolvedValue({ data: attempt });
    renderWithQueryClient(
      <AttemptGradingView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
        attemptId={U.attempt}
        userRoles={[Role.INSTRUCTOR]}
      />,
    );
    const score = await screen.findByLabelText('Reasoning (Max: 10)');
    fireEvent.change(score, { target: { value: '8' } });
    expect(screen.getByLabelText('Awarded Points (Max: 10.000)')).toHaveValue(8);
    fireEvent.click(screen.getByRole('button', { name: /Submit Final Grade/i }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        expect.stringContaining('/grades'),
        expect.objectContaining({
          final: true,
          answers: [
            expect.objectContaining({
              awardedPoints: '8.000',
              rubricScores: [{ criterionId: 'reason', points: '8' }],
            }),
          ],
        }),
      ),
    );
  });

  it('detects stale version conflict and renders StaleGradeAlert', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockStaffAttempt,
    });
    vi.spyOn(api, 'post').mockRejectedValueOnce(
      new Error('Stale grading update: attempt version changed concurrently'),
    );

    renderWithQueryClient(
      <AttemptGradingView
        workspaceId={U.workspace}
        courseId={U.course}
        assessmentId={U.assessment}
        attemptId={U.attempt}
        userRoles={[Role.INSTRUCTOR]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit Final Grade/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit Final Grade/i }));

    await waitFor(() => {
      expect(screen.getByText(/Version Conflict Detected/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reload Latest Submission/i })).toBeInTheDocument();
    });
  });
});

describe('RegradeDialog Component', () => {
  it('requires explicit reason before confirming regrade', async () => {
    const handleConfirm = vi.fn();
    renderWithQueryClient(
      <RegradeDialog open={true} onOpenChange={vi.fn()} onConfirm={handleConfirm} />,
    );

    const submitBtn = screen.getByRole('button', { name: /Confirm Regrade/i });
    expect(submitBtn).toBeDisabled();

    const reasonInput = screen.getByLabelText(/Documented Regrade Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Grade re-evaluated per student inquiry' } });

    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith('Grade re-evaluated per student inquiry');
    });
  });
});

describe('VoidDialog Component & TA Restrictions', () => {
  it('prohibits Teaching Assistants from voiding attempts', () => {
    renderWithQueryClient(
      <VoidDialog
        open={true}
        onOpenChange={vi.fn()}
        userRoles={[Role.TEACHING_ASSISTANT]}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText(/Action Restricted/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Teaching Assistants do not have permission to void student attempts/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm Void/i })).not.toBeInTheDocument();
  });

  it('allows Instructor to void attempt with required documented reason', async () => {
    const handleConfirm = vi.fn();
    renderWithQueryClient(
      <VoidDialog
        open={true}
        onOpenChange={vi.fn()}
        userRoles={[Role.INSTRUCTOR]}
        onConfirm={handleConfirm}
      />,
    );

    expect(screen.getByLabelText(/Documented Void Reason/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /Confirm Void/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Documented Void Reason/i), {
      target: { value: 'Student experienced verified technical outage' },
    });

    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleConfirm).toHaveBeenCalledWith('Student experienced verified technical outage');
    });
  });
});

describe('GradeEvent Answer ID Resolution & Grading API', () => {
  it('resolves GradeEvent.answerId directly when matching attemptQuestionId', async () => {
    const { resolveGradeEventQuestion } = await import('./utils');

    const event = {
      id: '40000000-0000-4000-8000-000000000001',
      workspaceId: U.workspace,
      attemptId: U.attempt,
      answerId: U.attemptQuestion1,
      previousPoints: null,
      awardedPoints: '9.000',
      rubricScores: null,
      feedback: 'Good work',
      reason: 'Standard review',
      isAutomatic: false,
      gradedById: U.user,
      createdAt: '2026-10-26T12:00:00Z',
    };

    const resolved = resolveGradeEventQuestion(event, mockStaffAttempt.questions);
    expect(resolved?.delivery.attemptQuestionId).toBe(U.attemptQuestion1);
  });

  it('resolves seeded/legacy GradeEvent.answerId that differs from attemptQuestionId', async () => {
    const { resolveGradeEventQuestion } = await import('./utils');

    // In seeded attempt, answerId is a distinct UUID (e.g. id('answer:essay'))
    // not matching any attemptQuestionId directly
    const seededAnswerId = '50000000-0000-4000-8000-000000000099';
    const singleManualQuestionAttempt = [mockStaffAttempt.questions[0]!];

    const seededEvent = {
      id: '40000000-0000-4000-8000-000000000002',
      workspaceId: U.workspace,
      attemptId: U.attempt,
      answerId: seededAnswerId,
      previousPoints: '7.000',
      awardedPoints: '8.000',
      rubricScores: null,
      feedback: 'Clarified rubric review',
      reason: 'Manual adjustment',
      isAutomatic: false,
      gradedById: U.user,
      createdAt: '2026-10-26T12:05:00Z',
    };

    const resolved = resolveGradeEventQuestion(seededEvent, singleManualQuestionAttempt);
    expect(resolved?.delivery.attemptQuestionId).toBe(U.attemptQuestion1);
  });

  it('submitAttemptGrades posts grading input to correct endpoint and parses result', async () => {
    const { submitAttemptGrades } = await import('./api');
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockStaffAttempt });

    const gradingInput = {
      version: 1,
      final: true,
      reason: 'Complete evaluation',
      answers: [
        {
          answerId: U.attemptQuestion1,
          awardedPoints: '9.000',
          rubricScores: null,
          feedback: 'Solid',
        },
      ],
    };

    const res = await submitAttemptGrades(
      U.workspace,
      U.course,
      U.assessment,
      U.attempt,
      gradingInput,
    );
    expect(api.post).toHaveBeenCalledWith(
      `/workspaces/${U.workspace}/courses/${U.course}/assessments/${U.assessment}/attempts/${U.attempt}/grades`,
      gradingInput,
    );
    expect(res.attemptId).toBe(U.attempt);
  });

  it('regradeAttempt posts regrade input to correct endpoint', async () => {
    const { regradeAttempt } = await import('./api');
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockStaffAttempt });

    const regradeInput = {
      version: 1,
      final: true,
      reason: 'Grade appeal resolved',
      answers: [
        {
          answerId: U.attemptQuestion1,
          awardedPoints: '10.000',
          rubricScores: null,
          feedback: 'Full credit',
        },
      ],
    };

    const res = await regradeAttempt(U.workspace, U.course, U.assessment, U.attempt, regradeInput);
    expect(api.post).toHaveBeenCalledWith(
      `/workspaces/${U.workspace}/courses/${U.course}/assessments/${U.assessment}/attempts/${U.attempt}/regrade`,
      regradeInput,
    );
    expect(res.attemptId).toBe(U.attempt);
  });

  it('voidAttempt posts void input to correct endpoint', async () => {
    const { voidAttempt } = await import('./api');
    vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockStaffAttempt });

    const res = await voidAttempt(U.workspace, U.course, U.assessment, U.attempt, {
      version: 1,
      reason: 'Technical interruption during attempt window',
    });
    expect(api.post).toHaveBeenCalledWith(
      `/workspaces/${U.workspace}/courses/${U.course}/assessments/${U.assessment}/attempts/${U.attempt}/void`,
      { version: 1, reason: 'Technical interruption during attempt window' },
    );
    expect(res.attemptId).toBe(U.attempt);
  });
});
